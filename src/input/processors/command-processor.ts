import { Logger } from '../../core/logger';
import { JarvisCommandProcessor } from '../../services/jarvis-command-processor';
import { AssistantProcessor } from '../assistant-processor';
import { OptimizedAnalyticsManager } from '../../analytics/optimized-analytics-manager';
import { ProcessingResult } from '../types/push-to-talk-types';
import { AppContext } from '../../interfaces/transcription';

export class CommandProcessor {
  private assistantProcessor: AssistantProcessor;
  private analyticsManager: OptimizedAnalyticsManager;

  constructor(analyticsManager: OptimizedAnalyticsManager) {
    this.analyticsManager = analyticsManager;
    this.assistantProcessor = new AssistantProcessor();
  }

  /**
   * Process transcribed text to determine command type and handle accordingly
   */
  async processCommand(text: string, appContext: AppContext, modelUsed: string): Promise<ProcessingResult> {
    Logger.info(`🔄 [Command] Processing text: "${text}"`);

    // 1. Check for Jarvis commands first
    try {
      const jarvisCommand = JarvisCommandProcessor.parseVoiceCommand(text);
      
      if (jarvisCommand.isJarvisCommand) {
        Logger.info(`🎯 [Command] Detected Jarvis command - Screenshot: ${jarvisCommand.needsScreenshot}`);
        
        const jarvisOutput = await JarvisCommandProcessor.processJarvisCommand(jarvisCommand);
        
        // Track Jarvis command usage
        this.analyticsManager.trackEvent('jarvis_command_processed', {
          commandType: jarvisOutput.type,
          isScreenshot: jarvisCommand.needsScreenshot,
          textLength: text.length,
          model: modelUsed,
          timestamp: new Date().toISOString()
        });
        
        return {
          text: text,
          isAssistantCommand: false,
          processingType: 'jarvis',
          skipRemainingProcessing: true
        };
      }
    } catch (error) {
      Logger.error('❌ [Command] Jarvis command processing failed, falling back to normal processing:', error);
    }

    // 2. Check for app launching commands
    try {
      const appCommandPatterns = /\b(open|launch|start|go to|navigate to|visit)\b/i;
      if (appCommandPatterns.test(text)) {
        Logger.info(`🚀 [Command] Detected app command: "${text}"`);
        
        const appLaunchResult = await this.processAppCommand(text, modelUsed);
        if (appLaunchResult.skipRemainingProcessing) {
          return appLaunchResult;
        }
      }
    } catch (error) {
      Logger.error('❌ [Command] App command processing failed, falling back to normal processing:', error);
    }

    // 3. Check for assistant commands
    try {
      Logger.debug(`🤖 [Command] Checking for assistant command: "${text}"`);
      const processedResult = await this.assistantProcessor.processWithAssistantDetection(text, appContext);
      
      if (processedResult.isAssistant) {
        Logger.info(`🤖 [Command] Assistant command processed successfully`);
        
        // Track assistant command
        this.analyticsManager.trackEvent('assistant_command_detected', {
          originalText: text,
          command: text.replace(/hey jarvis,?\s*/i, ''),
          model: modelUsed,
          timestamp: new Date().toISOString()
        });
        
        return {
          text: processedResult.text,
          isAssistantCommand: true,
          processingType: 'assistant',
          skipRemainingProcessing: true
        };
      }
    } catch (error) {
      Logger.warning('⚠️ [Command] Assistant processing failed, treating as dictation:', error);
    }

    // 4. Default to dictation
    Logger.info('💬 [Command] Processing as dictation');
    return {
      text: text,
      isAssistantCommand: false,
      processingType: 'dictation',
      skipRemainingProcessing: false
    };
  }

  /**
   * Process app launching commands
   */
  private async processAppCommand(text: string, modelUsed: string): Promise<ProcessingResult> {
    try {
      // Import command parser dynamically
      const { CloudCommandParserService } = await import('../../services/cloud-command-parser');
      const parsedIntent = await CloudCommandParserService.parseCommand(text);
      
      if (parsedIntent && parsedIntent.confidence > 0.7) {
        Logger.success('✅ [Command] Parsed app intent:', parsedIntent);
        
        // Import app launcher
        const { AppLauncherService } = await import('../../services/app-launcher-service');
        const appLauncher = new AppLauncherService();
        
        let success = false;
        
        // Convert CloudCommandParser result to AppLauncher format and execute
        if (parsedIntent.action === 'search' && parsedIntent.platform === 'youtube' && parsedIntent.query) {
          const intent = {
            action: 'search_web' as const,
            query: parsedIntent.query,
            searchEngine: 'youtube' as const,
            confidence: parsedIntent.confidence
          };
          success = await appLauncher.executeIntent(intent);
        } else if (parsedIntent.action === 'play' && parsedIntent.platform === 'spotify' && parsedIntent.query) {
          const intent = {
            action: 'search_web' as const,
            query: parsedIntent.query,
            searchEngine: 'spotify' as const,
            confidence: parsedIntent.confidence
          };
          success = await appLauncher.executeIntent(intent);
        } else if (parsedIntent.action === 'open' || parsedIntent.action === 'navigate') {
          if (parsedIntent.url) {
            const intent = {
              action: 'open_website' as const,
              website: parsedIntent.url,
              confidence: parsedIntent.confidence
            };
            success = await appLauncher.executeIntent(intent);
          } else {
            const intent = {
              action: 'open_app' as const,
              appName: parsedIntent.platform,
              confidence: parsedIntent.confidence
            };
            success = await appLauncher.executeIntent(intent);
          }
        }
        
        if (success) {
          Logger.success(`🚀 [Command] Successfully launched: ${parsedIntent.platform}`);
          
          // Track successful app launch
          this.analyticsManager.trackEvent('app_command_executed', {
            action: parsedIntent.action,
            platform: parsedIntent.platform,
            confidence: parsedIntent.confidence,
            textLength: text.length,
            model: modelUsed,
            timestamp: new Date().toISOString()
          });
          
          return {
            text: text,
            isAssistantCommand: false,
            processingType: 'app',
            skipRemainingProcessing: true
          };
        }
      }
    } catch (error) {
      Logger.error('❌ [Command] App command execution failed:', error);
    }

    // Return non-skipping result if app command failed
    return {
      text: text,
      isAssistantCommand: false,
      processingType: 'dictation',
      skipRemainingProcessing: false
    };
  }

  /**
   * Clear agent memory for fresh conversations
   */
  async clearAgentMemory(): Promise<void> {
    try {
      if (this.assistantProcessor) {
        await (this.assistantProcessor as any).agentHandler?.clearAgentMemory();
        Logger.debug('🧹 [Command] Agent memory cleared');
      }
    } catch (error) {
      Logger.error('❌ [Command] Failed to clear agent memory:', error);
    }
  }
}
