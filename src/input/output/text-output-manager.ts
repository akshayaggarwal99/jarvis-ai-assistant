import { TextPaster } from '../text-paster';
import { FastStreamingPaster } from '../fast-streaming-paster';
import { CorrectionDetector, CorrectionSuggestion } from '../../services/correction-detector';
import UserFeedbackService from '../../services/user-feedback-service';
import { Logger } from '../../core/logger';
import { AppContext } from '../../interfaces/transcription';

export interface OutputOptions {
  useStreaming?: boolean;
  enableCorrections?: boolean;
  context?: AppContext;
}

export interface OutputResult {
  success: boolean;
  charactersTyped?: number;
  corrections?: CorrectionSuggestion[];
  error?: string;
}

/**
 * Manages text output functionality including pasting and corrections
 */
export class TextOutputManager {
  private textPaster: TextPaster;
  private correctionDetector: CorrectionDetector;
  private feedbackService: UserFeedbackService;

  constructor() {
    this.textPaster = new TextPaster();
    this.feedbackService = UserFeedbackService.getInstance();
    
    // Initialize correction detector with callback
    this.correctionDetector = new CorrectionDetector((suggestions) => {
      this.handleCorrectionSuggestions(suggestions);
    });
  }

  /**
   * Output text to the active application
   */
  async outputText(text: string, options: OutputOptions = {}): Promise<OutputResult> {
    try {
      Logger.info(`📝 [Output] Outputting text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

      const { useStreaming = false, enableCorrections = true } = options;

      let result: OutputResult;

      if (useStreaming) {
        result = await this.handleStreamingOutput(text, options);
      } else {
        result = await this.handleTraditionalOutput(text, options);
      }

      // Set up correction detection if enabled
      if (enableCorrections && result.success) {
        this.setupCorrectionDetection(text);
      }

      return result;
    } catch (error) {
      Logger.error('❌ [Output] Failed to output text:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle traditional text output
   */
  private async handleTraditionalOutput(text: string, options: OutputOptions): Promise<OutputResult> {
    try {
      await this.textPaster.pasteText(text);
      
      Logger.success(`✅ [Output] Traditional paste completed: ${text.length} characters`);
      
      return {
        success: true,
        charactersTyped: text.length
      };
    } catch (error) {
      Logger.error('❌ [Output] Traditional paste failed:', error);
      throw error;
    }
  }

  /**
   * Handle streaming text output
   */
  private async handleStreamingOutput(text: string, options: OutputOptions): Promise<OutputResult> {
    try {
      await FastStreamingPaster.pasteFast(text);
      
      Logger.success(`✅ [Output] Streaming paste completed: ${text.length} characters`);
      
      return {
        success: true,
        charactersTyped: text.length
      };
    } catch (error) {
      Logger.error('❌ [Output] Streaming paste failed:', error);
      throw error;
    }
  }

  /**
   * Setup correction detection for the output text
   */
  private setupCorrectionDetection(text: string): void {
    try {
      // Start monitoring for corrections
      this.correctionDetector.startMonitoring(text);
      Logger.debug('🔍 [Corrections] Started monitoring for corrections');
    } catch (error) {
      Logger.error('❌ [Corrections] Failed to setup correction detection:', error);
    }
  }

  /**
   * Handle correction suggestions from the detector
   */
  private handleCorrectionSuggestions(suggestions: CorrectionSuggestion[]): void {
    if (suggestions.length === 0) return;

    Logger.info(`🔧 [Corrections] Received ${suggestions.length} correction suggestions`);

    // Process suggestions (can be extended for UI display)
    suggestions.forEach((suggestion, index) => {
      Logger.debug(`🔧 [Correction ${index + 1}] Original: "${suggestion.original}" → Suggested: "${suggestion.suggested}"`);
    });

    // Show feedback to user if configured
    if (suggestions.length > 0) {
      this.feedbackService.showTip('no-audio'); // Use existing tip type
    }
  }

  /**
   * Get streaming paster class for direct control
   */
  getStreamingPaster(): typeof FastStreamingPaster {
    return FastStreamingPaster;
  }

  /**
   * Get text paster instance for direct control
   */
  getTextPaster(): TextPaster {
    return this.textPaster;
  }

  /**
   * Stop correction monitoring
   */
  stopCorrectionMonitoring(): void {
    try {
      this.correctionDetector.stopMonitoring();
      Logger.debug('🛑 [Corrections] Stopped correction monitoring');
    } catch (error) {
      Logger.error('❌ [Corrections] Failed to stop correction monitoring:', error);
    }
  }

  /**
   * Clear any pending corrections
   */
  clearCorrections(): void {
    try {
      // Clear correction detector state
      this.correctionDetector.stopMonitoring();
      Logger.debug('🧹 [Corrections] Cleared correction state');
    } catch (error) {
      Logger.error('❌ [Corrections] Failed to clear corrections:', error);
    }
  }

  /**
   * Check if streaming is available
   */
  isStreamingAvailable(): boolean {
    return typeof FastStreamingPaster.pasteFast === 'function';
  }

  /**
   * Get output statistics
   */
  getOutputStats(): { totalCharacters: number; totalOperations: number } {
    // Placeholder for future statistics tracking
    return {
      totalCharacters: 0,
      totalOperations: 0
    };
  }
}
