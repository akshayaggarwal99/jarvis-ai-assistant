import { Logger } from '../core/logger';
import { CloudCommandParserService } from './cloud-command-parser';

export interface ParsedIntent {
  action: 'search' | 'open' | 'navigate' | 'play';
  platform: string;
  query?: string;
  url?: string;
  confidence: number;
  reasoning: string;
}

/**
 * Pure AI Agent Command Parser
 * Uses LLM intelligence instead of pattern matching for truly scalable parsing
 */
export class AICommandParser {
  private openaiKey: string;
  private geminiKey?: string;
  private cache: Map<string, ParsedIntent> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(openaiKey: string, geminiKey?: string) {
    this.openaiKey = openaiKey;
    this.geminiKey = geminiKey;
  }

  /**
   * Parse command using cloud-first approach with local fallback
   */
  async parseCommand(command: string): Promise<ParsedIntent | null> {
    // Check cache first for speed
    const cacheKey = command.toLowerCase().trim();
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      Logger.info('⚡ [AIParser] Using cached result for speed');
      return cached;
    }

    // Try cloud parsing first for better performance and no API key exposure
    try {
      Logger.info('🌩️ [AIParser] Attempting cloud-based command parsing...');
      const cloudResult = await CloudCommandParserService.parseCommand(command);
      
      if (cloudResult) {
        Logger.success('🌩️ [AIParser] Cloud parsing successful');
        this.cacheResult(cacheKey, cloudResult);
        return cloudResult;
      }
      
      Logger.warning('🌩️ [AIParser] Cloud parsing returned null, falling back to local processing');
    } catch (cloudError) {
      Logger.warning('🌩️ [AIParser] Cloud parsing failed, falling back to local processing:', cloudError);
    }

    // Try fast pattern matching for obvious cases first
    const fastResult = this.tryFastParse(cacheKey);
    if (fastResult) {
      Logger.info('🚀 [AIParser] Using fast pattern matching for obvious case');
      this.cacheResult(cacheKey, fastResult);
      return fastResult;
    }

    try {
      // Try Gemini 2.5 Flash Lite first (faster & stable)
      if (this.geminiKey) {
        Logger.info('🚀 [AIParser] Using Gemini 2.5 Flash Lite for local parsing');
        const geminiResult = await this.parseWithGemini(command);
        if (geminiResult) {
          this.cacheResult(cacheKey, geminiResult);
          Logger.success('✅ [AIParser] Gemini parsed intent:', geminiResult);
          return geminiResult;
        }
        Logger.warning('⚠️ [AIParser] Gemini failed, falling back to OpenAI');
      }

      // Fallback to OpenAI GPT-4o-mini
      Logger.info('🧠 [AIParser] Using GPT-4o-mini local fallback');
      const openaiResult = await this.parseWithOpenAI(command);
      if (openaiResult) {
        this.cacheResult(cacheKey, openaiResult);
        Logger.success('✅ [AIParser] OpenAI parsed intent:', openaiResult);
        return openaiResult;
      }
      
    } catch (error) {
      Logger.error('❌ [AIParser] Local AI parsing failed:', error);
    }

    // Final fallback
    const fallbackResult = this.fallbackParse(command);
    if (fallbackResult) {
      Logger.warning('⚠️ [AIParser] Using simple fallback parsing');
      return fallbackResult;
    }

