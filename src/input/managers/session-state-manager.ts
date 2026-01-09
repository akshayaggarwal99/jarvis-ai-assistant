import { Logger } from '../../core/logger';
import { SessionState, TranscriptionSession, CancellationReason, PushToTalkEvents } from '../types/push-to-talk-types';
import { AppContext } from '../../interfaces/transcription';

export class SessionStateManager {
  private state: SessionState = {
    isActive: false,
    isTranscribing: false,
    currentTranscriptionId: null,
    currentSessionId: null
  };

  private events: PushToTalkEvents;
  private activeSession: TranscriptionSession | null = null;

  constructor(events: PushToTalkEvents = {}) {
    this.events = events;
  }

  /**
   * Start a new session
   */
  startSession(sessionId: string): void {
    this.state.isActive = true;
    this.state.currentSessionId = sessionId;
    this.activeSession = {
      id: sessionId,
      startTime: Date.now(),
      keyReleaseTime: Date.now(),
      duration: 0,
      isActive: true
    };

    this.events.onStateChange?.(true);
    Logger.info(`🎬 [Session] Started new session: ${sessionId}`);
  }

  /**
   * Start transcription for current session
   */
  startTranscription(transcriptionId: string, keyReleaseTime?: number): void {
    if (!this.state.currentSessionId) {
      Logger.warning('⚠️ [Session] Attempting to start transcription without active session');
      return;
    }

    this.state.isTranscribing = true;
    this.state.currentTranscriptionId = transcriptionId;
    
    if (this.activeSession && keyReleaseTime) {
      this.activeSession.keyReleaseTime = keyReleaseTime;
    }

    this.events.onTranscriptionState?.(true);
    Logger.info(`📝 [Session] Started transcription: ${transcriptionId}`);
  }

  /**
   * Complete transcription for current session
   * @param pasteSuccess - true if paste succeeded, false if failed (e.g., no text input focused)
   */
  completeTranscription(pasteSuccess: boolean = true): void {
    if (this.state.currentTranscriptionId) {
      Logger.info(`✅ [Session] Completed transcription: ${this.state.currentTranscriptionId}, pasteSuccess: ${pasteSuccess}`);
      this.state.currentTranscriptionId = null;
    }

    this.state.isTranscribing = false;
    this.events.onTranscriptionState?.(false, pasteSuccess);
  }

  /**
   * End the current session
   * @param pasteSuccess - true if paste succeeded, false if failed (e.g., no text input focused)
   */
  endSession(pasteSuccess: boolean = true): void {
    if (this.state.currentSessionId) {
      Logger.info(`🏁 [Session] Ended session: ${this.state.currentSessionId}`);
    }

    this.state.isActive = false;
    this.state.currentSessionId = null;
    this.activeSession = null;

    // Only call completeTranscription if still transcribing (avoids duplicate callbacks)
    if (this.state.isTranscribing) {
      this.completeTranscription(pasteSuccess);
    }
    this.events.onStateChange?.(false);
  }

  /**
   * Cancel current operations
   */
  cancelCurrent(reason: CancellationReason = 'user'): void {
    const sessionId = this.state.currentSessionId;
    const transcriptionId = this.state.currentTranscriptionId;

    Logger.info(`🚫 [Session] Cancelling current operations - Reason: ${reason}, Session: ${sessionId}, Transcription: ${transcriptionId}`);

    if (transcriptionId) {
      this.completeTranscription();
    }

    if (sessionId) {
      this.endSession();
    }
  }

  /**
   * Check if current transcription should continue
   */
  shouldContinueTranscription(transcriptionId: string): boolean {
    const shouldContinue = this.state.currentTranscriptionId === transcriptionId && this.state.isTranscribing;
    
    if (!shouldContinue) {
      Logger.debug(`🚫 [Session] Transcription ${transcriptionId} should not continue - Current: ${this.state.currentTranscriptionId}, IsTranscribing: ${this.state.isTranscribing}`);
    }
    
    return shouldContinue;
  }

  /**
   * Update session with audio data
   */
  updateSessionAudio(audioBuffer: Buffer, duration: number): void {
    if (this.activeSession) {
      this.activeSession.audioBuffer = audioBuffer;
      this.activeSession.duration = duration;
    }
  }

  /**
   * Set pre-detected context
   */
  setPreDetectedContext(context: AppContext): void {
    this.state.preDetectedContext = context;
    Logger.debug(`🎯 [Session] Set pre-detected context: ${context.type} - ${context.activeApp}`);
  }

  /**
   * Get current state
   */
  getState(): Readonly<SessionState> {
    return { ...this.state };
  }

  /**
   * Get active session
   */
  getActiveSession(): Readonly<TranscriptionSession> | null {
    return this.activeSession ? { ...this.activeSession } : null;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Check if transcribing
   */
  isTranscribing(): boolean {
    return this.state.isTranscribing;
  }

  /**
   * Get current transcription ID
   */
  getCurrentTranscriptionId(): string | null {
    return this.state.currentTranscriptionId;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.state.currentSessionId;
  }

  /**
   * Emergency stop all operations
   */
  emergencyStop(): void {
    Logger.warning('🚨 [Session] Emergency stop activated');
    
    const previousState = { ...this.state };
    
    this.state.isActive = false;
    this.state.isTranscribing = false;
    this.state.currentTranscriptionId = null;
    this.state.currentSessionId = null;
    this.activeSession = null;
    
    // Notify listeners
    if (previousState.isTranscribing) {
      this.events.onTranscriptionState?.(false);
    }
    if (previousState.isActive) {
      this.events.onStateChange?.(false);
    }
    
    Logger.warning('🛑 [Session] Emergency stop completed');
  }

  /**
   * Update event handlers
   */
  updateEvents(events: Partial<PushToTalkEvents>): void {
    this.events = { ...this.events, ...events };
  }
}
