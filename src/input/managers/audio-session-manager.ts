import { Logger } from '../../core/logger';
import { FastAudioRecorder } from '../../audio/fast-audio-recorder';
import { NativeAudioRecorder } from '../../audio/native-audio-recorder';
import { AudioSessionData } from '../types/push-to-talk-types';

export class AudioSessionManager {
  private audioRecorder: FastAudioRecorder | NativeAudioRecorder;
  private startTime: number = 0;
  private audioFeedbackEnabled: boolean = true;

  constructor(audioFeedback: boolean = true) {
    this.audioFeedbackEnabled = audioFeedback;
    
    // Use native audio recorder if available, fallback to FFmpeg
    if (NativeAudioRecorder.isAvailable()) {
      Logger.info('🚀 [Audio] Using native macOS audio recording (no FFmpeg dependency)');
      this.audioRecorder = new NativeAudioRecorder();
    } else {
      Logger.warning('⚠️ [Audio] Native audio not available, falling back to FFmpeg');
      this.audioRecorder = new FastAudioRecorder();
    }
  }

  /**
   * Start audio recording
   */
  async startRecording(onAudioLevel?: (level: number) => void): Promise<void> {
    try {
      this.startTime = Date.now();
      
      // Try to start recording with fallback logic
      let success = false;
      let usedNative = false;
      let nativeFailed = false;

      // Check if we're using native recorder and try to start it
      if (this.audioRecorder instanceof NativeAudioRecorder) {
        Logger.info('🔧 🎤 Starting native audio recording...');
        try {
          await this.audioRecorder.start(onAudioLevel);
          // Check if it actually started by verifying recording state
          if (this.audioRecorder.recording) {
            Logger.info('✅ ✅ Native audio recording started successfully');
            success = true;
            usedNative = true;
          } else {
            Logger.warning('⚠️ ⚠️ Native recording failed to start - triggering fallback');
            nativeFailed = true;
          }
        } catch (error) {
          Logger.error('❌ Native recording error:', error);
          nativeFailed = true;
          success = false;
        }
        
        // If native failed, try to create FFmpeg fallback
        if (!success) {
          Logger.info('🔄 🎙️ FALLBACK: Native recorder failed, switching to FFmpeg...');
          try {
            this.audioRecorder = new FastAudioRecorder();
            await this.audioRecorder.start(onAudioLevel);
            success = this.audioRecorder.recording;
            usedNative = false;
            Logger.info(success ? '✅ ✅ FFmpeg audio recording started successfully' : '❌ ❌ FFmpeg audio recording failed');
          } catch (error) {
            Logger.error('❌ FFmpeg recording error:', error);
            success = false;
          }
        }
      } else {
        // Already using FFmpeg recorder
        Logger.info('🔧 🎙️ Using FFmpeg audio recording...');
        try {
          await this.audioRecorder.start(onAudioLevel);
          success = this.audioRecorder.recording;
          Logger.info(success ? '✅ ✅ FFmpeg audio recording started successfully' : '❌ ❌ FFmpeg audio recording failed');
        } catch (error) {
          Logger.error('❌ FFmpeg recording error:', error);
          success = false;
        }
      }

      if (!success) {
        Logger.error('❌ ❌ [CRITICAL] All recording methods failed - no audio capture available');
        throw new Error('Failed to start any audio recording method');
      }

      // Play audio feedback if enabled
      if (this.audioFeedbackEnabled) {
        await this.playAudioFeedback('key-press');
      }

      Logger.info(`ℹ️ ✅ [Audio] Recording started using ${usedNative ? 'native' : 'FFmpeg'} recorder`);

    } catch (error) {
      Logger.error('❌ [AudioSession] Failed to start recording:', error);
      throw error; // Re-throw so orchestrator can handle it
    }
  }  /**
   * Stop audio recording and get session data
   */
  stopRecording(): AudioSessionData {
    const duration = Date.now() - this.startTime;
    const audioBuffer = this.audioRecorder.stop();
    
    const sessionData: AudioSessionData = {
      buffer: audioBuffer,
      duration,
      chunks: this.getAudioChunks(),
      hasSignificantAudio: this.hasSignificantAudio(audioBuffer, duration)
    };

    Logger.info(`🛑 [Audio] Recording stopped - Duration: ${duration}ms, Buffer: ${audioBuffer?.length || 0} bytes`);
    
    return sessionData;
  }

