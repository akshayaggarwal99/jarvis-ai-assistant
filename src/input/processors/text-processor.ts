import { Logger } from '../../core/logger';
import { ContextAwarePostProcessor } from '../context-aware-post-processor';
import { AppSettingsService } from '../../services/app-settings-service';
import { OptimizedAnalyticsManager } from '../../analytics/optimized-analytics-manager';
import { PostProcessingOptions, PostProcessingResult } from '../types/push-to-talk-types';
import { AppContext } from '../../interfaces/transcription';

export class TextProcessor {
  private postProcessor: ContextAwarePostProcessor;
  private analyticsManager: OptimizedAnalyticsManager;

  constructor(analyticsManager: OptimizedAnalyticsManager) {
    this.analyticsManager = analyticsManager;
    this.postProcessor = new ContextAwarePostProcessor();
  }

  /**
   * Process text with context-aware formatting and corrections
   */
  async processText(text: string, appContext: AppContext, modelUsed: string): Promise<string> {
    const processingStartTime = Date.now();
    Logger.info(`🔄 [TextProcessor] Processing text: "${text}"`);

    // Check if user has post-processing enabled
    let userWantsPostProcessing = false;
    let isEmailContext = appContext.type === 'email';
    
    try {
      const appSettings = AppSettingsService.getInstance();
      const settings = appSettings.getSettings();
      userWantsPostProcessing = settings.aiPostProcessing;
      
      // Override for tutorial mode
      const isVoiceTutorialMode = (global as any).isVoiceTutorialMode;
      const isEmailTutorialMode = (global as any).isEmailTutorialMode;
      if (isVoiceTutorialMode || isEmailTutorialMode) {
        userWantsPostProcessing = true;
        Logger.info('🎯 [TextProcessor] Forcing AI post-processing ON for tutorial mode');
      }
    } catch (error) {
      Logger.warning('Failed to get post-processing setting:', error);
    }

    // Handle special tutorial mode
    if ((global as any).isVoiceTutorialMode) {
      return await this.handleTutorialMode(text, appContext, userWantsPostProcessing);
    }

    // Handle email context with fast formatting
    if (isEmailContext) {
      return await this.handleEmailContext(text, appContext, modelUsed);
    }

    // ULTRA-FAST MODE: Skip post-processing if disabled and not email context
    if (!userWantsPostProcessing && !isEmailContext) {
      Logger.info('⚡ [TextProcessor] Post-processing disabled - using text as-is');
      return text;
    }

    // Apply full post-processing
    return await this.applyPostProcessing(text, appContext, modelUsed, processingStartTime);
  }

