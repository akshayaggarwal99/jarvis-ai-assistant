import { AppSettingsService } from '../services/app-settings-service';
import { Logger } from '../core/logger';
import { DeepgramStreamingTranscriber } from './deepgram-streaming-transcriber';

/**
 * Real-time Deepgram streaming transcription service
 * Provides WebSocket-based streaming transcription with live feedback
 */
export class StreamingTranscriptionService {
  private streamingTranscriber: DeepgramStreamingTranscriber | null = null;
  private isStreaming = false;
  private onPartialText?: (text: string) => void;
  private onFinalText?: (text: string) => void;

  constructor() {
    // Empty constructor - transcriber is created per session
  }

  /**
   * Start streaming transcription session
   */
  async startStreaming(
    apiKey: string,
    onPartialText?: (text: string) => void,
    onFinalText?: (text: string) => void
  ): Promise<boolean> {
    // Always cleanup any existing session first to prevent race conditions
    if (this.isStreaming) {
      Logger.warning('🌊 [StreamingService] Already streaming, stopping previous session');
      await this.stopStreaming();

      // Add a delay to ensure cleanup completes
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    try {
      this.onPartialText = onPartialText;
      this.onFinalText = onFinalText;

      const settings = AppSettingsService.getInstance().getSettings();
      const transcriptionLanguage = settings.transcriptionLanguage || 'en-US';

      // Create new streaming transcriber
      this.streamingTranscriber = new DeepgramStreamingTranscriber(apiKey, {
        model: 'nova-3',
        language: transcriptionLanguage,
        smart_format: true,
        punctuate: true,
        capitalization: true,
        encoding: 'linear16',
        sample_rate: 16000
      });

      // Set up event listeners
      this.setupEventListeners();

      // Connect to Deepgram
      const connected = await this.streamingTranscriber.connect();

      if (connected) {
        this.isStreaming = true;
        Logger.success('🌊 [StreamingService] Streaming session started successfully');
        return true;
      } else {
        Logger.error('🌊 [StreamingService] Failed to connect to Deepgram');
        return false;
      }

    } catch (error) {
      Logger.error('🌊 [StreamingService] Failed to start streaming:', error);
      this.cleanup();
      return false;
    }
  }

  /**
   * Send audio data to the streaming transcriber
   */
  sendAudioData(audioBuffer: Buffer): boolean {
    if (!this.isStreaming || !this.streamingTranscriber) {
      return false;
    }

    return this.streamingTranscriber.sendAudioData(audioBuffer);
  }

  /**
   * Finish streaming session and get final transcript
   */
  async finishStreaming(): Promise<string> {
    if (!this.isStreaming || !this.streamingTranscriber) {
      return '';
    }

    try {
      // Get final transcript from Deepgram
      const finalTranscript = await this.streamingTranscriber.finishStream();

      // Notify callback
      if (this.onFinalText) {
        this.onFinalText(finalTranscript);
      }

      return finalTranscript;

    } catch (error) {
      Logger.error('🌊 [StreamingService] Error finishing stream:', error);
      return this.streamingTranscriber?.getFinalTranscript() || '';
    } finally {
      this.cleanup();
    }
  }

  /**
   * Stop streaming session immediately
   */
  async stopStreaming(): Promise<void> {
    if (!this.isStreaming) return;

    Logger.info('🌊 [StreamingService] Stopping streaming session');

    if (this.streamingTranscriber) {
      this.streamingTranscriber.disconnect();
    }

    this.cleanup();

    Logger.info('🌊 [StreamingService] Streaming session stopped');
  }

  /**
   * Check if currently streaming
   */
  isCurrentlyStreaming(): boolean {
    return this.isStreaming;
  }

  /**
   * Set up event listeners for the streaming transcriber
   */
  private setupEventListeners(): void {
    if (!this.streamingTranscriber) return;

    // Handle interim transcripts
    this.streamingTranscriber.on('interim_transcript', (result) => {
      const text = result.text?.trim();
      if (text && this.onPartialText) {
        this.onPartialText(text);
      }
    });

    // Handle final transcripts
    this.streamingTranscriber.on('final_transcript', (result) => {
      const text = result.text?.trim();
      if (text) {
        // Note: We don't call onFinalText here as it's handled in finishStreaming()
        // This is for individual segments, finishStreaming() provides the complete transcript
      }
    });

    // Handle connection events
    this.streamingTranscriber.on('connected', () => {
      // Connection established
    });

    this.streamingTranscriber.on('disconnected', (code, reason) => {
      // Connection closed
    });

    this.streamingTranscriber.on('error', (error) => {
      Logger.error('🌊 [StreamingService] Deepgram error:', error);
    });
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    Logger.debug('🌊 [StreamingService] Cleaning up resources');
    this.isStreaming = false;

    if (this.streamingTranscriber) {
      this.streamingTranscriber.removeAllListeners();
      this.streamingTranscriber = null;
    }

    this.onPartialText = undefined;
    this.onFinalText = undefined;

    Logger.debug('🌊 [StreamingService] Cleanup completed');
  }
}