    Logger.error('❌ [AIParser] All parsing methods failed');
    return null;
  }

  /**
   * Get cached parsing result if available and not expired
   */
  private getCachedResult(cacheKey: string): ParsedIntent | null {
    const expiry = this.cacheExpiry.get(cacheKey);
    if (!expiry || Date.now() > expiry) {
      this.cache.delete(cacheKey);
      this.cacheExpiry.delete(cacheKey);
      return null;
    }
    return this.cache.get(cacheKey) || null;
  }

  /**
   * Cache parsing result with expiry
   */
  private cacheResult(cacheKey: string, result: ParsedIntent): void {
    this.cache.set(cacheKey, result);
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_DURATION);
  }

  /**
   * Try fast pattern matching for obvious cases to avoid API calls
   */
  private tryFastParse(command: string): ParsedIntent | null {
    // Native app patterns
    if (command.includes('open') || command.includes('launch')) {
      // Mail app detection
      if (command.includes('apple mail') || (command.includes('mail') && !command.includes('gmail'))) {
        return {
          action: 'open',
          platform: 'apple mail',
          confidence: 0.95,
          reasoning: 'Fast Apple Mail app pattern'
        };
      }

      // Other native apps
      if (command.includes('safari')) {
        return {
          action: 'open',
          platform: 'safari',
          confidence: 0.95,
          reasoning: 'Fast Safari app pattern'
        };
      }

      if (command.includes('chrome')) {
        return {
          action: 'open',
          platform: 'chrome',
          confidence: 0.95,
          reasoning: 'Fast Chrome app pattern'
        };
      }

      if (command.includes('whatsapp') && !command.includes('web')) {
        return {
          action: 'open',
          platform: 'whatsapp',
          confidence: 0.95,
          reasoning: 'Fast WhatsApp app pattern'
        };
      }
    }

    // Very obvious YouTube patterns
    if (command.includes('youtube') && command.includes('search')) {
      const query = command
        .replace(/open|youtube|and|search|for|hey|jarvis/g, '')
        .trim();
      if (query) {
        return {
          action: 'search',
          platform: 'youtube',
          query,
          confidence: 0.9,
          reasoning: 'Fast YouTube search pattern'
        };
      }
    }

    // Very obvious Spotify patterns
    if (command.includes('spotify') && (command.includes('play') || command.includes('music'))) {
      const query = command
        .replace(/open|spotify|and|search|for|play|listen|hey|jarvis/g, '')
        .trim();
      if (query) {
        return {
          action: 'play',
          platform: 'spotify',
          query,
          confidence: 0.9,
          reasoning: 'Fast Spotify music pattern'
        };
      }
    }

    return null;
  }

  /**
   * Fallback parser using simple heuristics
   */
  private fallbackParse(command: string): ParsedIntent | null {
    const lowerCommand = command.toLowerCase();
    
    // Simple YouTube detection
    if (lowerCommand.includes('youtube')) {
      const searchTerms = lowerCommand
        .replace(/open|youtube|and|search|for|play|watch/g, '')
        .trim();
      
      if (searchTerms) {
        return {
          action: 'search',
          platform: 'youtube',
          query: searchTerms,
          confidence: 0.7,
          reasoning: 'Fallback YouTube detection'
        };
      }
    }

    // Simple Spotify detection
    if (lowerCommand.includes('spotify')) {
      const searchTerms = lowerCommand
        .replace(/open|spotify|and|search|for|play|listen/g, '')
        .trim();
      
      if (searchTerms) {
        return {
          action: 'play',
          platform: 'spotify',
          query: searchTerms,
          confidence: 0.7,
          reasoning: 'Fallback Spotify detection'
        };
      }
    }

    return null;
  }

  /**
   * Parse command using Gemini 2.5 Flash Lite (faster & stable)
   */
  private async parseWithGemini(command: string): Promise<ParsedIntent | null> {
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.geminiKey!
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Parse voice commands into structured intents. Be FAST and CONCISE.

PLATFORMS: 
- Native Apps: apple mail, mail, safari, chrome, spotify app, discord app, slack app, zoom app, notes app, whatsapp
- Web Services: youtube, spotify web, amazon, facebook, instagram, twitter, linkedin, gmail web, whatsapp web

ACTIONS: search, open, navigate, play

IMPORTANT RULES:
1. "Apple Mail" or "Mail" = native app, NOT gmail
2. "Open [AppName]" = prefer native app over web version  
3. "Chrome" = Chrome browser app, "Safari" = Safari app
4. "WhatsApp" = native whatsapp app (if no web context specified)
5. "WhatsApp Web" or "WhatsApp on web/Chrome" = web service (whatsapp web)
6. Only use web platforms for searches or when explicitly mentioned
7. For URLs with .com/.org/.net preserve the full domain as platform (e.g., "twitter.com" not "twitter")
8. For navigate actions, include the URL field when possible

EXAMPLES:
"Open Apple Mail" → {"action":"open","platform":"apple mail","confidence":0.95,"reasoning":"Native Apple Mail app"}

"Open Mail" → {"action":"open","platform":"apple mail","confidence":0.9,"reasoning":"Native mail app"}

"Open WhatsApp" → {"action":"open","platform":"whatsapp","confidence":0.95,"reasoning":"Native WhatsApp app"}

"Open YouTube and search for cats" → {"action":"search","platform":"youtube","query":"cats","confidence":0.95,"reasoning":"YouTube search"}

"Open Chrome" → {"action":"open","platform":"chrome","confidence":0.95,"reasoning":"Chrome browser app"}

"Open twitter.com" → {"action":"navigate","platform":"twitter.com","url":"https://twitter.com","confidence":0.95,"reasoning":"Navigate to twitter.com"}

"Open facebook.com" → {"action":"navigate","platform":"facebook.com","url":"https://facebook.com","confidence":0.95,"reasoning":"Navigate to facebook.com"}

"Open WhatsApp on web" → {"action":"navigate","platform":"whatsapp web","confidence":0.95,"reasoning":"WhatsApp web service"}

"Open WhatsApp on Chrome" → {"action":"navigate","platform":"whatsapp web","confidence":0.95,"reasoning":"WhatsApp web service"}

Return ONLY valid JSON. No markdown.

Parse: "${command}"`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 150,
            candidateCount: 1
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const geminiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      
      if (!geminiResponse) {
        return null;
      }

      // Parse the JSON response
      const parsed = JSON.parse(geminiResponse) as ParsedIntent;
      
      // Validate the response
      if (!parsed.action || !parsed.platform || parsed.confidence < 0.3) {
        return null;
      }

      return parsed;
      
    } catch (error) {
      Logger.debug('⚠️ [AIParser] Gemini parsing failed:', error);
      return null;
    }
  }

  /**
   * Parse command using OpenAI GPT-4o-mini (fallback)
   */
  private async parseWithOpenAI(command: string): Promise<ParsedIntent | null> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{
            role: 'system',
            content: `Parse voice commands into structured intents. Be FAST and CONCISE.

PLATFORMS: 
- Native Apps: apple mail, mail, safari, chrome, spotify app, discord app, slack app, zoom app, notes app, whatsapp
- Web Services: youtube, spotify web, amazon, facebook, instagram, twitter, linkedin, gmail web, whatsapp web

ACTIONS: search, open, navigate, play

IMPORTANT RULES:
1. "Apple Mail" or "Mail" = native app, NOT gmail
2. "Open [AppName]" = prefer native app over web version  
3. "Chrome" = Chrome browser app, "Safari" = Safari app
4. "WhatsApp" = native whatsapp app (if no web context specified)
5. "WhatsApp Web" or "WhatsApp on web/Chrome" = web service (whatsapp web)
6. Only use web platforms for searches or when explicitly mentioned
7. For URLs with .com/.org/.net preserve the full domain as platform (e.g., "twitter.com" not "twitter")
8. For navigate actions, include the URL field when possible

EXAMPLES:
"Open Apple Mail" → {"action":"open","platform":"apple mail","confidence":0.95,"reasoning":"Native Apple Mail app"}

"Open Mail" → {"action":"open","platform":"apple mail","confidence":0.9,"reasoning":"Native mail app"}

"Open WhatsApp" → {"action":"open","platform":"whatsapp","confidence":0.95,"reasoning":"Native WhatsApp app"}

"Open YouTube and search for cats" → {"action":"search","platform":"youtube","query":"cats","confidence":0.95,"reasoning":"YouTube search"}

"Open Chrome" → {"action":"open","platform":"chrome","confidence":0.95,"reasoning":"Chrome browser app"}

"Open twitter.com" → {"action":"navigate","platform":"twitter.com","url":"https://twitter.com","confidence":0.95,"reasoning":"Navigate to twitter.com"}

"Open facebook.com" → {"action":"navigate","platform":"facebook.com","url":"https://facebook.com","confidence":0.95,"reasoning":"Navigate to facebook.com"}

"Open WhatsApp on web" → {"action":"navigate","platform":"whatsapp web","confidence":0.95,"reasoning":"WhatsApp web service"}

"Open WhatsApp on Chrome" → {"action":"navigate","platform":"whatsapp web","confidence":0.95,"reasoning":"WhatsApp web service"}

Return ONLY valid JSON. No markdown.`
          }, {
            role: 'user',
            content: `Parse: "${command}"`
          }],
          temperature: 0.1,
          max_tokens: 150
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content?.trim();
      
      if (!aiResponse) {
        return null;
      }

      // Parse the JSON response
      const parsed = JSON.parse(aiResponse) as ParsedIntent;
      
      // Validate the response
      if (!parsed.action || !parsed.platform || parsed.confidence < 0.3) {
        return null;
      }

      return parsed;
      
    } catch (error) {
      Logger.debug('⚠️ [AIParser] OpenAI parsing failed:', error);
      return null;
    }
  }
}

export let aiCommandParser: AICommandParser | null = null;

export function initializeAIParser(openaiKey: string, geminiKey?: string) {
  aiCommandParser = new AICommandParser(openaiKey, geminiKey);
  Logger.info('🧠 [AIParser] Pure AI agent parser initialized with Gemini 2.5 Flash Lite Preview + OpenAI fallback');
}
