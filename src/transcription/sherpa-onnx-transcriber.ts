import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import ffmpeg from 'fluent-ffmpeg';
import { Logger } from '../core/logger';
import { AppSettingsService } from '../services/app-settings-service';
import { PARAKEET_MODELS } from './sherpa-models';

// Lazy-load sherpa-onnx-node to handle native module path issues
let sherpa: any = null;

function getSherpaOnnx(): any {
    if (sherpa) return sherpa;

    // Detect if we're running in a packaged app
    const isPackaged = app.isPackaged;
    const appPath = app.getAppPath();

    let baseNodeModules;
    if (isPackaged) {
        // In packaged app, native modules are in app.asar.unpacked/node_modules
        // appPath points to Contents/Resources/app.asar
        baseNodeModules = path.join(appPath + '.unpacked', 'node_modules');
    } else {
        // In dev, they are in dist/node_modules (relative to __dirname)
        baseNodeModules = path.join(__dirname, 'node_modules');
    }

    const arch = process.arch; // arm64 or x64
    const sherpaLibPath = path.join(baseNodeModules, `sherpa-onnx-darwin-${arch}`);

    Logger.info(`🦜 [Sherpa] Module resolution base: ${baseNodeModules}`);
    Logger.info(`🦜 [Sherpa] Library path: ${sherpaLibPath}`);

    // Set library paths before requiring (for dylib loading)
    if (fs.existsSync(sherpaLibPath)) {
        const existingPath = process.env.DYLD_LIBRARY_PATH || '';
        process.env.DYLD_LIBRARY_PATH = sherpaLibPath + (existingPath ? ':' + existingPath : '');
    } else {
        Logger.warn(`⚠️ [Sherpa] Native library path not found: ${sherpaLibPath}`);
    }

    // Add node_modules to Node's module resolution paths
    // @ts-ignore - accessing internal Node.js module API
    const Module = require('module');
    const originalPaths = Module._nodeModulePaths;
    Module._nodeModulePaths = function (from: string) {
        return [baseNodeModules].concat(originalPaths.call(this, from));
    };

    try {
        // Use __non_webpack_require__ to bypass webpack's bundling
        const nodeRequire = typeof __non_webpack_require__ !== 'undefined'
            ? __non_webpack_require__
            : require;
        sherpa = nodeRequire('sherpa-onnx-node');
        Logger.info('🦜 [Sherpa] Successfully loaded sherpa-onnx-node');
    } catch (error) {
        Logger.error('🦜 [Sherpa] Failed to load sherpa-onnx-node:', error);
        throw error;
    } finally {
        // Restore original paths
        Module._nodeModulePaths = originalPaths;
    }

    return sherpa;
}

// Declare __non_webpack_require__ for TypeScript
declare const __non_webpack_require__: NodeRequire | undefined;

export class SherpaOnnxTranscriber {
    private static instance: SherpaOnnxTranscriber;
    // Two recognizers stay warm simultaneously to avoid the ~2s
    // dispose/reinit churn on every long dictation:
    //   recognizerFast  → CoreML EP (or platform-preferred), short audio
    //   recognizerSafe  → CPU EP, chunked long-audio decode
    // ~1.2GB total RAM for Parakeet TDT 0.6B int8 × 2. Acceptable on
    // M-series Macs with ≥16GB. CoreML EP crashes on chunked decode
    // (Context leak in MultiArrayBuffer alloc); CPU EP handles long
    // audio reliably but is slower per token, so we route by length.
    private recognizerFast: any = null;
    private recognizerSafe: any = null;
    private currentModelId: string | null = null;
    // Legacy single-slot alias used by older internal helpers
    // (runTranscription, getResult). Always points at the most recently
    // initialized recognizer; chunked path overrides with its own.
    private recognizer: any = null;

    public static getInstance(): SherpaOnnxTranscriber {
        if (!SherpaOnnxTranscriber.instance) {
            SherpaOnnxTranscriber.instance = new SherpaOnnxTranscriber();
        }
        return SherpaOnnxTranscriber.instance;
    }

