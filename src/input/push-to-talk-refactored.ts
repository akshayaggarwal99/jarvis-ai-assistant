import { Logger } from '../core/logger';
import { OptimizedAnalyticsManager } from '../analytics/optimized-analytics-manager';
import { PushToTalkOrchestrator } from './orchestrators/push-to-talk-orchestrator';
import { PushToTalkOptions } from './types/push-to-talk-types';

export class PushToTalkService {
  private orchestrator: PushToTalkOrchestrator;
  private analyticsManager: OptimizedAnalyticsManager;
  private _isHandsFreeMode: boolean = false;

  constructor(
    analyticsManager: OptimizedAnalyticsManager,
    onAudioLevel?: (level: number) => void,
    onStateChange?: (isActive: boolean) => void,
    onTranscriptionState?: (isTranscribing: boolean) => void,
    onPartialTranscript?: (partialText: string) => void,
    audioFeedback: boolean = true,
    useStreamingTranscription: boolean = false,
    onBeforeOutput?: () => void
  ) {
    this.analyticsManager = analyticsManager;

    const options: PushToTalkOptions = {
      useStreamingTranscription,
      audioFeedback,
      onAudioLevel,
      onStateChange,
      onTranscriptionState,
      onPartialTranscript,
      onBeforeOutput
    };

    this.orchestrator = new PushToTalkOrchestrator(analyticsManager, options);

    Logger.info('🎤 [PushToTalk] Service initialized with new architecture');
  }

  /**
   * Start recording
   */
  async start(): Promise<void> {
    // Pass hands-free mode to orchestrator
    this.orchestrator.setHandsFreeMode(this._isHandsFreeMode);
    await this.orchestrator.start();
  }

  /**
   * Stop recording and process
   */
  async stop(): Promise<void> {
    await this.orchestrator.stop();
  }

  /**
   * Cancel current operation
   */
  async cancelOperation(): Promise<void> {
    await this.orchestrator.cancel();
  }

  /**
   * Hard stop - emergency cancellation
   */
  hardStop(): void {
    this.orchestrator.emergencyStop();
  }

  /**
   * Check if currently active
   */
  get active(): boolean {
    return this.orchestrator.getState().isActive;
  }

  set active(value: boolean) {
    // This setter is for compatibility but state should be managed through start/stop
    Logger.debug(`🎤 [PushToTalk] Active state setter called with: ${value}`);
  }

  /**
   * Check if currently transcribing
   */
  get transcribing(): boolean {
    return this.orchestrator.getState().isTranscribing;
  }

  /**
   * Hands-free mode getter/setter for compatibility with main.ts
   */
  get isHandsFreeMode(): boolean {
    return this._isHandsFreeMode;
  }

  set isHandsFreeMode(value: boolean) {
    this._isHandsFreeMode = value;
    Logger.debug(`🎤 [PushToTalk] Hands-free mode set to: ${value}`);
  }

  /**
   * Set recording start time (for compatibility)
   */
  set recordingStartTime(time: number) {
    Logger.debug(`🎤 [PushToTalk] Recording start time setter called with: ${time}`);
  }

  /**
   * Get recording start time (for compatibility)
   */
  get recordingStartTime(): number {
    return Date.now(); // Placeholder for compatibility
  }

  /**
   * Enable or disable streaming transcription
   */
  setStreamingMode(enabled: boolean): void {
    this.orchestrator.updateOptions({ useStreamingTranscription: enabled });
  }

  /**
   * Check if streaming is enabled
   */
  isStreamingEnabled(): boolean {
    return this.orchestrator.getState().isStreamingEnabled || false;
  }

  /**
   * Get context-specific keywords for improved transcription accuracy
   */
  getContextKeywords(): string[] {
    try {
      // Since we have a text processor, we can get keywords through it
      // For compatibility, we'll return an empty array if not available
      return [];
    } catch (error) {
      Logger.warning('🔤 [PushToTalk] Failed to get context keywords:', error);
      return [];
    }
  }

  /**
   * Clear agent memory
   */
  async clearAgentMemory(): Promise<void> {
    await this.orchestrator.clearAgentMemory();
  }

  /**
   * Update service options
   */
  updateOptions(options: Partial<PushToTalkOptions>): void {
    this.orchestrator.updateOptions(options);
  }

  /**
   * Get service statistics
   */
  getStats(): any {
    return this.orchestrator.getState();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.orchestrator.cleanup();
  }

  // Legacy compatibility methods (for existing code that might call these)
  
  /**
   * @deprecated Use start() instead
   */
  async startRecording(): Promise<void> {
    Logger.warning('⚠️ [PushToTalk] startRecording() is deprecated, use start() instead');
    await this.start();
  }

  /**
   * @deprecated Use stop() instead
   */
  async stopRecording(): Promise<void> {
    Logger.warning('⚠️ [PushToTalk] stopRecording() is deprecated, use stop() instead');
    await this.stop();
  }

  /**
   * @deprecated Use getStats() instead
   */
  isActive(): boolean {
    return this.active;
  }
}
