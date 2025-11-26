import { AssistantProcessor } from '../assistant-processor';
import { ContextAwarePostProcessor } from '../context-aware-post-processor';
import { ContextDetector } from '../../context/context-detector';
import { Logger } from '../../core/logger';
import { AppContext } from '../../interfaces/transcription';

export interface AssistantResult {
  text: string;
  isAssistant: boolean;
  processedText?: string;
  context?: AppContext;
  suggestions?: string[];
}

/**
 * Coordinates assistant processing and context detection
 */
export class AssistantCoordinator {
  private assistantProcessor: AssistantProcessor;
  private postProcessor: ContextAwarePostProcessor;
  private contextDetector: ContextDetector;

  constructor() {
    this.assistantProcessor = new AssistantProcessor();
    this.postProcessor = new ContextAwarePostProcessor();
    this.contextDetector = new ContextDetector();
  }

  /**
   * Process transcription through assistant and context detection
   */
  async processTranscription(transcriptionText: string, sessionId: string): Promise<AssistantResult> {
    try {
      Logger.info(`🤖 [Assistant] Processing transcription: "${transcriptionText}"`);

      // Detect current application context
      const context = await this.contextDetector.detectContext();
      Logger.debug(`📱 [Context] Detected context: ${context.activeApp || 'unknown'}`);

      // Process through assistant
      const assistantResult = await this.assistantProcessor.processWithAssistantDetection(
        transcriptionText,
        context
      );

      // Apply context-aware post-processing if needed
      let processedText = assistantResult.text;
      if (!assistantResult.isAssistant) {
        // Apply post-processing for dictation text
        const postProcessingResult = await this.postProcessor.processText(
          assistantResult.text,
          context
        );
        processedText = postProcessingResult.processedText;
      }

      const result: AssistantResult = {
        text: assistantResult.text,
        isAssistant: assistantResult.isAssistant,
        processedText,
        context,
        suggestions: [] // Can be extended for future features
      };

      Logger.success(`✅ [Assistant] Processing complete - Assistant: ${result.isAssistant}, Original: "${result.text}", Processed: "${result.processedText}"`);

      return result;
    } catch (error) {
      Logger.error('❌ [Assistant] Processing failed:', error);
      
      // Return fallback result
      return {
        text: transcriptionText,
        isAssistant: false,
        processedText: transcriptionText,
        context: { activeApp: 'unknown', windowTitle: '', type: 'default' },
        suggestions: []
      };
    }
  }

  /**
   * Get current application context
   */
  async getCurrentContext(): Promise<AppContext> {
    return await this.contextDetector.detectContext();
  }

  /**
   * Process text for specific context
   */
  async processForContext(text: string, context: AppContext): Promise<string> {
    const result = await this.postProcessor.processText(text, context);
    return result.processedText;
  }

  /**
   * Get context keywords for streaming optimization
   */
  getContextKeywords(): string[] {
    // Return default keywords for now - can be extended
    return ['jarvis', 'hey', 'help', 'write', 'edit', 'correct'];
  }

  /**
   * Clear assistant memory/context
   */
  async clearMemory(): Promise<void> {
    try {
      // For now, just log - can be extended to clear agent memory
      Logger.info('🧹 [Assistant] Memory clear requested');
    } catch (error) {
      Logger.error('❌ [Assistant] Failed to clear memory:', error);
    }
  }
}