    private constructor() {
        // Set ffmpeg path for fluent-ffmpeg
        if (app.isPackaged) {
            const ffmpegPath = path.join(process.resourcesPath, 'ffmpeg');
            if (fs.existsSync(ffmpegPath)) {
                ffmpeg.setFfmpegPath(ffmpegPath);
                Logger.info(`🦜 [Sherpa] Using bundled ffmpeg: ${ffmpegPath}`);
            } else {
                Logger.warning(`⚠️ [Sherpa] Bundled ffmpeg not found at: ${ffmpegPath}`);
            }
        }
    }

    /**
     * Preload the model during app startup to avoid slow first transcription.
     * Call this early in the app lifecycle (e.g., in main.ts after app is ready).
     */
    public async preloadModel(): Promise<boolean> {
        const settings = AppSettingsService.getInstance().getSettings();
        if (!settings.useLocalModel) {
            Logger.info('🦜 [Sherpa] Preload skipped - local model disabled');
            return false;
        }

        const modelId = settings.localModelId;
        const isParakeet = PARAKEET_MODELS.some(m => m.id === modelId);
        if (!isParakeet) {
            Logger.info('🦜 [Sherpa] Preload skipped - not a Parakeet model');
            return false;
        }

        Logger.info(`🦜 [Sherpa] Preloading model: ${modelId}...`);
        const startTime = Date.now();

        // Warm BOTH slots: fast (CoreML) for short audio, safe (CPU) for
        // long chunked decode. Both at startup so the first long-dictation
        // doesn't pay init cost on top of decode.
        const fastOk = this.initRecognizer(modelId, 'fast');
        const safeOk = this.initRecognizer(modelId, 'safe');
        const success = fastOk; // primary slot is fast

        const elapsed = Date.now() - startTime;
        if (success) {
            Logger.success(`🦜 [Sherpa] Model preloaded successfully in ${elapsed}ms`);
        } else {
            Logger.error(`🦜 [Sherpa] Model preload failed after ${elapsed}ms`);
        }

        return success;
    }

    private getModelPaths(modelId: string): { encoderPath: string; decoderPath: string; joinerPath: string; tokensPath: string } | null {
        // Models are stored in appData/sherpa-models/<model-id>/
        const modelsDir = path.join(app.getPath('userData'), 'sherpa-models', modelId);

        // TDT models have separate encoder, decoder, joiner files
        const encoderPath = path.join(modelsDir, 'encoder.int8.onnx');
        const decoderPath = path.join(modelsDir, 'decoder.int8.onnx');
        const joinerPath = path.join(modelsDir, 'joiner.int8.onnx');
        const tokensPath = path.join(modelsDir, 'tokens.txt');

        const allExist = fs.existsSync(encoderPath) && fs.existsSync(decoderPath) &&
            fs.existsSync(joinerPath) && fs.existsSync(tokensPath);

        if (allExist) {
            return { encoderPath, decoderPath, joinerPath, tokensPath };
        }
        return null;
    }

    private initRecognizer(modelId: string, mode: 'fast' | 'safe' = 'fast'): boolean {
        // Skip if requested slot already holds a recognizer for this model
        const existing = mode === 'safe' ? this.recognizerSafe : this.recognizerFast;
        if (existing && this.currentModelId === modelId) {
            this.recognizer = existing;
            return true;
        }

        // If switching models entirely, drop both slots
        if (this.currentModelId && this.currentModelId !== modelId) {
            this.disposeAll();
        }

        const paths = this.getModelPaths(modelId);
        if (!paths) {
            Logger.error(`🦜 [Sherpa] Model files not found for ${modelId}`);
            return false;
        }

        const cores = require('os').cpus().length || 4;
        const threadCount = Math.max(2, Math.min(6, Math.floor(cores / 2)));

        // Provider per mode:
        //   fast (short audio): platform-preferred (CoreML on darwin) for ANE perf
        //   safe (long audio): CPU EP — CoreML crashes on chunked decode with
        //     "Context leak detected, CoreAnalytics returned false" → SIGTRAP
        const platform = process.platform;
        const platformPreferred =
            platform === 'darwin' ? 'coreml' :
            platform === 'linux' || platform === 'win32' ? 'xnnpack' :
            'cpu';
        const targetProvider = mode === 'safe' ? 'cpu' : platformPreferred;

        const buildConfig = (provider: string) => ({
            featConfig: {
                sampleRate: 16000,
                featureDim: 80,
            },
            modelConfig: {
                transducer: {
                    encoder: paths.encoderPath,
                    decoder: paths.decoderPath,
                    joiner: paths.joinerPath,
                },
                tokens: paths.tokensPath,
                numThreads: threadCount,
                provider,
                debug: false,
            }
        });

        const sherpaModule = getSherpaOnnx();

        for (const provider of [targetProvider, 'cpu']) {
            try {
                Logger.info(`🦜 [Sherpa] Initializing ${mode} recognizer (${provider}, ${threadCount} threads) for ${modelId}`);
                const instance = new sherpaModule.OfflineRecognizer(buildConfig(provider));
                if (mode === 'safe') {
                    this.recognizerSafe = instance;
                } else {
                    this.recognizerFast = instance;
                }
                this.recognizer = instance;
                this.currentModelId = modelId;
                Logger.success(`🦜 [Sherpa] ${mode} recognizer ready via ${provider}`);
                return true;
            } catch (error) {
                Logger.warn(`🦜 [Sherpa] ${mode} init via ${provider} failed: ${error instanceof Error ? error.message : String(error)}`);
                if (provider === 'cpu') {
                    Logger.error(`🦜 [Sherpa] All providers exhausted for ${mode} slot`);
                    return false;
                }
            }
        }
        return false;
    }

