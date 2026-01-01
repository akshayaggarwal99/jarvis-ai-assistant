import { Logger } from '../core/logger';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';

// Module-level state for model management
let whisperInstance: any = null;
let currentModelId: string | null = null;

// Available Whisper models with their characteristics
export interface WhisperModel {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  description: string;
  speed: 'fastest' | 'fast' | 'medium' | 'slow';
  accuracy: 'basic' | 'good' | 'great' | 'best';
  url: string;
}

export const WHISPER_MODELS: WhisperModel[] = [
  {
    id: 'tiny.en',
    name: 'Tiny (English)',
    size: '75 MB',
    sizeBytes: 75_000_000,
    description: 'Fastest, English only',
    speed: 'fastest',
    accuracy: 'basic',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin'
  },
  {
    id: 'tiny',
    name: 'Tiny (Multilingual)',
    size: '75 MB',
    sizeBytes: 75_000_000,
    description: 'Fastest, supports multiple languages',
    speed: 'fastest',
    accuracy: 'basic',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin'
  },
  {
    id: 'base.en',
    name: 'Base (English)',
    size: '142 MB',
    sizeBytes: 142_000_000,
    description: 'Fast, English only, better accuracy',
    speed: 'fast',
    accuracy: 'good',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin'
  },
  {
    id: 'base',
    name: 'Base (Multilingual)',
    size: '142 MB',
    sizeBytes: 142_000_000,
    description: 'Fast, supports multiple languages',
    speed: 'fast',
    accuracy: 'good',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
  },
  {
    id: 'small.en',
    name: 'Small (English)',
    size: '466 MB',
    sizeBytes: 466_000_000,
    description: 'Good balance of speed and accuracy',
    speed: 'medium',
    accuracy: 'great',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
  },
  {
    id: 'small',
    name: 'Small (Multilingual)',
    size: '466 MB',
    sizeBytes: 466_000_000,
    description: 'Good balance, multiple languages',
    speed: 'medium',
    accuracy: 'great',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  }
];

// Get model by ID
export function getWhisperModel(modelId: string): WhisperModel | undefined {
  return WHISPER_MODELS.find(m => m.id === modelId);
}

/**
 * Local Whisper Transcriber using whisper.cpp via whisper-node-addon
 * Provides fast, offline transcription with model selection
 */
export class LocalWhisperTranscriber {
  private modelsDir: string;

