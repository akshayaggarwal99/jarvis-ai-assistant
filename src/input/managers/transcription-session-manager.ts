import { Logger } from '../../core/logger';
import { FastAssistantTranscriber } from '../../transcription/fast-assistant-transcriber';
import { AppSettingsService } from '../../services/app-settings-service';
import { OptimizedAnalyticsManager } from '../../analytics/optimized-analytics-manager';
import { AudioValidator } from '../../audio/audio-validator';
import { TranscriptionResult, StreamingControl, AudioSessionData } from '../types/push-to-talk-types';

export class TranscriptionSessionManager {
  private transcriber: FastAssistantTranscriber;
  private analyticsManager: OptimizedAnalyticsManager;
  private streamingControl: StreamingControl | null = null;
  private useStreamingTranscription: boolean = false;
  private lastSentChunkIndex: number = 0;
  private streamingPartialText: string = '';
  private streamingFinalText: string = '';

  // Callbacks
  private onPartialTranscript?: (partialText: string) => void;

  constructor(
    analyticsManager: OptimizedAnalyticsManager,
    useStreamingTranscription: boolean = false,
    onPartialTranscript?: (partialText: string) => void
  ) {
    this.analyticsManager = analyticsManager;
    this.useStreamingTranscription = useStreamingTranscription;
    this.onPartialTranscript = onPartialTranscript;

    // Pre-initialize transcriber to avoid first-time delays
    this.transcriber = new FastAssistantTranscriber();
  }