    private disposeAll(): void {
        for (const slot of ['recognizerFast', 'recognizerSafe'] as const) {
            const r = (this as any)[slot];
            if (r && typeof r.close === 'function') {
                try { r.close(); } catch { /* ignore */ }
            }
            (this as any)[slot] = null;
        }
        this.recognizer = null;
        this.currentModelId = null;
    }

    /**
     * Resample audio to 16kHz mono using ffmpeg (Sherpa requires 16k 16-bit mono)
     */
    private async prepareAudio(inputPath: string): Promise<Float32Array | null> {
        return new Promise((resolve) => {
            // For simplicity, we can use ffmpeg to read and resample, then return the buffer
            // However, fluent-ffmpeg usually writes to file/stream.
            // We can write to a temporary wav file.
            const tempPath = path.join(app.getPath('temp'), `sherpa_temp_${Date.now()}.wav`);

            ffmpeg(inputPath)
                .toFormat('wav')
                .audioChannels(1)
                .audioFrequency(16000)
                .on('error', (err) => {
                    Logger.error('🦜 [Sherpa] FFmpeg error:', err);
                    resolve(null);
                })
                .on('end', () => {
                    // Read the wav file
                    try {
                        const wavBuffer = fs.readFileSync(tempPath);
                        // Parse WAV header to get samples
                        // Simple WAV parsing: skip 44 bytes header (standard canonical wav)
                        const samplesBuffer = wavBuffer.subarray(44);
                        const samples = new Float32Array(samplesBuffer.length / 2);
                        for (let i = 0; i < samples.length; i++) {
                            // Convert 16-bit PCM to Float32 [-1, 1]
                            const int16 = samplesBuffer.readInt16LE(i * 2);
                            samples[i] = int16 / 32768.0;
                        }

                        fs.unlinkSync(tempPath); // Clean up
                        resolve(samples);
                    } catch (e) {
                        Logger.error('🦜 [Sherpa] Error reading temp wav:', e);
                        resolve(null);
                    }
                })
                .save(tempPath);
        });
    }

    public async transcribe(audioFilePath: string): Promise<string | null> {
        const settings = AppSettingsService.getInstance().getSettings();
        if (!settings.useLocalModel) return null;

        const modelId = settings.localModelId;
        const isParakeet = PARAKEET_MODELS.some(m => m.id === modelId);

        if (!isParakeet) {
            // Not a parakeet model, so this transcriber shouldn't handle it
            return null;
        }

        if (!this.initRecognizer(modelId)) {
            return null;
        }

        try {
            Logger.info('🦜 [Sherpa] Preparing audio from file...');
            const samples = await this.prepareAudio(audioFilePath);

            if (!samples) {
                Logger.error('🦜 [Sherpa] Audio preparation failed');
                return null;
            }

            return await this.runTranscription(samples);

        } catch (error) {
            Logger.error('🦜 [Sherpa] Transcription failed:', error);
            return null;
        }
    }

