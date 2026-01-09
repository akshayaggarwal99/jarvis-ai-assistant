import { Logger } from '../../core/logger';
import { OptimizedAnalyticsManager } from '../../analytics/optimized-analytics-manager';
import { ContextDetector } from '../../context/context-detector';
import { CorrectionDetector } from '../../services/correction-detector';
import { nodeDictionaryService } from '../../services/node-dictionary';
import UserFeedbackService from '../../services/user-feedback-service';
import { AudioSessionManager } from '../managers/audio-session-manager';
import { TranscriptionSessionManager } from '../managers/transcription-session-manager';
import { SessionStateManager } from '../managers/session-state-manager';
import { OutputManager } from '../managers/output-manager';
import { CommandProcessor } from '../processors/command-processor';
import { TextProcessor } from '../processors/text-processor';
import { PushToTalkOptions } from '../types/push-to-talk-types';

export class PushToTalkOrchestrator {
  private audioManager: AudioSessionManager;
  private transcriptionManager: TranscriptionSessionManager;
  private stateManager: SessionStateManager;
  private outputManager: OutputManager;
  private commandProcessor: CommandProcessor;
  private textProcessor: TextProcessor;

  private analyticsManager: OptimizedAnalyticsManager;
  private contextDetector: ContextDetector;
  private correctionDetector: CorrectionDetector;
  private feedbackService = UserFeedbackService.getInstance();
  private options: PushToTalkOptions;
  private _isHandsFreeMode: boolean = false;
  private onBeforeOutput?: () => void;

  constructor(analyticsManager: OptimizedAnalyticsManager, options: PushToTalkOptions = {}) {
    this.analyticsManager = analyticsManager;
    this.options = options;
    this.onBeforeOutput = options.onBeforeOutput;

    // Initialize managers
    this.stateManager = new SessionStateManager({
      onAudioLevel: options.onAudioLevel,
      onStateChange: options.onStateChange,
      onTranscriptionState: options.onTranscriptionState,
      onPartialTranscript: options.onPartialTranscript
    });

    this.audioManager = new AudioSessionManager(options.audioFeedback);

    this.transcriptionManager = new TranscriptionSessionManager(
      analyticsManager,
      options.useStreamingTranscription,
      options.onPartialTranscript
    );

    this.outputManager = new OutputManager(analyticsManager);

    // Initialize processors
    this.commandProcessor = new CommandProcessor(analyticsManager);
    this.textProcessor = new TextProcessor(analyticsManager);

    // Initialize services
    this.contextDetector = new ContextDetector();
    this.correctionDetector = new CorrectionDetector((suggestions) => {
      this.handleCorrectionSuggestions(suggestions);
    });

    Logger.info('🎤 [Orchestrator] Initialized with all components');
  }

