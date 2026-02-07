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
    private offlineRecognizer: any = null;
    private onlineRecognizer: any = null;
    private currentModelId: string | null = null;
    private activeStream: any = null;

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
     */
    public async preloadModel(): Promise<boolean> {
        const settings = AppSettingsService.getInstance().getSettings();
        if (!settings.useLocalModel) {
            Logger.info('🦜 [Sherpa] Preload skipped - local model disabled');
            return false;
        }

        const modelId = settings.localModelId;
        const model = PARAKEET_MODELS.find(m => m.id === modelId);
        if (!model) {
            Logger.info('🦜 [Sherpa] Preload skipped - not a Sherpa model');
            return false;
        }

        Logger.info(`🦜 [Sherpa] Preloading model: ${modelId}...`);
        const startTime = Date.now();

        const success = model.isOnline ? this.initOnlineRecognizer(modelId) : this.initOfflineRecognizer(modelId);

        const elapsed = Date.now() - startTime;
        if (success) {
            Logger.success(`🦜 [Sherpa] Model preloaded successfully in ${elapsed}ms`);
        } else {
            Logger.error(`🦜 [Sherpa] Model preload failed after ${elapsed}ms`);
        }

        return success;
    }

    private getModelPaths(modelId: string): {
        encoderPath: string;
        decoderPath: string;
        joinerPath: string;
        tokensPath: string;
        modelPath?: string;
    } | null {
        // Models are stored in appData/models/sherpa/<model-id>/
        const modelsDir = path.join(app.getPath('userData'), 'models', 'sherpa', modelId);
        const model = PARAKEET_MODELS.find(m => m.id === modelId);

        if (!model) return null;

        const tokensPath = path.join(modelsDir, 'tokens.txt');

        if (model.isOnline) {
            // Streaming models have separate encoder/decoder/joiner
            const encoderPath = path.join(modelsDir, 'encoder.onnx');
            const decoderPath = path.join(modelsDir, 'decoder.onnx');
            const joinerPath = path.join(modelsDir, 'joiner.onnx');

            if (fs.existsSync(encoderPath) && fs.existsSync(decoderPath) &&
                fs.existsSync(joinerPath) && fs.existsSync(tokensPath)) {
                return { encoderPath, decoderPath, joinerPath, tokensPath };
            }
        } else {
            // TDT models have separate encoder, decoder, joiner
            const encoderPath = path.join(modelsDir, 'encoder.int8.onnx');
            const decoderPath = path.join(modelsDir, 'decoder.int8.onnx');
            const joinerPath = path.join(modelsDir, 'joiner.int8.onnx');

            if (fs.existsSync(encoderPath) && fs.existsSync(decoderPath) &&
                fs.existsSync(joinerPath) && fs.existsSync(tokensPath)) {
                return { encoderPath, decoderPath, joinerPath, tokensPath };
            }

            // Traditional non-streaming model (single file)
            const modelPath = path.join(modelsDir, 'model.int8.onnx');
            if (fs.existsSync(modelPath) && fs.existsSync(tokensPath)) {
                return { modelPath, tokensPath, encoderPath: '', decoderPath: '', joinerPath: '' };
            }
        }

        return null;
    }

    private initOfflineRecognizer(modelId: string): boolean {
        // If already initialized with valid model, return true
        if (this.offlineRecognizer && this.currentModelId === modelId) {
            return true;
        }

        this.disposeRecognizers();

        const paths = this.getModelPaths(modelId);
        if (!paths) {
            Logger.error(`🦜 [Sherpa] Offline model files not found for ${modelId}`);
            return false;
        }

        try {
            const config: any = {
                featConfig: { sampleRate: 16000, featureDim: 80 },
                modelConfig: {
                    tokens: paths.tokensPath,
                    numThreads: 2,
                    provider: "cpu",
                    debug: false,
                }
            };

            if (paths.encoderPath && paths.decoderPath && paths.joinerPath) {
                config.modelConfig.transducer = {
                    encoder: paths.encoderPath,
                    decoder: paths.decoderPath,
                    joiner: paths.joinerPath,
                };
            } else if (paths.modelPath) {
                config.modelConfig.paraformer = { model: paths.modelPath };
            }

            Logger.info(`🦜 [Sherpa] Initializing offline recognizer: ${modelId}`);
            const sherpaModule = getSherpaOnnx();
            this.offlineRecognizer = new sherpaModule.OfflineRecognizer(config);
            this.currentModelId = modelId;
            return true;
        } catch (error) {
            Logger.error('🦜 [Sherpa] Failed to init offline recognizer:', error);
            return false;
        }
    }

    private initOnlineRecognizer(modelId: string): boolean {
        if (this.onlineRecognizer && this.currentModelId === modelId) {
            return true;
        }

        this.disposeRecognizers();

        const paths = this.getModelPaths(modelId);
        if (!paths) {
            Logger.error(`🦜 [Sherpa] Online model files not found for ${modelId}`);
            return false;
        }

        try {
            const config = {
                featConfig: { sampleRate: 16000, featureDim: 80 },
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
                },
                endpointConfig: {
                    rule1: { forceEndpoint: false, threshold: 2.4 },
                    rule2: { forceEndpoint: false, threshold: 1.2 },
                    rule3: { forceEndpoint: true, threshold: 20.0 },
                }
            };

            Logger.info(`🦜 [Sherpa] Initializing online recognizer: ${modelId}`);
            const sherpaModule = getSherpaOnnx();
            this.onlineRecognizer = new sherpaModule.OnlineRecognizer(config);
            this.currentModelId = modelId;
            return true;
        } catch (error) {
            Logger.error('🦜 [Sherpa] Failed to init online recognizer:', error);
            return false;
        }
    }

    private disposeRecognizers() {
        if (this.offlineRecognizer && typeof this.offlineRecognizer.close === 'function') {
            try { this.offlineRecognizer.close(); } catch (e) { }
        }
        if (this.onlineRecognizer && typeof this.onlineRecognizer.close === 'function') {
            try { this.onlineRecognizer.close(); } catch (e) { }
        }
        this.offlineRecognizer = null;
        this.onlineRecognizer = null;
        this.activeStream = null;
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
        const model = PARAKEET_MODELS.find(m => m.id === modelId);

        if (!model) return null;

        // Use appropriate recognizer based on model type
        const initialized = model.isOnline ? this.initOnlineRecognizer(modelId) : this.initOfflineRecognizer(modelId);
        if (!initialized) return null;

        try {
            Logger.info('🦜 [Sherpa] Preparing audio from file...');
            const samples = await this.prepareAudio(audioFilePath);

            if (!samples) {
                Logger.error('🦜 [Sherpa] Audio preparation failed');
                return null;
            }

            return model.isOnline ? this.runOnlineTranscription(samples) : this.runOfflineTranscription(samples);

        } catch (error) {
            Logger.error('🦜 [Sherpa] Transcription failed:', error);
            return null;
        }
    }

    public async transcribeFromBuffer(audioBuffer: Buffer): Promise<{ text: string; isAssistant: boolean; model: string } | null> {
        const settings = AppSettingsService.getInstance().getSettings();
        if (!settings.useLocalModel) return null;

        const modelId = settings.localModelId;
        const model = PARAKEET_MODELS.find(m => m.id === modelId);

        if (!model) return null;

        const initialized = model.isOnline ? this.initOnlineRecognizer(modelId) : this.initOfflineRecognizer(modelId);
        if (!initialized) return null;

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

            const text = model.isOnline ? this.runOnlineTranscription(samples) : this.runOfflineTranscription(samples);

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

    public async startStreamingTranscription(
        onPartialText?: (text: string) => void,
        onComplete?: (text: string) => void
    ): Promise<{
        sendAudio: (buffer: Buffer) => boolean;
        finish: () => Promise<string>;
        stop: () => Promise<void>
    } | null> {
        const settings = AppSettingsService.getInstance().getSettings();
        if (!settings.useLocalStreaming) {
            Logger.info('🦜 [Sherpa] Streaming skipped - local streaming disabled');
            return null;
        }

        const modelId = settings.localStreamingModelId;
        const model = PARAKEET_MODELS.find(m => m.id === modelId);

        if (!model || !model.isOnline) {
            Logger.warning(`⚠️ [Sherpa] Cannot start streaming: Model ${modelId} is not a streaming model`);
            return null;
        }

        if (!this.initOnlineRecognizer(modelId)) {
            return null;
        }

        try {
            Logger.info('🦜 [Sherpa] Starting online stream...');
            this.activeStream = this.onlineRecognizer.createStream();
            let accumulatedText = '';

            return {
                sendAudio: (buffer: Buffer) => {
                    if (!this.activeStream || !this.onlineRecognizer) return false;

                    try {
                        // Assuming input buffer is 16kHz 16-bit mono PCM (standard for this app)
                        const samples = new Float32Array(buffer.length / 2);
                        for (let i = 0; i < samples.length; i++) {
                            const int16 = buffer.readInt16LE(i * 2);
                            samples[i] = int16 / 32768.0;
                        }

                        this.activeStream.acceptWaveform({ sampleRate: 16000, samples });

                        while (this.onlineRecognizer.isReady(this.activeStream)) {
                            this.onlineRecognizer.decode(this.activeStream);
                        }

                        const result = this.onlineRecognizer.getResult(this.activeStream);
                        if (result?.text && result.text !== accumulatedText) {
                            accumulatedText = result.text;
                            onPartialText?.(accumulatedText);
                        }
                        return true;
                    } catch (e) {
                        Logger.error('🦜 [Sherpa] Stream audio processing failed:', e);
                        return false;
                    }
                },
                finish: async () => {
                    if (!this.activeStream || !this.onlineRecognizer) return accumulatedText;

                    try {
                        this.activeStream.inputFinished();
                        while (this.onlineRecognizer.isReady(this.activeStream)) {
                            this.onlineRecognizer.decode(this.activeStream);
                        }
                        const result = this.onlineRecognizer.getResult(this.activeStream);
                        const finalText = result?.text || accumulatedText;
                        onComplete?.(finalText);
                        this.activeStream = null;
                        return finalText;
                    } catch (e) {
                        Logger.error('🦜 [Sherpa] Stream finish failed:', e);
                        return accumulatedText;
                    }
                },
                stop: async () => {
                    this.activeStream = null;
                    Logger.info('🦜 [Sherpa] Online stream stopped');
                }
            };
        } catch (error) {
            Logger.error('🦜 [Sherpa] Failed to start online stream:', error);
            return null;
        }
    }

    private runOfflineTranscription(samples: Float32Array): string | null {
        try {
            Logger.info(`🦜 [Sherpa] Offline transcribing ${samples.length} samples...`);
            const stream = this.offlineRecognizer.createStream();
            stream.acceptWaveform({ sampleRate: 16000, samples: samples });
            this.offlineRecognizer.decode(stream);
            const result = this.offlineRecognizer.getResult(stream);
            const text = result?.text?.trim() || '';
            Logger.info(`🦜 [Sherpa] Result: "${text}"`);
            return text || null;
        } catch (error) {
            Logger.error('🦜 [Sherpa] Offline transcription failed:', error);
            return null;
        }
    }

    private runOnlineTranscription(samples: Float32Array): string | null {
        try {
            Logger.info(`🦜 [Sherpa] Online transcribing ${samples.length} samples (Batch)...`);
            const stream = this.onlineRecognizer.createStream();
            stream.acceptWaveform({ sampleRate: 16000, samples: samples });
            stream.inputFinished();

            while (this.onlineRecognizer.isReady(stream)) {
                this.onlineRecognizer.decode(stream);
            }

            const result = this.onlineRecognizer.getResult(stream);
            const text = result?.text?.trim() || '';
            Logger.info(`🦜 [Sherpa] Result: "${text}"`);
            return text || null;
        } catch (error) {
            Logger.error('🦜 [Sherpa] Online transcription failed:', error);
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