  /**
   * Initialize streaming transcription if needed
   */
  async initializeStreaming(): Promise<void> {
    // Always cleanup existing streaming control first to prevent race conditions
    if (this.streamingControl) {
      Logger.warning('🌊 [Transcription] Already initialized, stopping previous session');
      try {
        await this.streamingControl.stop();
      } catch (error) {
        Logger.warning('🌊 [Transcription] Error stopping previous session:', error);
      }
      this.streamingControl = null;

      // Add a small delay to ensure cleanup completes
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    try {
      // Check if streaming is enabled in settings
      const settings = AppSettingsService.getInstance().getSettings();

      // If local whisper is enabled, don't use streaming (local whisper is offline-only)
      if (settings.useLocalWhisper) {
        Logger.info('🌊 [Transcription] Local Whisper enabled - streaming disabled for offline mode');
        this.streamingControl = null;
        this.useStreamingTranscription = false;
        return;
      }

      if (!settings.useDeepgramStreaming) {
        Logger.info('🌊 [Transcription] Deepgram streaming disabled in settings');
        this.streamingControl = null;
        return;
      }

      Logger.info('🌊 [Transcription] Initializing Deepgram streaming transcription...');

      // Reset streaming state
      this.lastSentChunkIndex = 0;
      this.streamingPartialText = '';
      this.streamingFinalText = '';

      // Start streaming transcription with callbacks
      this.streamingControl = await this.transcriber.startStreamingTranscription(
        (partialText: string) => {
          this.streamingPartialText = partialText;
          this.onPartialTranscript?.(partialText);
          Logger.debug(`🌊 [Partial] ${partialText}`);
        },
        (finalText: string) => {
          this.streamingFinalText = finalText;
          Logger.info(`🌊 [Final] ${finalText}`);
        }
      );

      if (this.streamingControl) {
        Logger.success('🌊 [Transcription] Deepgram streaming initialized successfully');
      } else {
        throw new Error('Failed to get streaming control interface');
      }
    } catch (error) {
      Logger.error('🌊 [Transcription] Failed to initialize streaming:', error);
      this.streamingControl = null;
      this.useStreamingTranscription = false;
    }
  }

  /**
   * Send audio chunks to streaming transcription
   */
  sendAudioToStream(audioChunks: Buffer[], currentChunkCount: number): void {
    if (!this.streamingControl || !this.useStreamingTranscription) return;

    try {
      // Only send chunks we haven't sent yet
      if (currentChunkCount > this.lastSentChunkIndex) {
        const newChunks = audioChunks.slice(this.lastSentChunkIndex);
        this.lastSentChunkIndex = currentChunkCount;

        // Send new chunks to streaming transcription
        let sentCount = 0;
        for (const chunk of newChunks) {
          if (chunk && chunk.length > 0) {
            const sent = this.streamingControl.sendAudio(chunk);
            if (sent) {
              sentCount++;
            } else {
              Logger.warning('🌊 [Transcription] Failed to send audio chunk to stream');
              break;
            }
          }
        }

        if (sentCount > 0) {
          Logger.debug(`🌊 [Transcription] Sent ${sentCount} audio chunks to streaming`);
        }
      }
    } catch (error) {
      Logger.error('🌊 [Transcription] Error sending audio to stream:', error);
    }
  }

  /**
   * Transcribe audio using streaming or traditional method
   */
  async transcribe(audioSessionData: AudioSessionData, transcriptionId: string, keyReleaseTime: number): Promise<TranscriptionResult | null> {
    const shouldUseStreaming = this.useStreamingTranscription && this.streamingControl;

    if (shouldUseStreaming) {
      return await this.handleStreamingTranscription(transcriptionId, keyReleaseTime);
    } else {
      return await this.handleTraditionalTranscription(audioSessionData, transcriptionId, keyReleaseTime);
    }
  }

  /**
   * Handle streaming transcription completion
   */
  private async handleStreamingTranscription(transcriptionId: string, keyReleaseTime: number): Promise<TranscriptionResult | null> {
    try {
      Logger.info('🌊 [Transcription] Finishing streaming transcription...');

      if (!this.streamingControl) {
        Logger.warning('🌊 [Transcription] No streaming control available');
        return null;
      }

      // Check for ultra-fast mode with accumulated text
      if (this.streamingFinalText && this.streamingFinalText.trim().length > 0) {
        Logger.info('⚡ [Transcription] Using accumulated streaming text');

        const result: TranscriptionResult = {
          text: this.streamingFinalText.trim(),
          model: 'deepgram-streaming-immediate'
        };

        // Track ultra-fast streaming
        this.analyticsManager.trackEvent('ultra_fast_streaming_transcription', {
          textLength: result.text.length,
          model: result.model,
          timestamp: new Date().toISOString()
        });

        return result;
      }

      // Finish streaming transcription
      const streamingFinishStartTime = Date.now();
      const finalText = await this.streamingControl.finish();
      const streamingFinishTime = Date.now() - streamingFinishStartTime;

      Logger.performance('🌊 [Transcription] Streaming finish completed', streamingFinishTime);

      // Use streaming result or fallback
      let resultText = finalText || this.streamingFinalText;

      if (!resultText) {
        Logger.warning('🌊 [Transcription] No streaming result available');
        return null;
      }

      Logger.success(`🌊 [Transcription] Final streaming result: "${resultText}"`);

      return {
        text: resultText,
        model: 'deepgram-streaming'
      };

    } catch (error) {
      Logger.error('🌊 [Transcription] Error in streaming transcription:', error);
      return null;
    } finally {
      // Always clean up streaming resources
      if (this.streamingControl) {
        try {
          await this.streamingControl.stop();
        } catch (error) {
          Logger.warning('🌊 [Transcription] Error during streaming cleanup:', error);
        }
        this.streamingControl = null;
      }

      // Reset streaming state
      this.lastSentChunkIndex = 0;
      this.streamingPartialText = '';
      this.streamingFinalText = '';
    }
  }

  /**
   * Handle traditional (non-streaming) transcription
   */
  private async handleTraditionalTranscription(audioSessionData: AudioSessionData, transcriptionId: string, keyReleaseTime: number): Promise<TranscriptionResult | null> {
    Logger.info(`🎙️ [Transcription] Starting traditional transcription - ID: ${transcriptionId}`);

    const { buffer: audioBuffer, duration } = audioSessionData;

    if (!audioBuffer) {
      Logger.error('❌ [Transcription] No audio buffer available');
      return null;
    }

    // Validate audio duration
    if (duration < 150) {
      Logger.warning(`⚠️ [Transcription] Audio duration too short (${duration}ms < 150ms)`);
      this.analyticsManager.trackEvent('audio_too_short', {
        transcriptionId,
        duration,
        threshold: 150,
        timestamp: new Date().toISOString()
      });
      return null;
    }

    // Validate audio content
    if (!audioSessionData.hasSignificantAudio) {
      Logger.warning('⚠️ [Transcription] Audio appears to be silence or low-level noise');
      this.analyticsManager.trackEvent('audio_silent', {
        transcriptionId,
        duration,
        bufferSize: audioBuffer.length,
        timestamp: new Date().toISOString()
      });
      return null;
    }

    const transcriptionStartTime = Date.now();
    Logger.info(`🚀 [Transcription] Starting cloud transcription (${duration}ms audio, ${audioBuffer.length} bytes)`);

    try {
      const result = await this.transcriber.transcribeFromBuffer(audioBuffer, duration);

      if (result?.text) {
        const transcriptionTime = Date.now() - transcriptionStartTime;
        Logger.info(`✅ [Transcription] Completed in ${transcriptionTime}ms: "${result.text}"`);

        // Track performance
        this.analyticsManager.trackPerformance('transcription_latency', transcriptionTime, {
          model: result.model,
          audioDuration: duration,
          textLength: result.text.length,
          audioBufferSize: audioBuffer.length,
          transcriptionId,
          timestamp: new Date().toISOString()
        });

        // Validate transcription result
        if (!AudioValidator.isValidTranscription(result.text.trim())) {
          Logger.warning('⚠️ [Transcription] Invalid transcription result');
          return null;
        }

        return {
          text: result.text.trim(),
          model: result.model,
          isAssistant: result.isAssistant
        };
      } else {
        Logger.warning('⚠️ [Transcription] API returned no text');
        return null;
      }
    } catch (error) {
      const transcriptionTime = Date.now() - transcriptionStartTime;
      Logger.error(`❌ [Transcription] Failed in ${transcriptionTime}ms:`, error);

      // Track error
      this.analyticsManager.trackError('transcription_failed', {
        error: error instanceof Error ? error.message : String(error),
        duration,
        model: 'whisper-cloud',
        transcriptionTime,
        transcriptionId,
        timestamp: new Date().toISOString()
      });

      return null;
    }
  }

  /**
   * Get accumulated streaming text (for ultra-fast mode)
   */
  getStreamingText(): string {
    return this.streamingFinalText || this.streamingPartialText;
  }

  /**
   * Enable or disable streaming mode
   */
  setStreamingMode(enabled: boolean): void {
    this.useStreamingTranscription = enabled;
    Logger.info(`🌊 [Transcription] Streaming mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if streaming is enabled
   * Also returns false if local whisper is enabled (offline mode)
   */
  isStreamingEnabled(): boolean {
    // If local whisper is enabled, streaming is always disabled
    const settings = AppSettingsService.getInstance().getSettings();
    Logger.info(`🔍 [Transcription] isStreamingEnabled check - useLocalWhisper: ${settings.useLocalWhisper}, useStreamingTranscription: ${this.useStreamingTranscription}`);
    if (settings.useLocalWhisper) {
      Logger.info('🔍 [Transcription] Local Whisper enabled - returning FALSE for streaming');
      return false;
    }
    return this.useStreamingTranscription;
  }

  /**
   * Clean up streaming resources
   */
  async cleanup(): Promise<void> {
    Logger.info('🌊 [Transcription] Cleaning up streaming resources');

    if (this.streamingControl) {
      try {
        await this.streamingControl.stop();
      } catch (error) {
        Logger.warning('Failed to stop streaming control during cleanup:', error);
      }
      this.streamingControl = null;
    }

    // Reset all streaming state
    this.lastSentChunkIndex = 0;
    this.streamingPartialText = '';
    this.streamingFinalText = '';
    this.useStreamingTranscription = false;

    Logger.info('🌊 [Transcription] Cleanup completed');
  }
}