  /**
   * Start the push-to-talk recording session
   */
  async start(): Promise<void> {
    console.log('🎬 [Orchestrator] start() called - isActive:', this.stateManager.isActive());
    if (this.stateManager.isActive()) {
      Logger.warning('⚠️ [Orchestrator] Already active, ignoring start request');
      return;
    }

    Logger.info('🎬 [Orchestrator] Starting push-to-talk session');

    // Clean up any lingering streaming sessions in background - don't block audio start
    setImmediate(() => {
      this.transcriptionManager.cleanup().catch(error => {
        Logger.warning('⚠️ [Orchestrator] Background cleanup failed:', error);
      });
    });

    try {
      // Start new session
      const sessionId = this.analyticsManager.startSession();
      this.stateManager.startSession(sessionId);

      // 🚀 INSTANT AUDIO START - Start recording immediately for zero-latency
      await this.audioManager.startRecording(this.options.onAudioLevel);
      Logger.success('✅ [Orchestrator] Recording started successfully');

      // ⚡ DEFERRED BACKGROUND TASKS - Run context detection completely in background
      setImmediate(() => {
        // Start background tasks without blocking the main flow
        const backgroundTasks = Promise.all([
          this.preDetectContext(),
          this.initializeStreamingIfNeeded()
        ]);

        // Handle background task failures gracefully
        backgroundTasks.catch(error => {
          Logger.warning('⚠️ [Orchestrator] Some background tasks failed (audio recording continues):', error);
        });
      });

    } catch (error) {
      Logger.error('❌ [Orchestrator] Failed to start recording:', error);

      this.analyticsManager.trackError('recording_start_failed', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });

      this.stateManager.cancelCurrent('error');
      throw error;
    }
  }

  /**
   * Stop recording and process the complete flow
   */
  async stop(): Promise<void> {
    console.log('🛑 [Orchestrator] stop() called - isActive:', this.stateManager.isActive());
    if (!this.stateManager.isActive()) {
      Logger.warning('⚠️ [Orchestrator] No active session to stop');
      return;
    }

    Logger.info('🛑 [Orchestrator] Stopping recording and processing');

    const stopStartTime = Date.now();
    const keyReleaseTime = (global as any).keyReleaseTime || stopStartTime;
    const transcriptionId = Date.now().toString();

    try {
      // Start transcription
      this.stateManager.startTranscription(transcriptionId, keyReleaseTime);

      // Stop audio recording and get session data
      const audioSessionData = this.audioManager.stopRecording();
      this.stateManager.updateSessionAudio(audioSessionData.buffer!, audioSessionData.duration);

      // Handle streaming vs traditional transcription
      const shouldUseStreaming = this.transcriptionManager.isStreamingEnabled() || this._isHandsFreeMode;

      if (shouldUseStreaming) {
        await this.handleStreamingFlow(audioSessionData, transcriptionId, keyReleaseTime);
      } else {
        await this.handleTraditionalFlow(audioSessionData, transcriptionId, keyReleaseTime);
      }

    } catch (error) {
      Logger.error('❌ [Orchestrator] Error during stop processing:', error);

      this.analyticsManager.trackError('stop_processing_failed', {
        error: error instanceof Error ? error.message : String(error),
        transcriptionId,
        timestamp: new Date().toISOString()
      });

      this.stateManager.cancelCurrent('error');
      throw error;
    } finally {
      // Always cleanup streaming resources after processing to prevent race conditions
      try {
        await this.transcriptionManager.cleanup();
        Logger.debug('🧹 [Orchestrator] Transcription cleanup completed');
      } catch (error) {
        Logger.warning('⚠️ [Orchestrator] Cleanup after stop failed:', error);
      }

      // Emergency audio cleanup to ensure microphones stop
      try {
        this.audioManager.forceStop();
        Logger.debug('🧹 [Orchestrator] Audio force stop completed');
      } catch (audioError) {
        Logger.warning('⚠️ [Orchestrator] Audio cleanup error (expected):', audioError);
      }
    }
  }

  /**
   * Handle streaming transcription flow
   */
  private async handleStreamingFlow(audioSessionData: any, transcriptionId: string, keyReleaseTime: number): Promise<void> {
    Logger.info('🌊 [Orchestrator] Processing streaming flow');

    // Check for ultra-fast mode with accumulated text
    const streamingText = this.transcriptionManager.getStreamingText();
    if (streamingText && streamingText.trim().length > 0) {
      Logger.info('⚡ [Orchestrator] Using accumulated streaming text for ultra-fast processing');

      // Reposition UI before output (e.g., move waveform to frontmost app's screen)
      Logger.info('🔄 [Orchestrator] Calling onBeforeOutput callback (ultra-fast)');
      this.onBeforeOutput?.();

      let pasteSuccess = true;
      try {
        await this.outputManager.outputTextUltraFast(streamingText.trim(), 'deepgram-streaming-immediate');
      } catch (outputError) {
        Logger.warning('⚠️ [Orchestrator] Ultra-fast paste failed:', outputError);
        pasteSuccess = false;
      }
      this.stateManager.endSession(pasteSuccess);

      // Cleanup audio resources after ultra-fast output
      try {
        this.audioManager.forceStop();
        Logger.debug('🧹 [Orchestrator] Audio cleanup after ultra-fast output');
      } catch (cleanupError) {
        Logger.debug('⚠️ [Orchestrator] Audio cleanup after ultra-fast (expected):', cleanupError);
      }

      return;
    }

    // Process streaming transcription
    const transcriptionResult = await this.transcriptionManager.transcribe(audioSessionData, transcriptionId, keyReleaseTime);

    if (!transcriptionResult) {
      Logger.warning('🌊 [Orchestrator] No streaming result, falling back to traditional');
      await this.handleTraditionalFlow(audioSessionData, transcriptionId, keyReleaseTime);
      return;
    }

    await this.processTranscriptionResult(transcriptionResult, transcriptionId);
  }

  /**
   * Handle traditional transcription flow
   */
  private async handleTraditionalFlow(audioSessionData: any, transcriptionId: string, keyReleaseTime: number): Promise<void> {
    Logger.info('🎙️ [Orchestrator] Processing traditional flow');

    const transcriptionResult = await this.transcriptionManager.transcribe(audioSessionData, transcriptionId, keyReleaseTime);

    if (!transcriptionResult) {
      Logger.error('❌ [Orchestrator] Traditional transcription failed');
      this.stateManager.cancelCurrent('error');
      this.feedbackService.showTroubleshootingGuide('no-text');
      return;
    }

    await this.processTranscriptionResult(transcriptionResult, transcriptionId);
  }

  /**
   * Process the transcription result through command detection and text processing
   */
  private async processTranscriptionResult(transcriptionResult: any, transcriptionId: string): Promise<void> {
    if (!this.stateManager.shouldContinueTranscription(transcriptionId)) {
      Logger.info('🚫 [Orchestrator] Transcription cancelled before processing result');
      return;
    }

    const appContext = this.stateManager.getState().preDetectedContext || this.contextDetector.detectContext();

    // Process command
    const commandResult = await this.commandProcessor.processCommand(
      transcriptionResult.text,
      appContext,
      transcriptionResult.model
    );

    // If command processing handles everything, we're done
    if (commandResult.skipRemainingProcessing) {
      Logger.info(`🎯 [Orchestrator] ${commandResult.processingType} command handled, ending session`);

      let pasteSuccess = true;
      // For assistant commands, output the response text if any was generated
      if (commandResult.processingType === 'assistant' && commandResult.text && commandResult.text.trim().length > 0) {
        Logger.info(`📝 [Orchestrator] Outputting assistant response: "${commandResult.text.substring(0, 50)}..."`);
        // Reposition UI before output (e.g., move waveform to frontmost app's screen)
        Logger.info('🔄 [Orchestrator] Calling onBeforeOutput callback (assistant)');
        this.onBeforeOutput?.();
        try {
          await this.outputManager.outputText(commandResult.text, transcriptionResult.model);
        } catch (outputError) {
          Logger.warning('⚠️ [Orchestrator] Assistant paste failed:', outputError);
          pasteSuccess = false;
        }
      }

      this.stateManager.endSession(pasteSuccess);

      // Cleanup audio resources after assistant command
      try {
        this.audioManager.forceStop();
        Logger.debug('🧹 [Orchestrator] Audio cleanup after assistant command');
      } catch (cleanupError) {
        Logger.debug('⚠️ [Orchestrator] Audio cleanup after assistant (expected):', cleanupError);
      }

      return;
    }

    // Process text (dictation)
    const processedText = await this.textProcessor.processText(
      commandResult.text,
      appContext,
      transcriptionResult.model
    );

    // Output the final text
    if (!this.stateManager.shouldContinueTranscription(transcriptionId)) {
      Logger.info('🚫 [Orchestrator] Transcription cancelled before output');
      return;
    }

    // Reposition UI before output (e.g., move waveform to frontmost app's screen)
    Logger.info('🔄 [Orchestrator] Calling onBeforeOutput callback (dictation)');
    this.onBeforeOutput?.();

    let pasteSuccess = true;
    try {
      await this.outputManager.outputText(processedText, transcriptionResult.model);
    } catch (outputError) {
      Logger.warning('⚠️ [Orchestrator] Dictation paste failed:', outputError);
      pasteSuccess = false;
    }

    // Save analytics BEFORE ending session (needs session data)
    this.saveAnalytics(processedText, transcriptionResult.model, commandResult.isAssistantCommand);

    // End session and start monitoring
    this.stateManager.endSession(pasteSuccess);

    // Cleanup audio resources after session ends
    try {
      this.audioManager.forceStop();
      Logger.debug('🧹 [Orchestrator] Audio cleanup after session end');
    } catch (cleanupError) {
      Logger.debug('⚠️ [Orchestrator] Audio cleanup after session end (expected):', cleanupError);
    }
    this.startCorrectionMonitoring(processedText);
  }

  /**
   * Cancel current operation
   */
  async cancel(): Promise<void> {
    Logger.info('🛑 [Orchestrator] Cancelling current operation');

    try {
      // Stop audio if recording
      this.audioManager.forceStop();

      // Clean up transcription
      await this.transcriptionManager.cleanup();

      // Clear output corrections
      this.outputManager.clearCorrections();

      // Cancel state
      this.stateManager.cancelCurrent('user');

      Logger.info('✅ [Orchestrator] Operation cancelled successfully');
    } catch (error) {
      Logger.error('❌ [Orchestrator] Error during cancellation:', error);
      this.stateManager.emergencyStop();
    }
  }

  /**
   * Emergency stop all operations
   */
  emergencyStop(): void {
    Logger.warning('🚨 [Orchestrator] Emergency stop activated');

    try {
      this.audioManager.forceStop();
      this.transcriptionManager.cleanup();
      this.outputManager.clearCorrections();
      this.stateManager.emergencyStop();

      Logger.warning('🛑 [Orchestrator] Emergency stop completed');
    } catch (error) {
      Logger.error('❌ [Orchestrator] Emergency stop failed:', error);
    }
  }

  /**
   * Pre-detect context in background
   */
  private async preDetectContext(): Promise<void> {
    try {
      const contextStartTime = Date.now();
      const appContext = this.contextDetector.detectContext();
      const contextDetectionTime = Date.now() - contextStartTime;

      this.stateManager.setPreDetectedContext(appContext);

      Logger.info(`🎯 [Orchestrator] Pre-detected context in ${contextDetectionTime}ms - Type: ${appContext.type}, App: ${appContext.activeApp}`);
    } catch (error) {
      Logger.warning('⚠️ [Orchestrator] Context pre-detection failed:', error);
    }
  }

  /**
   * Initialize streaming if needed
   */
  private async initializeStreamingIfNeeded(): Promise<void> {
    const shouldUseStreaming = this.transcriptionManager.isStreamingEnabled() || this._isHandsFreeMode;

    if (shouldUseStreaming) {
      try {
        await this.transcriptionManager.initializeStreaming();
        Logger.info('✅ [Orchestrator] Streaming initialized' + (this._isHandsFreeMode ? ' (hands-free mode)' : ''));
      } catch (error) {
        Logger.error('❌ [Orchestrator] Failed to initialize streaming:', error);
      }
    }
  }

  /**
   * Start correction monitoring in background
   */
  private startCorrectionMonitoring(text: string): void {
    const sessionId = this.stateManager.getCurrentSessionId();

    if (text && sessionId) {
      setImmediate(() => {
        Logger.debug(`🔍 [Orchestrator] Starting correction monitoring for session: ${sessionId}`);
        this.correctionDetector.startMonitoring(text, sessionId);
      });
    }
  }

  /**
   * Save analytics in background
   */
  private saveAnalytics(text: string, modelUsed: string, isAssistantCommand: boolean): void {
    const sessionId = this.stateManager.getCurrentSessionId();
    const session = this.stateManager.getActiveSession();

    if (sessionId && session && text) {
      const mode = isAssistantCommand ? 'command' : 'dictation';

      setImmediate(async () => {
        try {
          await this.analyticsManager.endSession(text, session.duration, modelUsed, mode);
          Logger.debug(`📊 [Orchestrator] Analytics saved for session: ${sessionId}`);
        } catch (error) {
          Logger.error(`📊 [Orchestrator] Analytics save failed for session: ${sessionId}:`, error);
        }
      });
    }
  }

  /**
   * Handle correction suggestions
   */
  private handleCorrectionSuggestions(suggestions: any[]): void {
    Logger.info(`[Orchestrator] Received ${suggestions.length} correction suggestions`);

    // Convert and process suggestions
    const dictionarySuggestions = suggestions.map(s => ({
      originalWord: s.original,
      suggestedWord: s.suggested,
      context: s.context,
      confidence: s.confidence
    }));

    // Auto-add high-confidence suggestions
    const highConfidenceSuggestions = dictionarySuggestions.filter(s => s.confidence > 0.8);
    if (highConfidenceSuggestions.length > 0) {
      const newEntries = nodeDictionaryService.processSuggestions(highConfidenceSuggestions);
      Logger.info(`[Orchestrator] Auto-added ${newEntries.length} high-confidence entries`);
    }
  }

  /**
   * Update orchestrator options
   */
  updateOptions(options: Partial<PushToTalkOptions>): void {
    // Update streaming mode
    if (options.useStreamingTranscription !== undefined) {
      this.transcriptionManager.setStreamingMode(options.useStreamingTranscription);
    }

    // Update audio feedback
    if (options.audioFeedback !== undefined) {
      this.audioManager.setAudioFeedback(options.audioFeedback);
    }

    // Update event handlers
    this.stateManager.updateEvents({
      onAudioLevel: options.onAudioLevel,
      onStateChange: options.onStateChange,
      onTranscriptionState: options.onTranscriptionState,
      onPartialTranscript: options.onPartialTranscript
    });

    Logger.debug('⚙️ [Orchestrator] Updated options');
  }

  /**
   * Get current service state
   */
  getState(): any {
    return {
      isActive: this.stateManager.isActive(),
      isTranscribing: this.stateManager.isTranscribing(),
      isRecording: this.audioManager.isRecording(),
      currentSessionId: this.stateManager.getCurrentSessionId(),
      currentTranscriptionId: this.stateManager.getCurrentTranscriptionId()
    };
  }

  /**
   * Clear agent memory
   */
  async clearAgentMemory(): Promise<void> {
    await this.commandProcessor.clearAgentMemory();
  }

  /**
   * Set hands-free mode flag
   */
  setHandsFreeMode(isHandsFree: boolean): void {
    this._isHandsFreeMode = isHandsFree;
    Logger.debug(`🎤 [Orchestrator] Hands-free mode set to: ${isHandsFree}`);
  }

  /**
   * Get hands-free mode status
   */
  isHandsFreeMode(): boolean {
    return this._isHandsFreeMode;
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    await this.cancel();
    await this.transcriptionManager.cleanup();
    this.outputManager.stopCorrectionMonitoring();
    Logger.info('🧹 [Orchestrator] Cleanup completed');
  }
}