  /**
   * Force stop recording
   */
  forceStop(): void {
    try {
      if (this.audioRecorder.recording) {
        this.audioRecorder.stop();
        Logger.info('🛑 [Audio] Force stopped recording');
      }
      // Always call cleanup to ensure resources are released
      (this.audioRecorder as any).cleanup?.();
      Logger.debug('🧹 [Audio] Force cleanup completed');
    } catch (error) {
      Logger.error('❌ [Audio] Error during force stop:', error);
      // Force cleanup even on error
      try {
        (this.audioRecorder as any).cleanup?.();
      } catch (cleanupError) {
        Logger.error('❌ [Audio] Cleanup failed:', cleanupError);
      }
    }
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.audioRecorder.recording;
  }

  /**
   * Get audio chunks for streaming
   */
  getAudioChunks(): Buffer[] {
    if (this.audioRecorder instanceof NativeAudioRecorder) {
      return this.audioRecorder.getAllChunks();
    } else if ((this.audioRecorder as any).audioChunks) {
      return (this.audioRecorder as any).audioChunks as Buffer[];
    }
    return [];
  }

  /**
   * Get latest audio chunks for streaming
   */
  getLatestChunks(fromIndex: number): Buffer[] {
    if (this.audioRecorder instanceof NativeAudioRecorder) {
      return this.audioRecorder.getLatestChunks(fromIndex);
    } else if ((this.audioRecorder as any).audioChunks) {
      const chunks = (this.audioRecorder as any).audioChunks as Buffer[];
      return chunks.slice(fromIndex);
    }
    return [];
  }

  /**
   * Get current chunk count for streaming
   */
  getChunkCount(): number {
    if (this.audioRecorder instanceof NativeAudioRecorder) {
      return this.audioRecorder.getChunkCount();
    } else if ((this.audioRecorder as any).audioChunks) {
      return ((this.audioRecorder as any).audioChunks as Buffer[]).length;
    }
    return 0;
  }

  /**
   * Check if audio buffer contains significant audio content
   */
  private hasSignificantAudio(audioBuffer: Buffer | null, durationMs: number): boolean {
    if (!audioBuffer || audioBuffer.length === 0) return false;
    
    // Calculate both RMS and peak values for better detection
    let sum = 0;
    let peak = 0;
    const samples = audioBuffer.length / 2; // 16-bit samples
    
    for (let i = 0; i < audioBuffer.length; i += 2) {
      if (i + 1 < audioBuffer.length) {
        const sample = Math.abs(audioBuffer.readInt16LE(i));
        sum += sample * sample;
        peak = Math.max(peak, sample);
      }
    }
    
    const rms = Math.sqrt(sum / samples);
    
    // Normalize both RMS and peak to 0-100 scale
    const normalizedRMS = Math.min(100, (rms / 32768) * 100);
    const normalizedPeak = Math.min(100, (peak / 32768) * 100);
    
    // Very permissive thresholds specifically for whisper detection
    let rmsThreshold = 0.08;  // Extremely low for whisper audio
    let peakThreshold = 0.15; // Peak detection for sudden whispers
    
    if (durationMs < 1000) {
      rmsThreshold = 0.12; // Slightly higher for very short audio to avoid noise
      peakThreshold = 0.2;
    } else if (durationMs > 5000) {
      rmsThreshold = 0.05; // Even lower for longer whisper conversations
      peakThreshold = 0.1;
    }
    
    // Audio is significant if EITHER RMS OR peak threshold is met
    const hasSignificantRMS = normalizedRMS > rmsThreshold;
    const hasSignificantPeak = normalizedPeak > peakThreshold;
    const hasSignificantAudio = hasSignificantRMS || hasSignificantPeak;
    
    Logger.debug(`🔇 [Audio] Silence detection - RMS: ${normalizedRMS.toFixed(2)} (>${rmsThreshold}), Peak: ${normalizedPeak.toFixed(2)} (>${peakThreshold}), Duration: ${durationMs}ms, Significant: ${hasSignificantAudio}`);
    
    return hasSignificantAudio;
  }

  /**
   * Play audio feedback sound
   */
  private async playAudioFeedback(soundType: 'key-press' | 'key-release'): Promise<void> {
    try {
      const { BrowserWindow } = await import('electron');
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (focusedWindow) {
        await focusedWindow.webContents.executeJavaScript(`
          if (window.electronAPI && window.electronAPI.playSound) {
            window.electronAPI.playSound('${soundType}').catch(e => console.error('Failed to play ${soundType} sound:', e));
          }
        `);
      }
    } catch (error) {
      Logger.debug(`Failed to play ${soundType} sound:`, error);
    }
  }

  /**
   * Enable or disable audio feedback
   */
  setAudioFeedback(enabled: boolean): void {
    this.audioFeedbackEnabled = enabled;
    Logger.debug(`🔊 [Audio] Feedback ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get recording start time
   */
  getStartTime(): number {
    return this.startTime;
  }

  /**
   * Set recording start time (for manual control)
   */
  setStartTime(time: number): void {
    this.startTime = time;
  }
}
