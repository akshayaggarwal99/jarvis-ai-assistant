import { nodeDictionaryService } from '../services/node-dictionary';
import { Logger } from '../core/logger';
import { AppContext } from '../interfaces/transcription';
import { CloudTextEnhancementService } from '../services/cloud-text-enhancement';

export interface PostProcessingOptions {
  enableDictionaryCorrections?: boolean;
  enableContextFormatting?: boolean;
  enableSmartKeywords?: boolean;
  fastMode?: boolean; // New option for prioritizing speed over quality
  userPreferences?: {
    formalTone?: boolean;
    techVocabulary?: boolean;
    personalizations?: any;
  };
}

export interface PostProcessingResult {
  processedText: string;
  appliedCorrections: number;
  detectedContext: string;
  formattingApplied: string[];
  processingTime: number;
}

export class ContextAwarePostProcessor {
  private cache = new Map<string, { result: string; timestamp: number }>();
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor() {
    // Clean cache periodically
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.CACHE_TTL) {
          this.cache.delete(key);
        }
      }
    }, this.CACHE_TTL);
  }

  /**
   * Count differences between original and corrected text
   */
  private countDifferences(original: string, corrected: string): number {
    const originalWords = original.toLowerCase().split(/\s+/);
    const correctedWords = corrected.toLowerCase().split(/\s+/);
    
    let differences = 0;
    const maxLength = Math.max(originalWords.length, correctedWords.length);
    
    for (let i = 0; i < maxLength; i++) {
      if (originalWords[i] !== correctedWords[i]) {
        differences++;
      }
    }
    
    return differences;
  }

  /**
   * Process transcribed text with full context awareness
   */
  async processText(
    text: string, 
    appContext: AppContext, 
    options: PostProcessingOptions = {}
  ): Promise<PostProcessingResult> {
    const startTime = Date.now();
    let processedText = text.trim();
    let appliedCorrections = 0;
    const formattingApplied: string[] = [];

    Logger.info(`🔄 [PostProcess] Starting context-aware processing for: ${appContext.type} (${appContext.activeApp})`);

        // Fast mode optimization: use cloud processing with shorter timeout instead of skipping
    if (options.fastMode) {
      Logger.info(`⚡ [PostProcess] Fast mode enabled - using cloud processing with optimized timeout`);
    } else {
      Logger.info(`� [PostProcess] Full mode enabled - using cloud processing with standard timeout`);
    }

    // Normal mode: full processing
    // Step 1: Apply dictionary corrections first (if enabled)
    if (options.enableDictionaryCorrections !== false) {
      try {
        const correctedText = nodeDictionaryService.applyDictionary(processedText);
        if (correctedText !== processedText) {
          appliedCorrections = this.countDifferences(processedText, correctedText);
          processedText = correctedText;
          formattingApplied.push('dictionary-corrections');
          Logger.info(`📖 [PostProcess] Applied ${appliedCorrections} dictionary corrections`);
        }
      } catch (error) {
        Logger.warning('📖 [PostProcess] Dictionary correction failed:', error);
      }
    }

    // Step 2: Apply context-aware formatting (if enabled)
    if (options.enableContextFormatting === true) {
      try {
        // Try cloud enhancement first for better speed and reliability
        Logger.info(`🌩️ [PostProcess] Attempting cloud-based text enhancement...`);
        
        const cloudResult = await CloudTextEnhancementService.enhanceText(
          processedText,
          appContext,
          {
            enableDictionaryCorrections: false, // Already done above
            enableContextFormatting: true,
            fastMode: options.fastMode
          }
        );
        
        if (cloudResult.processedText !== processedText) {
          processedText = cloudResult.processedText;
          formattingApplied.push(...cloudResult.formattingApplied);
          Logger.success(`🌩️ [PostProcess] Cloud enhancement successful in ${cloudResult.processingTime}ms (${cloudResult.cached ? 'cached' : 'processed'})`);
        } else {
          Logger.info(`🌩️ [PostProcess] Cloud enhancement: no changes needed`);
        }
      } catch (cloudError) {
        Logger.warning('🌩️ [PostProcess] Cloud enhancement failed, using basic formatting:', cloudError);
        
        // Apply basic formatting as fallback when cloud service is unavailable
        const basicFormatted = this.applyBasicContextFormatting(processedText, appContext);
        if (basicFormatted !== processedText) {
          processedText = basicFormatted;
          formattingApplied.push('basic-formatting-fallback');
          Logger.info(`📝 [PostProcess] Applied basic context formatting (cloud unavailable)`);
        }
      }
    } else {
      Logger.info(`🚫 [PostProcess] AI formatting disabled, applying basic context formatting`);
      
      // Apply basic formatting for all contexts
      if (appContext.type === 'email') {
        const basicEmailFormatted = this.applyBasicEmailStructure(processedText);
        if (basicEmailFormatted !== processedText) {
          processedText = basicEmailFormatted;
          formattingApplied.push('basic-email-structure');
          Logger.info(`📧 [PostProcess] Applied basic email structure formatting (AI disabled)`);
        }
      } else {
        // Apply other basic formatting for other contexts
        const basicFormatted = this.applyBasicContextFormatting(processedText, appContext);
        if (basicFormatted !== processedText) {
          processedText = basicFormatted;
          formattingApplied.push('basic-formatting');
          Logger.info(`📝 [PostProcess] Applied basic context formatting (AI disabled)`);
        }
      }
    }

    const processingTime = Date.now() - startTime;
    
    return {
      processedText,
      appliedCorrections,
      detectedContext: `${appContext.type}:${appContext.activeApp}`,
      formattingApplied,
      processingTime
    };
  }

  /**
   * Basic context formatting when cloud services are unavailable (synchronous fallback)
   */
  private applyBasicContextFormatting(text: string, appContext: AppContext): string {
    let formatted = text.trim();

    // Only apply basic capitalization if first letter is lowercase
    if (formatted.length > 0 && formatted.charAt(0) === formatted.charAt(0).toLowerCase()) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    // Context-specific basic formatting
    if (appContext.type === 'email') {
      formatted = this.applyBasicEmailStructure(formatted);
    }

    // Add basic punctuation if missing
    if (formatted.length > 0 && !formatted.match(/[.!?]$/)) {
      // Only add period if it looks like a complete sentence
      if (formatted.length > 10 && !formatted.endsWith(',')) {
        formatted += '.';
      }
    }

    return formatted;
  }

  /**
   * Apply basic email structure formatting
   */
  private applyBasicEmailStructure(text: string): string {
    let formatted = text.trim();
    
    // Basic email greeting formatting
    formatted = formatted.replace(/^(hi|hello|dear)\s+([a-z])/i, (match, greeting, firstLetter) => {
      return `${greeting.charAt(0).toUpperCase() + greeting.slice(1)} ${firstLetter.toUpperCase()}`;
    });
    
    // Add comma after greeting if missing
    formatted = formatted.replace(/^(Hi|Hello|Dear)\s+[A-Z][a-z]+(?![,])/, '$&,');
    
    // Basic email closing formatting
    formatted = formatted.replace(/\b(best|regards|thanks|sincerely)\s*([a-z])/gi, (match, closing, nextChar) => {
      return `${closing.charAt(0).toUpperCase() + closing.slice(1)},\n${nextChar.toUpperCase()}`;
    });
    
    // Handle "Best, [name]" pattern
    formatted = formatted.replace(/\bbest\s+([a-z])/gi, 'Best,\n$1');
    formatted = formatted.replace(/\bregards\s+([a-z])/gi, 'Regards,\n$1');
    
    return formatted;
  }

  /**
   * Check if text is already well formatted (to skip unnecessary AI processing)
   */
  private isTextAlreadyWellFormatted(text: string): boolean {
    const trimmed = text.trim();
    
    // Check basic formatting markers
    const hasProperCapitalization = trimmed.length > 0 && trimmed.charAt(0) === trimmed.charAt(0).toUpperCase();
    const hasProperPunctuation = /[.!?]$/.test(trimmed) || trimmed.length < 5;
    const hasReasonableLength = trimmed.length > 3;
    const noObviousErrors = !/\b(uhh|umm|uh|ah)\b/gi.test(trimmed);
    
    return hasProperCapitalization && hasProperPunctuation && hasReasonableLength && noObviousErrors;
  }
}
