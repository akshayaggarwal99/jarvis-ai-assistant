import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { Logger } from '../core/logger';
import { AppSettingsService } from '../services/app-settings-service';
import { STREAMING_MODELS, findSherpaModel } from './sherpa-models';

// Lazy-load sherpa-onnx-node to handle native module path issues. Same
// resolution strategy as the offline transcriber — we share the dylib
// loading hack so packaged builds can find sherpa-onnx-darwin-{arch}.
let sherpa: any = null;

function getSherpaOnnx(): any {
    if (sherpa) return sherpa;

    const isPackaged = app.isPackaged;
    const appPath = app.getAppPath();

    let baseNodeModules: string;
    if (isPackaged) {
        baseNodeModules = path.join(appPath + '.unpacked', 'node_modules');
    } else {
        baseNodeModules = path.join(__dirname, 'node_modules');
    }

    const arch = process.arch;
    const sherpaLibPath = path.join(baseNodeModules, `sherpa-onnx-darwin-${arch}`);

    if (fs.existsSync(sherpaLibPath)) {
        const existingPath = process.env.DYLD_LIBRARY_PATH || '';
        process.env.DYLD_LIBRARY_PATH = sherpaLibPath + (existingPath ? ':' + existingPath : '');
    }

    const Module = require('module');
    const originalPaths = Module._nodeModulePaths;
    Module._nodeModulePaths = function (from: string) {
        return [baseNodeModules].concat(originalPaths.call(this, from));
    };

    try {
        const nodeRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
        sherpa = nodeRequire('sherpa-onnx-node');
        Logger.info('🦅 [SherpaOnline] Loaded sherpa-onnx-node');
    } catch (error) {
        Logger.error('🦅 [SherpaOnline] Failed to load sherpa-onnx-node:', error);
        throw error;
    } finally {
        Module._nodeModulePaths = originalPaths;
    }

    return sherpa;
}

declare const __non_webpack_require__: NodeRequire | undefined;

/**
 * Live-transcription wrapper around sherpa-onnx OnlineRecognizer.
 *
 * Lifecycle for a single dictation:
 *   startSession()        — creates a fresh OnlineStream, resets state
 *   feedAudio(buffer)     — converts PCM16 → Float32, accepts waveform,
 *                            drains decode loop, emits onPartial(text)
 *                            whenever the transcript changes
 *   finalize()            — flushes remaining audio with inputFinished(),
 *                            returns final text
 *   cancel()              — drops the stream without finalizing
 *
 * The recognizer itself is singleton-and-reused across sessions (loading
 * the ONNX model costs ~1–2s); only the per-utterance stream is fresh.
 */
export class SherpaOnlineTranscriber {
    private static instance: SherpaOnlineTranscriber;
    private recognizer: any = null;
    private currentModelId: string | null = null;
    private activeStream: any = null;
    private lastEmittedText: string = '';

    public static getInstance(): SherpaOnlineTranscriber {
        if (!SherpaOnlineTranscriber.instance) {
            SherpaOnlineTranscriber.instance = new SherpaOnlineTranscriber();
        }
        return SherpaOnlineTranscriber.instance;
    }

    private constructor() {}

    public async preloadModel(): Promise<boolean> {
        const settings = AppSettingsService.getInstance().getSettings();
        if (!settings.useLocalModel) return false;

        const modelId = settings.localModelId;
        const isStreaming = STREAMING_MODELS.some(m => m.id === modelId);
        if (!isStreaming) return false;

        Logger.info(`🦅 [SherpaOnline] Preloading streaming model: ${modelId}`);
        const start = Date.now();
        const ok = this.initRecognizer(modelId);
        Logger.info(`🦅 [SherpaOnline] Preload ${ok ? 'success' : 'failed'} in ${Date.now() - start}ms`);
        return ok;
    }

    public isStreamingModel(modelId: string): boolean {
        return STREAMING_MODELS.some(m => m.id === modelId);
    }

    private getModelPaths(modelId: string): { encoder: string; decoder: string; joiner: string; tokens: string } | null {
        const dir = path.join(app.getPath('userData'), 'sherpa-models', modelId);
        const candidates = [
            { encoder: 'encoder.onnx', decoder: 'decoder.onnx', joiner: 'joiner.onnx' },
            { encoder: 'encoder.int8.onnx', decoder: 'decoder.int8.onnx', joiner: 'joiner.int8.onnx' }
        ];
        for (const c of candidates) {
            const paths = {
                encoder: path.join(dir, c.encoder),
                decoder: path.join(dir, c.decoder),
                joiner: path.join(dir, c.joiner),
                tokens: path.join(dir, 'tokens.txt')
            };
            if (fs.existsSync(paths.encoder) && fs.existsSync(paths.decoder) &&
                fs.existsSync(paths.joiner) && fs.existsSync(paths.tokens)) {
                return paths;
            }
        }
        return null;
    }

