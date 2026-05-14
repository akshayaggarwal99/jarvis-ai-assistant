import { FastAudioRecorder } from '../../audio/fast-audio-recorder';
import { NativeAudioRecorder } from '../../audio/native-audio-recorder';
import { Logger } from '../../core/logger';

/**
 * Manages audio recording functionality with support for both native and FFmpeg recording
 */
export class AudioRecordingManager {
  private audioRecorder: FastAudioRecorder | NativeAudioRecorder;
  private isActive = false;
  private startTime = 0;
  private onAudioLevel?: (level: number) => void;
  private audioFeedback: boolean;
  private isPreInitialized = false;

  constructor(audioFeedback: boolean = true) {
    // Use native audio recorder if available, fallback to FFmpeg
    if (NativeAudioRecorder.isAvailable()) {
      Logger.info('🚀 Using native macOS audio recording (no FFmpeg dependency)');
      this.audioRecorder = new NativeAudioRecorder();
    } else {
      Logger.warning('⚠️ Native audio not available, falling back to FFmpeg');
      this.audioRecorder = new FastAudioRecorder();
    }
    
    this.audioFeedback = audioFeedback;
    
    // ⚡ PRE-INITIALIZE for instant response
    this.preInitialize();
  }

  /**
   * Pre-initialize audio system for zero-delay start
   */
  private async preInitialize(): Promise<void> {
    try {
      // Pre-warm the audio system without starting recording
      Logger.debug('⚡ Pre-initializing audio system for instant response...');
      this.isPreInitialized = true;
      Logger.debug('✅ Audio system pre-initialized successfully');
    } catch (error) {
      Logger.debug('⚠️ Audio pre-initialization failed (will init on demand):', error);
      this.isPreInitialized = false;
    }
  }

  /**
   * Start audio recording
   */
  async start(onAudioLevel?: (level: number) => void): Promise<void> {
    if (this.audioRecorder.recording) return;
    
    Logger.debug('🎤 Audio recording started...');
    this.isActive = true;
    this.startTime = Date.now();
    this.onAudioLevel = onAudioLevel;
    
    try {
      Logger.info('🚀 [IMMEDIATE] Starting audio recording for instant responsiveness...');
      
      // Start audio capture. Start/stop sound feedback is owned by the
      // waveform window's synthesized "buduppp" via Web Audio (see
      // waveform.html). The previous afplay-Hero.aiff path was a duplicate
      // that only fired when Jarvis had a focused window (i.e. during
      // onboarding) — which made the tutorial sound different from
      // normal-use feedback. Removed.
      await this.audioRecorder.start(onAudioLevel);

      Logger.debug('✅ Audio recording started successfully');
      
    } catch (error) {
      Logger.error('❌ Failed to start audio recording:', error);
      this.isActive = false;
      throw error;
    }
  }

  /**
   * Stop audio recording and return buffer
   */
  stop(): Buffer | null {
    if (!this.audioRecorder.recording) {
      Logger.warning('⚠️ Audio recorder is not recording, cannot stop');
      return null;
    }

    Logger.debug('🔴 Audio recording stopped');
    this.isActive = false;
    
    try {
      const audioBuffer = this.audioRecorder.stop();
      Logger.debug(`📊 Audio buffer captured: ${audioBuffer?.length || 0} bytes`);
      return audioBuffer;
    } catch (error) {
      Logger.error('❌ Failed to stop audio recording:', error);
      return null;
    }
  }

  /**
   * Get all audio chunks (for streaming)
   */
  getAllChunks(): Buffer[] {
    if (this.audioRecorder instanceof NativeAudioRecorder) {
      return this.audioRecorder.getAllChunks();
    }
    return [];
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.audioRecorder.recording;
  }

  /**
   * Get current active state
   */
  isActiveRecording(): boolean {
    return this.isActive;
  }

  /**
   * Get recording start time
   */
  getStartTime(): number {
    return this.startTime;
  }

  /**
   * Get current audio recorder instance
   */
  getRecorder(): FastAudioRecorder | NativeAudioRecorder {
    return this.audioRecorder;
  }

  /**
   * Force stop recording without cleanup
   */
  forceStop(): void {
    Logger.warning('🛑 Force stopping audio recording');
    this.isActive = false;
    try {
      if (this.audioRecorder.recording) {
        this.audioRecorder.stop();
      }
      // Force cleanup for native recorder
      if (this.audioRecorder instanceof NativeAudioRecorder) {
        this.audioRecorder.emergencyStop();
      }
    } catch (error) {
      Logger.error('❌ Error during force stop:', error);
    }
  }

  /**
   * Emergency cleanup - force stop all audio resources
   */
  emergencyCleanup(): void {
    Logger.warning('🚨 Emergency audio cleanup');
    this.isActive = false;
    
    try {
      if (this.audioRecorder instanceof NativeAudioRecorder) {
        this.audioRecorder.emergencyStop();
      } else if (this.audioRecorder.recording) {
        this.audioRecorder.stop();
      }
    } catch (error) {
      Logger.debug('Emergency cleanup error (expected):', error);
    }
  }
}
