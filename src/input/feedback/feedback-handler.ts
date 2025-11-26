import { Logger } from '../../core/logger';
import UserFeedbackService from '../../services/user-feedback-service';
import { AppContext } from '../../interfaces/transcription';

export interface FeedbackOptions {
  showNotifications?: boolean;
  enableSounds?: boolean;
  context?: AppContext;
}

export interface FeedbackEvent {
  type: 'recording_start' | 'recording_stop' | 'transcription_complete' | 'error' | 'processing' | 'success';
  message?: string;
  data?: any;
}

/**
 * Manages user feedback during push-to-talk operations
 */
export class FeedbackHandler {
  private feedbackService: UserFeedbackService;
  private isShowingFeedback: boolean = false;
  private lastFeedbackTime: number = 0;
  private feedbackQueue: FeedbackEvent[] = [];

  constructor(private options: FeedbackOptions = {}) {
    this.feedbackService = UserFeedbackService.getInstance();
  }

  /**
   * Handle feedback for recording events
   */
  async handleFeedback(event: FeedbackEvent): Promise<void> {
    try {
      this.lastFeedbackTime = Date.now();
      
      Logger.debug(`🔔 [Feedback] Handling event: ${event.type}`);

      switch (event.type) {
        case 'recording_start':
          await this.handleRecordingStart(event);
          break;
          
        case 'recording_stop':
          await this.handleRecordingStop(event);
          break;
          
        case 'transcription_complete':
          await this.handleTranscriptionComplete(event);
          break;
          
        case 'processing':
          await this.handleProcessing(event);
          break;
          
        case 'success':
          await this.handleSuccess(event);
          break;
          
        case 'error':
          await this.handleError(event);
          break;
          
        default:
          Logger.warning(`⚠️ [Feedback] Unknown event type: ${event.type}`);
      }
    } catch (error) {
      Logger.error('❌ [Feedback] Failed to handle feedback:', error);
    }
  }

  /**
   * Handle recording start feedback
   */
  private async handleRecordingStart(event: FeedbackEvent): Promise<void> {
    if (this.options.showNotifications) {
      Logger.info('🎤 [Feedback] Recording started');
    }
    
    // Visual feedback could be added here
    this.isShowingFeedback = true;
  }

  /**
   * Handle recording stop feedback
   */
  private async handleRecordingStop(event: FeedbackEvent): Promise<void> {
    if (this.options.showNotifications) {
      Logger.info('⏹️ [Feedback] Recording stopped, processing...');
    }
    
    this.isShowingFeedback = false;
  }

  /**
   * Handle transcription complete feedback
   */
  private async handleTranscriptionComplete(event: FeedbackEvent): Promise<void> {
    if (event.message && this.options.showNotifications) {
      Logger.success(`✅ [Feedback] Transcription: "${event.message.substring(0, 50)}${event.message.length > 50 ? '...' : ''}"`);
    }
  }

  /**
   * Handle processing feedback
   */
  private async handleProcessing(event: FeedbackEvent): Promise<void> {
    if (this.options.showNotifications) {
      Logger.info(`⚙️ [Feedback] Processing: ${event.message || 'Working...'}`);
    }
  }

  /**
   * Handle success feedback
   */
  private async handleSuccess(event: FeedbackEvent): Promise<void> {
    if (this.options.showNotifications) {
      Logger.success(`✅ [Feedback] Success: ${event.message || 'Operation completed'}`);
    }
    
    this.isShowingFeedback = false;
  }

  /**
   * Handle error feedback
   */
  private async handleError(event: FeedbackEvent): Promise<void> {
    if (this.options.showNotifications) {
      Logger.error(`❌ [Feedback] Error: ${event.message || 'Operation failed'}`);
      
      // Show appropriate user tip based on error
      if (event.message?.includes('permission')) {
        this.feedbackService.showTip('permission-needed');
      } else if (event.message?.includes('network')) {
        this.feedbackService.showTip('slow-network');
      } else if (event.message?.includes('audio')) {
        this.feedbackService.showTip('no-audio');
      }
    }
    
    this.isShowingFeedback = false;
  }

  /**
   * Queue feedback for later processing
   */
  queueFeedback(event: FeedbackEvent): void {
    this.feedbackQueue.push(event);
    
    // Process queue if not already showing feedback
    if (!this.isShowingFeedback) {
      this.processQueue();
    }
  }

  /**
   * Process queued feedback events
   */
  private async processQueue(): Promise<void> {
    while (this.feedbackQueue.length > 0 && !this.isShowingFeedback) {
      const event = this.feedbackQueue.shift();
      if (event) {
        await this.handleFeedback(event);
        
        // Small delay between feedback events
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Clear all queued feedback
   */
  clearQueue(): void {
    this.feedbackQueue = [];
    this.isShowingFeedback = false;
    Logger.debug('🧹 [Feedback] Cleared feedback queue');
  }

  /**
   * Check if feedback is currently being shown
   */
  isActive(): boolean {
    return this.isShowingFeedback;
  }

  /**
   * Get feedback options
   */
  getOptions(): FeedbackOptions {
    return { ...this.options };
  }

  /**
   * Update feedback options
   */
  updateOptions(options: Partial<FeedbackOptions>): void {
    this.options = { ...this.options, ...options };
    Logger.debug('⚙️ [Feedback] Updated feedback options');
  }

  /**
   * Get feedback statistics
   */
  getStats(): { totalEvents: number; queueLength: number; lastEventTime: number } {
    return {
      totalEvents: 0, // Could be tracked
      queueLength: this.feedbackQueue.length,
      lastEventTime: this.lastFeedbackTime
    };
  }

  /**
   * Show a quick tip to the user
   */
  showTip(type: 'first-use' | 'fn-key-guide' | 'permission-needed' | 'slow-network' | 'no-audio'): void {
    this.feedbackService.showTip(type);
  }

  /**
   * Emergency stop all feedback
   */
  emergencyStop(): void {
    this.clearQueue();
    this.isShowingFeedback = false;
    Logger.warning('🛑 [Feedback] Emergency stop activated');
  }
}
