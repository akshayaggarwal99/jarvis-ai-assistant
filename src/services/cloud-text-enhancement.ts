import { Logger } from '../core/logger';
import { AppSettingsService } from './app-settings-service';

interface TextEnhancementRequest {
  text: string;
  context: {
    type: string;
    activeApp: string;
  };
  options?: {
    enableDictionaryCorrections?: boolean;
    enableContextFormatting?: boolean;
    fastMode?: boolean;
  };
}

interface TextEnhancementResponse {
  processedText: string;
  appliedCorrections: number;
  detectedContext: string;
  formattingApplied: string[];
  processingTime: number;
  cached: boolean;
}

export class CloudTextEnhancementService {
  private static readonly REQUEST_TIMEOUT = 3000; // 3 second timeout
  private static readonly FAST_REQUEST_TIMEOUT = 1500; // 1.5 second timeout for fast mode
  
  /**
   * Enhance text using local AI (Gemini or OpenAI) or basic formatting
   */
  static async enhanceText(
    text: string,
    context: { type: string; activeApp: string },
    options: {
      enableDictionaryCorrections?: boolean;
      enableContextFormatting?: boolean;
      fastMode?: boolean;
    } = {}
  ): Promise<TextEnhancementResponse> {
    const startTime = Date.now();
    
    // Try to use Gemini API for formatting
    const settings = AppSettingsService.getInstance().getSettings();
    const geminiKey = settings.geminiApiKey;
    const openaiKey = settings.openaiApiKey;
    
    if (geminiKey && options.enableContextFormatting) {
      try {
        const formatted = await this.formatWithGemini(text, context, geminiKey, options.fastMode);
        const totalTime = Date.now() - startTime;
        Logger.info(`[CloudEnhance] Gemini formatting completed in ${totalTime}ms`);
        return {
          processedText: formatted,
          appliedCorrections: 0,
          detectedContext: `${context.type}:${context.activeApp}`,
          formattingApplied: ['gemini-ai'],
          processingTime: totalTime,
          cached: false
        };
      } catch (error) {
        Logger.warning('[CloudEnhance] Gemini formatting failed, falling back to basic:', error);
      }
    } else if (openaiKey && options.enableContextFormatting) {
      try {
        const formatted = await this.formatWithOpenAI(text, context, openaiKey, options.fastMode);
        const totalTime = Date.now() - startTime;
        Logger.info(`[CloudEnhance] OpenAI formatting completed in ${totalTime}ms`);
        return {
          processedText: formatted,
          appliedCorrections: 0,
          detectedContext: `${context.type}:${context.activeApp}`,
          formattingApplied: ['openai-ai'],
          processingTime: totalTime,
          cached: false
        };
      } catch (error) {
        Logger.warning('[CloudEnhance] OpenAI formatting failed, falling back to basic:', error);
      }
    }
    
    // Fallback to basic formatting
    Logger.debug('[CloudEnhance] Using basic local formatting');
    const formatted = this.applyBasicFormatting(text);
    const totalTime = Date.now() - startTime;
    
    return {
      processedText: formatted,
      appliedCorrections: 0,
      detectedContext: `${context.type}:${context.activeApp}`,
      formattingApplied: ['basic-local'],
      processingTime: totalTime,
      cached: false
    };
  }

  /**
   * Format text using Gemini API
   */
  private static async formatWithGemini(
    text: string, 
    context: { type: string; activeApp: string },
    apiKey: string,
    fastMode?: boolean
  ): Promise<string> {
    const timeout = fastMode ? this.FAST_REQUEST_TIMEOUT : this.REQUEST_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const prompt = this.buildFormattingPrompt(text, context);
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 500
            }
          }),
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }
      
      const data = await response.json();
      const formatted = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      
      if (formatted && formatted.length > 0) {
        return formatted;
      }
      
      throw new Error('Empty response from Gemini');
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Format text using OpenAI API
   */
  private static async formatWithOpenAI(
    text: string, 
    context: { type: string; activeApp: string },
    apiKey: string,
    fastMode?: boolean
  ): Promise<string> {
    const timeout = fastMode ? this.FAST_REQUEST_TIMEOUT : this.REQUEST_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const prompt = this.buildFormattingPrompt(text, context);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 500
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      const data = await response.json();
      const formatted = data.choices?.[0]?.message?.content?.trim();
      
      if (formatted && formatted.length > 0) {
        return formatted;
      }
      
      throw new Error('Empty response from OpenAI');
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Build the formatting prompt based on context
   */
  private static buildFormattingPrompt(text: string, context: { type: string; activeApp: string }): string {
    const basePrompt = `Fix any grammar, punctuation, and capitalization in this transcribed speech. Keep the meaning exactly the same. Only output the corrected text, nothing else.`;
    
    if (context.type === 'email') {
      return `${basePrompt} This is for an email.\n\nText: ${text}`;
    } else if (context.type === 'code') {
      return `${basePrompt} This is for a code comment or documentation.\n\nText: ${text}`;
    } else if (context.type === 'chat') {
      return `${basePrompt} This is for a chat message, keep it casual.\n\nText: ${text}`;
    }
    
    return `${basePrompt}\n\nText: ${text}`;
  }

  /**
   * Basic text formatting fallback
   */
  private static applyBasicFormatting(text: string): string {
    let formatted = text.trim();
    
    // Basic capitalization
    if (formatted.length > 0 && formatted.charAt(0) === formatted.charAt(0).toLowerCase()) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    
    // Add period if needed for longer sentences
    if (!formatted.match(/[.!?]$/) && formatted.split(/\s+/).length > 3) {
      formatted += '.';
    }
    
    return formatted;
  }

  /**
   * Check if AI enhancement is available
   */
  static async isAvailable(): Promise<boolean> {
    const settings = AppSettingsService.getInstance().getSettings();
    return !!(settings.geminiApiKey || settings.openaiApiKey);
  }
}