  constructor() {
    // Set model cache directory in app data
    this.modelsDir = path.join(app.getPath('userData'), 'models', 'whisper');

    // Ensure models directory exists
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  /**
   * Get the path to a model file
   */
  getModelPath(modelId: string): string {
    return path.join(this.modelsDir, `ggml-${modelId}.bin`);
  }

  /**
   * Check if a specific model is downloaded
   */
  isModelDownloaded(modelId: string): boolean {
    const modelPath = this.getModelPath(modelId);
    return fs.existsSync(modelPath);
  }

  /**
   * Get list of downloaded models
   */
  getDownloadedModels(): string[] {
    return WHISPER_MODELS
      .filter(m => this.isModelDownloaded(m.id))
      .map(m => m.id);
  }

  /**
   * Download a model with progress callback
   */
  async downloadModel(
    modelId: string,
    onProgress?: (percent: number, downloadedMB: number, totalMB: number) => void
  ): Promise<boolean> {
    const model = getWhisperModel(modelId);
    if (!model) {
      Logger.error(`🎤 [LocalWhisper] Unknown model: ${modelId}`);
      return false;
    }

    const modelPath = this.getModelPath(modelId);

    // Check if already downloaded
    if (fs.existsSync(modelPath)) {
      Logger.info(`🎤 [LocalWhisper] Model ${modelId} already downloaded`);
      return true;
    }

    Logger.info(`🎤 [LocalWhisper] Downloading model: ${model.name} (${model.size})`);

    return new Promise((resolve) => {
      const tempPath = modelPath + '.download';
      const file = fs.createWriteStream(tempPath);

      const downloadWithRedirects = (url: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          Logger.error('🎤 [LocalWhisper] Too many redirects');
          resolve(false);
          return;
        }

        https.get(url, (response) => {
          // Handle redirects
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              Logger.debug(`🎤 [LocalWhisper] Redirecting to: ${redirectUrl}`);
              downloadWithRedirects(redirectUrl, redirectCount + 1);
              return;
            }
          }

          if (response.statusCode !== 200) {
            Logger.error(`🎤 [LocalWhisper] Download failed with status: ${response.statusCode}`);
            resolve(false);
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10) || model.sizeBytes;
          let downloadedBytes = 0;

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            file.write(chunk);

            const percent = Math.round((downloadedBytes / totalBytes) * 100);
            const downloadedMB = Math.round(downloadedBytes / 1024 / 1024);
            const totalMB = Math.round(totalBytes / 1024 / 1024);

            onProgress?.(percent, downloadedMB, totalMB);
          });

          response.on('end', () => {
            file.end();

            // Rename temp file to final path
            try {
              fs.renameSync(tempPath, modelPath);
              Logger.info(`🎤 [LocalWhisper] Model ${modelId} downloaded successfully`);
              resolve(true);
            } catch (error) {
              Logger.error('🎤 [LocalWhisper] Failed to save model:', error);
              resolve(false);
            }
          });

          response.on('error', (error) => {
            Logger.error('🎤 [LocalWhisper] Download error:', error);
            file.end();
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
            resolve(false);
          });
        }).on('error', (error) => {
          Logger.error('🎤 [LocalWhisper] Request error:', error);
          resolve(false);
        });
      };

      downloadWithRedirects(model.url);
    });
  }

  /**
   * Load a model for transcription
   * Note: whisper-node-addon loads model per request, so this just checks availability
   */
  async loadModel(modelId: string): Promise<boolean> {
    // Check if model is downloaded
    if (!this.isModelDownloaded(modelId)) {
      Logger.error(`🎤 [LocalWhisper] Model ${modelId} not downloaded`);
      return false;
    }
    return true;
  }

  /**
   * Transcribe audio buffer using local Whisper model
   */
  async transcribeFromBuffer(
    audioBuffer: Buffer,
    modelId: string = 'tiny.en'
  ): Promise<{ text: string; isAssistant: boolean; model: string } | null> {
    const startTime = Date.now();

    try {
      Logger.info(`🎤 [LocalWhisper] Starting transcription with model: ${modelId} (${Math.round(audioBuffer.length / 1024)}KB buffer)`);

      // Check if model is downloaded
      if (!this.isModelDownloaded(modelId)) {
        Logger.error(`🎤 [LocalWhisper] Model ${modelId} not downloaded. Please download it first.`);
        return null;
      }

      // Convert PCM buffer to WAV for whisper.cpp
      // Whisper requires at least 1 second of audio, so pad short clips with silence
      const sampleRate = 16000;
      const bytesPerSample = 2; // 16-bit
      const minDurationMs = 1100; // 1.1 seconds to be safe
      const minSamples = Math.ceil(minDurationMs * sampleRate / 1000);
      const minBytes = minSamples * bytesPerSample;

      let processedBuffer = audioBuffer;
      if (audioBuffer.length < minBytes) {
        const currentDurationMs = Math.round((audioBuffer.length / bytesPerSample / sampleRate) * 1000);
        Logger.info(`🎤 [LocalWhisper] Audio too short (${currentDurationMs}ms), padding to ${minDurationMs}ms`);

        // Create a new buffer with silence padding
        const paddedBuffer = Buffer.alloc(minBytes, 0); // 0 = silence for PCM
        audioBuffer.copy(paddedBuffer, 0); // Copy original audio at the beginning
        processedBuffer = paddedBuffer;
      }

      const wavBuffer = this.pcmToWav(processedBuffer, 16000, 1, 16);

      // Write to temp file (whisper-node-addon requires file path)
      const tempFile = path.join(app.getPath('temp'), `whisper-${Date.now()}.wav`);
      fs.writeFileSync(tempFile, wavBuffer);

      try {
        // Import transcribe function dynamically
        const { transcribe } = await import('whisper-node-addon');

        // Transcribe
        // Note: whisper-node-addon returns Promise<string[][]> - array of [timestamp, text] arrays
        Logger.info('🎤 [LocalWhisper] Calling whisper-node-addon...');

        const result = await transcribe({
          model: this.getModelPath(modelId),
          fname_inp: tempFile,
          language: modelId.endsWith('.en') ? 'en' : 'auto',
          translate: false,
          no_prints: false,
          no_timestamps: true
        });

        Logger.info(`🎤 [LocalWhisper] transcribe() returned: ${typeof result}, isArray: ${Array.isArray(result)}`);
        if (result) {
          Logger.info(`🎤 [LocalWhisper] Result length: ${result.length}, first item: ${JSON.stringify(result[0])}`);
        }

        // Parse result - it's a string[][] (array of [timestamp, text] tuples)
        let transcriptText = '';

        if (Array.isArray(result) && result.length > 0) {
          // Each element is [timestamp, text] or just text
          const textParts: string[] = [];
          for (const item of result) {
            if (Array.isArray(item)) {
              // [timestamp, text] format - take the last element (text)
              const text = item[item.length - 1];
              if (typeof text === 'string' && text.trim()) {
                textParts.push(text.trim());
              }
            } else if (typeof item === 'string' && item.trim()) {
              textParts.push(item.trim());
            }
          }
          transcriptText = textParts.join(' ').trim();

          // Filter out silence tokens
          transcriptText = transcriptText.replace(/(?:\[BLANK_AUDIO\]|\[\s*Silence\s*\]|\(\s*Silence\s*\))/gi, '').trim();

          Logger.info(`🎤 [LocalWhisper] Extracted text from array: "${transcriptText}"`);
        } else if (typeof result === 'string' && result.trim()) {
          transcriptText = result.trim();
          // Filter out silence tokens
          transcriptText = transcriptText.replace(/(?:\[BLANK_AUDIO\]|\[\s*Silence\s*\]|\(\s*Silence\s*\))/gi, '').trim();
          Logger.info(`🎤 [LocalWhisper] Got text from string result: "${transcriptText}"`);
        } else if (typeof result === 'object' && result !== null && (result as any).text) {
          transcriptText = (result as any).text.trim();
          // Filter out silence tokens
          transcriptText = transcriptText.replace(/(?:\[BLANK_AUDIO\]|\[\s*Silence\s*\]|\(\s*Silence\s*\))/gi, '').trim();
          Logger.info(`🎤 [LocalWhisper] Got text from object result: "${transcriptText}"`);
        }

        const duration = Date.now() - startTime;

        Logger.info(`🎤 [LocalWhisper] Transcription complete in ${duration}ms: "${transcriptText.substring(0, 50)}..."`);

        if (!transcriptText) {
          Logger.warning('🎤 [LocalWhisper] Empty transcription result');
          return null;
        }

        return {
          text: transcriptText,
          isAssistant: false,
          model: `whisper-${modelId}-local`
        };
      } finally {
        // Clean up temp file
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    } catch (error) {
      console.error('🎤 [LocalWhisper] CRITICAL ERROR during transcription:', error);
      Logger.error('🎤 [LocalWhisper] Transcription failed:', error);
      return null;
    }
  }

  /**
   * Convert PCM buffer to WAV format
   */
  private pcmToWav(pcmBuffer: Buffer, sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const headerSize = 44;
    const fileSize = headerSize + dataSize - 8;

    const wavBuffer = Buffer.alloc(headerSize + dataSize);

    // RIFF header
    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(fileSize, 4);
    wavBuffer.write('WAVE', 8);

    // fmt sub-chunk
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16); // Sub-chunk size
    wavBuffer.writeUInt16LE(1, 20); // Audio format (PCM)
    wavBuffer.writeUInt16LE(numChannels, 22);
    wavBuffer.writeUInt32LE(sampleRate, 24);
    wavBuffer.writeUInt32LE(byteRate, 28);
    wavBuffer.writeUInt16LE(blockAlign, 32);
    wavBuffer.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(dataSize, 40);

    // Copy PCM data
    pcmBuffer.copy(wavBuffer, 44);

    return wavBuffer;
  }

  /**
   * Unload the current model to free memory
   */
  static unloadModel(): void {
    if (whisperInstance) {
      whisperInstance = null;
      currentModelId = null;
      Logger.info('🎤 [LocalWhisper] Model unloaded');
    }
  }

  /**
   * Delete a downloaded model
   */
  deleteModel(modelId: string): boolean {
    try {
      const modelPath = this.getModelPath(modelId);

      if (currentModelId === modelId) {
        LocalWhisperTranscriber.unloadModel();
      }

      if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
        Logger.info(`🎤 [LocalWhisper] Model ${modelId} deleted`);
        return true;
      }
      return false;
    } catch (error) {
      Logger.error('🎤 [LocalWhisper] Failed to delete model:', error);
      return false;
    }
  }

  /**
   * Clear all downloaded models
   */
  clearAllModels(): boolean {
    try {
      LocalWhisperTranscriber.unloadModel();

      if (fs.existsSync(this.modelsDir)) {
        fs.rmSync(this.modelsDir, { recursive: true, force: true });
        fs.mkdirSync(this.modelsDir, { recursive: true });
        Logger.info('🎤 [LocalWhisper] All models cleared');
      }
      return true;
    } catch (error) {
      Logger.error('🎤 [LocalWhisper] Failed to clear models:', error);
      return false;
    }
  }

  /**
   * Get model status
   */
  getStatus(): {
    modelsDir: string;
    downloadedModels: string[];
    currentModel: string | null;
    isLoaded: boolean;
  } {
    return {
      modelsDir: this.modelsDir,
      downloadedModels: this.getDownloadedModels(),
      currentModel: currentModelId,
      isLoaded: whisperInstance !== null
    };
  }
}
