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
    private recognizer: any = null;
    private currentModelId: string | null = null;

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

        const success = this.initRecognizer(modelId);

        const elapsed = Date.now() - startTime;
        if (success) {
            Logger.success(`🦜 [Sherpa] Model preloaded successfully in ${elapsed}ms`);
        } else {
            Logger.error(`🦜 [Sherpa] Model preload failed after ${elapsed}ms`);
        }

        return success;
    }

    private getModelPaths(modelId: string): { encoderPath: string; decoderPath: string; joinerPath: string; tokensPath: string } | null {
        // Models are stored in appData/models/sherpa/<model-id>/
        const modelsDir = path.join(app.getPath('userData'), 'models', 'sherpa', modelId);

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

    private initRecognizer(modelId: string): boolean {
        // If already initialized with valid model, return true
        if (this.recognizer && this.currentModelId === modelId) {
            return true;
        }

        // If switching models, dispose old one (if close method exists)
        if (this.recognizer && typeof this.recognizer.close === 'function') {
            try {
                this.recognizer.close();
            } catch (e) {
                // ignore
            }
            this.recognizer = null;
        }

        const paths = this.getModelPaths(modelId);
        if (!paths) {
            Logger.error(`🦜 [Sherpa] Model files not found for ${modelId}`);
            return false;
        }

        try {
            // Sherpa-ONNX configuration for OfflineRecognizer
            // The TDT model uses a Transducer architecture with separate encoder/decoder/joiner
            const config = {
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
                    numThreads: 2,
                    provider: "cpu",
                    debug: false,
                }
            };

            Logger.info(`🦜 [Sherpa] Initializing recognizer with model: ${modelId}`);
            const sherpaModule = getSherpaOnnx();
            this.recognizer = new sherpaModule.OfflineRecognizer(config);
            this.currentModelId = modelId;
            Logger.success('🦜 [Sherpa] Recognizer initialized successfully');
            return true;

        } catch (error) {
            Logger.error('🦜 [Sherpa] Failed to initialize recognizer:', error);
            this.recognizer = null;
            return false;
        }
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

            return this.runTranscription(samples);

        } catch (error) {
            Logger.error('🦜 [Sherpa] Transcription failed:', error);
            return null;
        }
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

        try {
            Logger.info(`🦜 [Sherpa] Preparing audio from buffer (${audioBuffer.length} bytes)...`);

            // Create temp file for robust conversion
            const tempPath = path.join(app.getPath('temp'), `sherpa_buffer_${Date.now()}.wav`);

            const wavBuffer = this.pcmToWav(audioBuffer, 16000, 1, 16);
            fs.writeFileSync(tempPath, wavBuffer);

            const samples = await this.prepareAudio(tempPath);
            fs.unlinkSync(tempPath);

            if (!samples) {
                Logger.info('🦜 [Sherpa] No samples after audio preparation');
                return null;
            }

            const text = this.runTranscription(samples);

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

    private runTranscription(samples: Float32Array): string | null {
        try {
            Logger.info(`🦜 [Sherpa] Transcribing ${samples.length} samples...`);

            const stream = this.recognizer.createStream();

            // API expects: stream.acceptWaveform({sampleRate: number, samples: Float32Array})
            stream.acceptWaveform({ sampleRate: 16000, samples: samples });

            this.recognizer.decode(stream);

            const result = this.recognizer.getResult(stream);
            const text = result?.text?.trim() || '';

            // Note: stream.free() doesn't exist in this sherpa-onnx-node version
            // The stream will be garbage collected automatically

            Logger.info(`🦜 [Sherpa] Result: "${text}"`);
            return text || null;
        } catch (error) {
            Logger.error('🦜 [Sherpa] Transcription failed:', error);
            return null;
        }
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