    private initRecognizer(modelId: string): boolean {
        if (this.recognizer && this.currentModelId === modelId) return true;

        this.disposeRecognizer();

        const paths = this.getModelPaths(modelId);
        if (!paths) {
            Logger.error(`🦅 [SherpaOnline] Model files not found for ${modelId}`);
            return false;
        }

        try {
            const config = {
                featConfig: { sampleRate: 16000, featureDim: 80 },
                modelConfig: {
                    transducer: {
                        encoder: paths.encoder,
                        decoder: paths.decoder,
                        joiner: paths.joiner
                    },
                    tokens: paths.tokens,
                    numThreads: 2,
                    provider: 'cpu',
                    debug: false
                }
            };

            const mod = getSherpaOnnx();
            this.recognizer = new mod.OnlineRecognizer(config);
            this.currentModelId = modelId;
            Logger.success(`🦅 [SherpaOnline] OnlineRecognizer initialized for ${modelId}`);
            return true;
        } catch (err) {
            Logger.error('🦅 [SherpaOnline] Failed to init OnlineRecognizer:', err);
            this.recognizer = null;
            this.currentModelId = null;
            return false;
        }
    }

    public startSession(): boolean {
        const settings = AppSettingsService.getInstance().getSettings();
        if (!settings.useLocalModel) return false;
        const modelId = settings.localModelId;
        if (!this.isStreamingModel(modelId)) return false;
        if (!this.initRecognizer(modelId)) return false;

        // Free any previous stream that wasn't finalized cleanly
        this.releaseActiveStream();

        try {
            this.activeStream = this.recognizer.createStream();
            this.lastEmittedText = '';
            Logger.info('🦅 [SherpaOnline] Session started — fresh OnlineStream');
            return true;
        } catch (err) {
            Logger.error('🦅 [SherpaOnline] Failed to create stream:', err);
            this.activeStream = null;
            return false;
        }
    }

    /**
     * Feed a PCM16 mono 16kHz buffer chunk. Returns the latest cumulative
     * transcript text (or '' if unchanged from prior call). Caller passes
     * the new text to `onPartial` to keep the UI in sync.
     */
    public feedAudio(audioBuffer: Buffer): string {
        if (!this.recognizer || !this.activeStream) return '';
        const samples = pcm16ToFloat32(audioBuffer);
        if (!samples) return '';

        try {
            this.activeStream.acceptWaveform({ sampleRate: 16000, samples });
            while (this.recognizer.isReady(this.activeStream)) {
                this.recognizer.decode(this.activeStream);
            }
            const result = this.recognizer.getResult(this.activeStream);
            const text = result?.text?.trim() || '';
            if (text && text !== this.lastEmittedText) {
                this.lastEmittedText = text;
                return text;
            }
            return '';
        } catch (err) {
            Logger.error('🦅 [SherpaOnline] feedAudio error, recycling recognizer:', err);
            this.disposeRecognizer();
            return '';
        }
    }

    public async finalize(): Promise<string> {
        if (!this.recognizer || !this.activeStream) return '';
        try {
            this.activeStream.inputFinished();
            while (this.recognizer.isReady(this.activeStream)) {
                this.recognizer.decode(this.activeStream);
            }
            const result = this.recognizer.getResult(this.activeStream);
            const text = result?.text?.trim() || '';
            Logger.info(`🦅 [SherpaOnline] Finalized: "${text}"`);
            return text;
        } catch (err) {
            Logger.error('🦅 [SherpaOnline] finalize error:', err);
            return this.lastEmittedText;
        } finally {
            this.releaseActiveStream();
        }
    }

    public cancel(): void {
        this.releaseActiveStream();
    }

    private releaseActiveStream(): void {
        if (!this.activeStream) return;
        try {
            if (typeof this.activeStream.free === 'function') this.activeStream.free();
            else if (typeof this.activeStream.close === 'function') this.activeStream.close();
        } catch {
            /* ignore — handle may already be released */
        }
        this.activeStream = null;
        this.lastEmittedText = '';
    }

    private disposeRecognizer(): void {
        this.releaseActiveStream();
        if (!this.recognizer) return;
        try {
            if (typeof this.recognizer.close === 'function') this.recognizer.close();
            else if (typeof this.recognizer.free === 'function') this.recognizer.free();
        } catch {
            /* ignore */
        }
        this.recognizer = null;
        this.currentModelId = null;
    }
}

function pcm16ToFloat32(audioBuffer: Buffer): Float32Array | null {
    if (!audioBuffer || audioBuffer.length < 2) return null;
    const aligned = audioBuffer.length - (audioBuffer.length % 2);
    if (aligned < 2) return null;
    const count = aligned / 2;
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        out[i] = audioBuffer.readInt16LE(i * 2) / 32768.0;
    }
    return out;
}