  /**
   * Handle tutorial mode text processing
   */
  private async handleTutorialMode(text: string, appContext: AppContext, userWantsPostProcessing: boolean): Promise<string> {
    const isEmailTutorialMode = (global as any).isEmailTutorialMode;
    
    // Force email context if in email tutorial mode
    let contextForProcessing = appContext;
    if (isEmailTutorialMode) {
      contextForProcessing = {
        activeApp: 'jarvis-email-tutorial',
        windowTitle: 'Email Tutorial',
        type: 'email'
      };
    }
    
    // Apply full context-aware post-processing for tutorial mode
    let formattedText = text;
    if (userWantsPostProcessing) {
      try {
        const formattedResult = await this.postProcessor.processText(text, contextForProcessing, {
          enableDictionaryCorrections: true,
          enableContextFormatting: true,
          enableSmartKeywords: false // Disabled for better performance in tutorial mode
        });
        formattedText = formattedResult.processedText;
      } catch (error) {
        Logger.error('🎯 [TextProcessor] Failed to apply formatting for tutorial mode:', error);
        formattedText = text; // Fallback to original text
      }
    }
    
    // Send formatted transcription to tutorial interface via IPC
    try {
      const { BrowserWindow } = require('electron');
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach(window => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('tutorial-transcription', formattedText);
        }
      });
    } catch (error) {
      Logger.error('🎯 [TextProcessor] Failed to send tutorial transcription:', error);
    }
    
    return formattedText;
  }

  /**
   * Handle email context with fast formatting
   */
  private async handleEmailContext(text: string, appContext: AppContext, modelUsed: string): Promise<string> {
    Logger.info('📧 [TextProcessor] Applying cloud-based email formatting');
    
    try {
      // Use cloud-based post-processing for emails to get better self-correction handling
      const postProcessingResult = await this.postProcessor.processText(text, appContext, {
        enableDictionaryCorrections: false, // Skip dictionary for speed
        enableContextFormatting: true, // Use cloud formatting
        enableSmartKeywords: false,
        fastMode: false // Force full AI processing for emails
      });
      
      const emailFormattedText = postProcessingResult.processedText;
      
      if (emailFormattedText !== text) {
        Logger.info(`📧 [TextProcessor] Cloud email formatting applied: "${text.substring(0, 30)}..." → "${emailFormattedText.substring(0, 30)}..."`);
        
        // Track email formatting
        this.analyticsManager.trackEvent('email_cloud_formatting', {
          textLength: emailFormattedText.length,
          model: modelUsed,
          originalLength: text.length,
          processingTime: postProcessingResult.processingTime,
          formattingApplied: postProcessingResult.formattingApplied,
          timestamp: new Date().toISOString()
        });
        
        return emailFormattedText;
      }
    } catch (error) {
      Logger.warning('📧 [TextProcessor] Cloud email formatting failed, using original text:', error);
    }
    
    return text;
  }

  /**
   * Apply full post-processing with all features
   */
  private async applyPostProcessing(text: string, appContext: AppContext, modelUsed: string, processingStartTime: number): Promise<string> {
    try {
      Logger.debug(`🔄 [TextProcessor] Starting post-processing for text: "${text}"`);
      
      // Get settings for post-processing options
      let enableAIFormatting = true;
      let fastMode = false;
      
      try {
        const appSettings = AppSettingsService.getInstance();
        const settings = appSettings.getSettings();
        enableAIFormatting = settings.aiPostProcessing;
        // Enable fast mode for shorter text to prioritize speed
        fastMode = text.trim().split(/\s+/).length <= 10;
        Logger.info(`🤖 [TextProcessor] AI formatting setting: ${enableAIFormatting ? 'ENABLED' : 'DISABLED'}, Fast mode: ${fastMode ? 'ENABLED' : 'DISABLED'}`);
      } catch (error) {
        Logger.warning('Failed to get AI formatting setting, defaulting to enabled:', error);
      }
      
      const postProcessingResult = await this.postProcessor.processText(text, appContext, {
        enableDictionaryCorrections: !fastMode, // Skip dictionary in fast mode
        enableContextFormatting: enableAIFormatting,
        enableSmartKeywords: false, // Keywords handled at transcription level
        fastMode: fastMode
      });
      
      const postProcessingTime = Date.now() - processingStartTime;
      const previousText = text;
      const finalText = postProcessingResult.processedText;
      
      // Log results
      Logger.info(`🔄 [TextProcessor] Completed in ${postProcessingTime}ms - Applied ${postProcessingResult.appliedCorrections} corrections, ` +
                 `formatted for ${postProcessingResult.detectedContext}, ` +
                 `internal processing took ${postProcessingResult.processingTime}ms`);
      
      if (previousText !== finalText) {
        Logger.debug(`🔄 [TextProcessor] Text transformation: "${previousText}" → "${finalText}"`);
      }
      
      if (postProcessingResult.formattingApplied.length > 0) {
        Logger.info(`🎨 [TextProcessor] Applied formatting: ${postProcessingResult.formattingApplied.join(', ')}`);
      }
      
      // Track processing
      this.analyticsManager.trackEvent('text_post_processed', {
        wordCount: finalText.split(/\s+/).length,
        characterCount: finalText.length,
        model: modelUsed,
        contextType: appContext.type,
        appliedCorrections: postProcessingResult.appliedCorrections,
        formattingApplied: postProcessingResult.formattingApplied,
        processingTime: postProcessingResult.processingTime,
        totalPostProcessingTime: postProcessingTime,
        textChanged: previousText !== finalText,
        timestamp: new Date().toISOString()
      });
      
      return finalText;
      
    } catch (error) {
      const postProcessingTime = Date.now() - processingStartTime;
      Logger.warning(`⚠️ [TextProcessor] Post-processing failed in ${postProcessingTime}ms, using original text:`, error);
      
      // Track failure
      this.analyticsManager.trackError('post_processing_failed', {
        error: error instanceof Error ? error.message : String(error),
        text: text,
        contextType: appContext.type,
        processingTime: postProcessingTime,
        timestamp: new Date().toISOString()
      });
      
      return text;
    }
  }

  /**
   * Get context-specific keywords for improved transcription accuracy
   */
  getContextKeywords(appContext: AppContext): string[] {
    try {
      // Simple context-based keywords without AI processing
      const keywords: string[] = [];
      
      switch (appContext.type) {
        case 'email':
          keywords.push('regards', 'sincerely', 'best', 'thank you', 'subject', 'dear', 'hi', 'hello');
          break;
        case 'document':
          keywords.push('document', 'paragraph', 'section', 'heading', 'bullet point');
          break;
        case 'code':
          keywords.push('function', 'variable', 'class', 'method', 'import', 'export');
          break;
        case 'messaging':
          keywords.push('message', 'chat', 'reply', 'respond');
          break;
        default:
          keywords.push('text', 'content', 'information');
      }
      
      return keywords;
    } catch (error) {
      Logger.warning('🔤 [TextProcessor] Failed to get context keywords:', error);
      return [];
    }
  }
}
