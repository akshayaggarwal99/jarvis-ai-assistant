import { FastAssistantTranscriber } from '../../transcription/fast-assistant-transcriber';
import { Logger } from '../../core/logger';
import { OptimizedAnalyticsManager } from '../../analytics/optimized-analytics-manager';
import UserFeedbackService from '../../services/user-feedback-service';

export interface TranscriptionOptions {
  useStreaming: boolean;
  audioBuffer: Buffer;
  duration: number;
  transcriptionId: string;
  keyReleaseTime?: number;
}

export interface TranscriptionResult {
  text: string;
  isPartial: boolean;
  confidence?: number;
  processingTime?: number;
}

export interface TranscriptionCallbacks {
  onStateChange?: (isTranscribing: boolean) => void;
  onPartialTranscript?: (partialText: string) => void;
  onComplete?: (result: TranscriptionResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Manages transcription processing for both traditional and streaming modes
 */
export class TranscriptionManager {
  private transcriber: FastAssistantTranscriber;
  private analyticsManager: OptimizedAnalyticsManager;
  private feedbackService: UserFeedbackService;
  private currentTranscriptionId: string | null = null;
  private isTranscribing = false;

  // Streaming state
  private streamingControl: { 
    sendAudio: (buffer: Buffer) => boolean; 
    finish: () => Promise<string>; 
    stop: () => Promise<void> 
  } | null = null;
  private streamingPartialText: string = '';
  private streamingFinalText: string = '';

  constructor(analyticsManager: OptimizedAnalyticsManager) {
    this.analyticsManager = analyticsManager;
    this.feedbackService = UserFeedbackService.getInstance();
    
    // Pre-initialize transcriber to avoid first-time delays
    this.transcriber = new FastAssistantTranscriber();
  }

  /**
   * Start transcription process
   */
  async transcribe(options: TranscriptionOptions, callbacks: TranscriptionCallbacks): Promise<void> {
    const { useStreaming, audioBuffer, duration, transcriptionId, keyReleaseTime } = options;
    
    this.currentTranscriptionId = transcriptionId;
    this.isTranscribing = true;
    callbacks.onStateChange?.(true);

    Logger.info(`🎙️ Starting transcription - ID: ${transcriptionId}, Mode: ${useStreaming ? 'streaming' : 'traditional'}`);

    try {
      if (useStreaming) {
        await this.handleStreamingTranscription(options, callbacks);
      } else {
        await this.handleTraditionalTranscription(options, callbacks);
      }
    } catch (error) {
      Logger.error('❌ Transcription error:', error);
      callbacks.onError?.(error as Error);
      this.cleanup();
    }
  }

  /**
   * Handle traditional (non-streaming) transcription
   */
  private async handleTraditionalTranscription(options: TranscriptionOptions, callbacks: TranscriptionCallbacks): Promise<void> {
    const { audioBuffer, duration, transcriptionId, keyReleaseTime } = options;
    
    Logger.info(`🎙️ [Traditional] Starting traditional transcription - ID: ${transcriptionId}`);
    
    // Validate audio buffer
    if (!audioBuffer) {
      Logger.error('❌ [Traditional] No audio buffer provided');
      this.analyticsManager.trackError('traditional_no_audio_buffer', {
        transcriptionId,
        duration,
        keyReleaseTime,
        timestamp: new Date().toISOString()
      });
      throw new Error('No audio buffer available for transcription');
    }

    // Check minimum duration
    if (duration < 150) {
      Logger.warning(`⚠️ [Traditional] Audio duration too short (${duration}ms < 150ms)`);
      this.analyticsManager.trackEvent('audio_too_short', {
        transcriptionId,
        duration,
        threshold: 150,
        timestamp: new Date().toISOString()
      });
      this.feedbackService.showTip('no-audio');
      throw new Error('Audio duration too short');
    }

    // Check for significant audio content
    if (!this.hasSignificantAudio(audioBuffer, duration)) {
      Logger.warning('⚠️ [Traditional] Audio appears to be silence or low-level noise');
      this.analyticsManager.trackEvent('audio_silent', {
        transcriptionId,
        duration,
        bufferSize: audioBuffer.length,
        timestamp: new Date().toISOString()
      });
      this.feedbackService.showTip('no-audio');
      throw new Error('Audio appears to be silent');
    }

    // Perform transcription
    const startTime = Date.now();
    
    try {
      const transcriptionResult = await this.transcriber.transcribeFromBuffer(audioBuffer, duration);
      const processingTime = Date.now() - startTime;
      
      if (!this.shouldContinueTranscription(transcriptionId)) {
        Logger.info('🚫 [Cancel] Transcription cancelled after completion');
        return;
      }

      const result: TranscriptionResult = {
        text: transcriptionResult.text || '',
        isPartial: false,
        processingTime
      };

      Logger.success(`✅ [Traditional] Transcription completed: "${result.text}" (${processingTime}ms)`);
      callbacks.onComplete?.(result);
      
    } catch (error) {
      Logger.error('❌ [Traditional] Transcription failed:', error);
      this.analyticsManager.trackError('transcription_failed', {
        transcriptionId,
        duration,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Handle streaming transcription
   */
  private async handleStreamingTranscription(options: TranscriptionOptions, callbacks: TranscriptionCallbacks): Promise<void> {
    const { audioBuffer, transcriptionId } = options;
    
    Logger.info('🌊 [Streaming] Processing streaming transcription...');
    
    try {
      if (this.streamingControl) {
        const finalText = await this.streamingControl.finish();
        
        if (!this.shouldContinueTranscription(transcriptionId)) {
          Logger.info('🚫 [Cancel] Streaming transcription cancelled');
          return;
        }

        const result: TranscriptionResult = {
          text: finalText || this.streamingFinalText || this.streamingPartialText,
          isPartial: false,
          processingTime: Date.now() - Date.now() // Will be set by caller
        };

        Logger.success(`✅ [Streaming] Final transcription: "${result.text}"`);
        callbacks.onComplete?.(result);
      }
    } catch (error) {
      Logger.error('🌊 [Streaming] Error:', error);
      
      // Fallback to traditional transcription
      if (audioBuffer) {
        Logger.info('🔄 [Fallback] Falling back to traditional transcription');
        await this.handleTraditionalTranscription(options, callbacks);
      } else {
        throw error;
      }
    } finally {
      this.cleanupStreaming();
    }
  }

  /**
   * Cancel current transcription
   */
  cancelTranscription(): void {
    Logger.info('🚫 Cancelling transcription');
    this.currentTranscriptionId = null;
    this.isTranscribing = false;
    this.cleanupStreaming();
  }

  /**
   * Check if transcription should continue
   */
  private shouldContinueTranscription(transcriptionId: string): boolean {
    return this.currentTranscriptionId === transcriptionId;
  }

  /**
   * Check if audio buffer contains significant content
   */
  private hasSignificantAudio(audioBuffer: Buffer, durationMs: number): boolean {
    if (!audioBuffer || audioBuffer.length === 0) return false;
    
    // Convert to 16-bit samples for analysis
    const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
    
    // Calculate RMS and peak levels
    let sum = 0;
    let peak = 0;
    let significantSamples = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.abs(samples[i]);
      sum += sample * sample;
      peak = Math.max(peak, sample);
      
      // Count samples above a threshold (more sensitive)
      if (sample > 50) { // Reduced from 100 to 50 for better sensitivity
        significantSamples++;
      }
    }
    
    const rms = Math.sqrt(sum / samples.length);
    const significantRatio = significantSamples / samples.length;
    
    // More lenient thresholds for better detection
    const hasSignificantRMS = rms > 30; // Reduced from 50
    const hasSignificantPeak = peak > 200; // Reduced from 300
    const hasSignificantActivity = significantRatio > 0.001; // Reduced from 0.005
    
    Logger.debug(`🔇 Audio analysis: RMS=${rms.toFixed(1)}, Peak=${peak}, SignificantRatio=${(significantRatio*100).toFixed(2)}%, Duration=${durationMs}ms`);
    
    return hasSignificantRMS || hasSignificantPeak || hasSignificantActivity;
  }

  /**
   * Get current transcription state
   */
  isCurrentlyTranscribing(): boolean {
    return this.isTranscribing;
  }

  /**
   * Set streaming control
   */
  setStreamingControl(control: { sendAudio: (buffer: Buffer) => boolean; finish: () => Promise<string>; stop: () => Promise<void> } | null): void {
    this.streamingControl = control;
  }

  /**
   * Update streaming partial text
   */
  updateStreamingPartial(text: string): void {
    this.streamingPartialText = text;
  }

  /**
   * Update streaming final text
   */
  updateStreamingFinal(text: string): void {
    this.streamingFinalText = text;
  }

  /**
   * Cleanup transcription state
   */
  private cleanup(): void {
    this.isTranscribing = false;
    this.currentTranscriptionId = null;
  }

  /**
   * Cleanup streaming state
   */
  private cleanupStreaming(): void {
    if (this.streamingControl) {
      try {
        this.streamingControl.stop();
      } catch (error) {
        Logger.error('Error stopping streaming control:', error);
      }
      this.streamingControl = null;
    }
    this.streamingPartialText = '';
    this.streamingFinalText = '';
  }
}