    /**
     * Warm a specific offline Parakeet model regardless of what the user has
     * selected as the active local model. Used for hybrid-mode preload so
     * the first re-decode after Fn-up doesn't pay the ONNX init cost.
     */
    public preloadModelById(modelId: string): boolean {
        const isParakeet = PARAKEET_MODELS.some(m => m.id === modelId);
        if (!isParakeet) return false;
        const fastOk = this.initRecognizer(modelId, 'fast');
        this.initRecognizer(modelId, 'safe'); // best-effort warm both
        return fastOk;
    }

    /**
     * Hybrid-mode entry point: bypasses the Settings.localModelId check so
     * the caller can re-decode buffered audio through a specific offline
     * Parakeet model (typically Parakeet TDT 0.6B) even when the user has a
     * different model selected as their "live" choice (e.g. a streaming
     * Fast Conformer). Same chunking + recycle logic as transcribeFromBuffer.
     */
    public async transcribeBufferWithModel(audioBuffer: Buffer, modelId: string): Promise<{ text: string; isAssistant: boolean; model: string } | null> {
        const isParakeet = PARAKEET_MODELS.some(m => m.id === modelId);
        if (!isParakeet) return null;
        if (!this.initRecognizer(modelId)) return null;
        return this.runBufferDecode(audioBuffer, modelId);
    }

    public async transcribeFromBuffer(audioBuffer: Buffer): Promise<{ text: string; isAssistant: boolean; model: string } | null> {
        const settings = AppSettingsService.getInstance().getSettings();
        if (!settings.useLocalModel) return null;

        const modelId = settings.localModelId;
        const isParakeet = PARAKEET_MODELS.some(m => m.id === modelId);

        if (!isParakeet) return null;

        if (!this.initRecognizer(modelId)) {
            return null;
        }

        return this.runBufferDecode(audioBuffer, modelId);
    }

    private async runBufferDecode(audioBuffer: Buffer, modelId: string): Promise<{ text: string; isAssistant: boolean; model: string } | null> {
        try {
            Logger.info(`🦜 [Sherpa] Preparing audio from buffer (${audioBuffer.length} bytes)...`);

            const samples = this.pcm16MonoToFloat32(audioBuffer);

            if (!samples) {
                Logger.info('🦜 [Sherpa] No samples after audio preparation');
                return null;
            }

            // Long-audio guard + provider routing:
            //   Short audio → recognizerFast (CoreML/ANE)
            //   Long audio  → recognizerSafe (CPU, chunked)
            // Both stay warm in parallel — no dispose/reinit churn between
            // dictations. ~1.2GB combined RAM cost on Parakeet TDT 0.6B.
            const MAX_SAMPLES_PER_DECODE = 30 * 16000; // 30 s of 16 kHz audio
            const needsChunking = samples.length > MAX_SAMPLES_PER_DECODE;

            // Ensure the right slot is warm and point this.recognizer at it
            const mode = needsChunking ? 'safe' : 'fast';
            if (!this.initRecognizer(modelId, mode)) return null;
            // initRecognizer already set this.recognizer to the right slot

            const text = needsChunking
                ? await this.runChunkedTranscription(samples, MAX_SAMPLES_PER_DECODE)
                : await this.runTranscription(samples);

            // After a chunked decode, point this.recognizer back at the fast
            // slot so the next short call uses CoreML without a swap step.
            if (needsChunking && this.recognizerFast) {
                this.recognizer = this.recognizerFast;
            }

            if (text !== null) {
                return {
                    text,
                    isAssistant: false,
                    model: modelId
                };
            }
            return null;

        } catch (error) {
            Logger.error('🦜 [Sherpa] Buffer transcription failed:', error);
            return null;
        }
    }

    private async runChunkedTranscription(samples: Float32Array, chunkSize: number): Promise<string | null> {
        const totalChunks = Math.ceil(samples.length / chunkSize);
        Logger.info(`🦜 [Sherpa] Long audio (${(samples.length / 16000).toFixed(1)}s) → ${totalChunks} chunks of ${(chunkSize / 16000).toFixed(0)}s`);
        const pieces: string[] = [];
        for (let i = 0; i < samples.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, samples.length);
            const chunk = samples.subarray(i, end);
            const text = await this.runTranscription(chunk);
            if (text && text.trim()) pieces.push(text.trim());
        }
        return pieces.length > 0 ? pieces.join(' ') : null;
    }

    private pcm16MonoToFloat32(audioBuffer: Buffer): Float32Array | null {
        if (!audioBuffer || audioBuffer.length < 2) {
            return null;
        }

        const alignedLength = audioBuffer.length - (audioBuffer.length % 2);
        if (alignedLength < 2) {
            return null;
        }

        const sampleCount = alignedLength / 2;
        const samples = new Float32Array(sampleCount);

        for (let i = 0; i < sampleCount; i++) {
            const int16 = audioBuffer.readInt16LE(i * 2);
            samples[i] = int16 / 32768.0;
        }

        Logger.info(`🦜 [Sherpa][Diagnostics] Converted PCM buffer to ${sampleCount} float samples`);
        return samples;
    }

    private async runTranscription(samples: Float32Array): Promise<string | null> {
        const durationSec = samples.length / 16000;
        let stream: any = null;
        try {
            Logger.info(`🦜 [Sherpa] Transcribing ${samples.length} samples (${durationSec.toFixed(1)}s)...`);

            stream = this.recognizer.createStream();
            stream.acceptWaveform({ sampleRate: 16000, samples: samples });

            // Use decodeAsync to avoid blocking the event loop on long utterances.
            // The sync `decode()` was freezing the main process for seconds on
            // multi-second audio, starving IPC and audio-capture callbacks.
            if (typeof this.recognizer.decodeAsync === 'function') {
                await this.recognizer.decodeAsync(stream);
            } else {
                this.recognizer.decode(stream);
            }

            const result = this.recognizer.getResult(stream);
            const text = result?.text?.trim() || '';

            Logger.info(`🦜 [Sherpa] Result: "${text}"`);
            return text || null;
        } catch (error) {
            // Recognizer may be in a corrupted state after a native error.
            // Drop it so the next call rebuilds a fresh one instead of
            // looping forever on a dead handle.
            // Native error → state could be corrupted in either slot.
            // Drop both; both will rebuild on next call. Safer than
            // leaving the bad recognizer in place and looping.
            Logger.error('🦜 [Sherpa] Transcription failed, dropping both recognizer slots:', error);
            this.disposeAll();
            return null;
        } finally {
            // Release the per-utterance stream's native handle promptly.
            // ONNX activations for long audio can be hundreds of MB; relying on
            // GC alone can leak across a session.
            if (stream) {
                try {
                    if (typeof stream.free === 'function') stream.free();
                    else if (typeof stream.close === 'function') stream.close();
                } catch (e) {
                    // ignore — handle may already be released
                }
            }
        }
    }

    // Legacy single-slot dispose. Kept as alias for any old callers; new
    // code paths should use disposeAll() which drops both slots.
    private disposeRecognizer(): void {
        this.disposeAll();
    }

    /**
     * Helper to create WAV header for PCM data
     */
    private pcmToWav(pcmBuffer: Buffer, sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = pcmBuffer.length;
        const headerSize = 44;
        const fileSize = headerSize + dataSize - 8;

        const wavBuffer = Buffer.alloc(headerSize + dataSize);

        wavBuffer.write('RIFF', 0);
        wavBuffer.writeUInt32LE(fileSize, 4);
        wavBuffer.write('WAVE', 8);
        wavBuffer.write('fmt ', 12);
        wavBuffer.writeUInt32LE(16, 16);
        wavBuffer.writeUInt16LE(1, 20);
        wavBuffer.writeUInt16LE(numChannels, 22);
        wavBuffer.writeUInt32LE(sampleRate, 24);
        wavBuffer.writeUInt32LE(byteRate, 28);
        wavBuffer.writeUInt16LE(blockAlign, 32);
        wavBuffer.writeUInt16LE(bitsPerSample, 34);
        wavBuffer.write('data', 36);
        wavBuffer.writeUInt32LE(dataSize, 40);
        pcmBuffer.copy(wavBuffer, 44);

        return wavBuffer;
    }
}
