import { Logger } from '../core/logger';
import { SecureAPIService } from './secure-api-service';
import { AppSettingsService } from './app-settings-service';
import { isSafeLoopbackHttpUrl } from '../security/url-policy';

export interface ParsedIntent {
  action: 'search' | 'open' | 'navigate' | 'play';
  platform: string;
  query?: string;
  url?: string;
  confidence: number;
  reasoning: string;
}

/**
 * Command parser using Gemini 2.5 Flash or local Ollama for intelligent intent parsing.
 * Respects user's Ollama settings when local mode is enabled.
 */
export class CloudCommandParserService {
  private static cache: Map<string, ParsedIntent> = new Map();

  static async parseCommand(command: string): Promise<ParsedIntent | null> {
    Logger.debug('[CommandParser] Parsing command...');

    const cacheKey = command.toLowerCase().trim();
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const result = await this.parseWithAI(command);
      if (result) {
        this.cache.set(cacheKey, result);
        return result;
      }
    } catch (error) {
      Logger.error('[CommandParser] AI parsing failed:', error);
    }

    return null;
  }

  private static async parseWithAI(command: string): Promise<ParsedIntent | null> {
    const secureAPI = SecureAPIService.getInstance();
    const ollamaSettings = secureAPI.getOllamaSettings();

    // Check if Ollama is enabled - use local LLM
    if (ollamaSettings.useOllama) {
      Logger.info(`🦙 [Ollama] Attempting to parse with model: ${ollamaSettings.ollamaModel}`);
      try {
        const result = await this.parseWithOllama(command, ollamaSettings);
        if (result) {
          Logger.success(`🦙 [Ollama] Successfully parsed: "${command}"`);
          return result;
        }
        Logger.warning('🦙 [Ollama] Parsing failed or returned null, falling back to Gemini');
      } catch (error) {
        Logger.error('[CommandParser] Ollama parsing failed, trying Gemini fallback:', error);
      }
    }

    // Fallback to Gemini if available
    Logger.info(`♊ [Gemini] Parsing command: "${command}"`);
    return this.parseWithGemini(command);
  }

  private static async parseWithOllama(
    command: string,
    settings: { ollamaUrl: string; ollamaModel: string }
  ): Promise<ParsedIntent | null> {
    if (!isSafeLoopbackHttpUrl(settings.ollamaUrl)) {
      throw new Error('Only a local Ollama server is allowed');
    }
    const prompt = this.buildPrompt(command);

    const response = await fetch(`${settings.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.ollamaModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 200
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.message?.content?.trim();

    if (text) {
      Logger.debug('[CommandParser] Ollama response:', text);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]) as ParsedIntent;
        } catch (e) {
          Logger.error('[CommandParser] Failed to parse Ollama JSON response:', e);
        }
      }
    }

    return null;
  }

  private static async parseWithGemini(command: string): Promise<ParsedIntent | null> {
    try {
      const secureAPI = SecureAPIService.getInstance();
      const geminiKey = await secureAPI.getGeminiKey();

      if (!geminiKey) {
        Logger.debug('[CommandParser] No Gemini API key available');
        return null;
      }

      const prompt = this.buildPrompt(command);

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + geminiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (text) {
        Logger.debug('[CommandParser] Gemini response:', text);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as ParsedIntent;
        }
      }
    } catch (error) {
      Logger.error('[CommandParser] Gemini parsing error:', error);
    }

    return null;
  }

  private static buildPrompt(command: string): string {
    return `You are a command parser. Parse this voice command and extract the intent.

Command: "${command}"

Rules:
1. For YouTube searches: action="search", platform="youtube", query=<search terms only>
2. For Spotify: action="play" or "open", platform="spotify"
3. For opening apps/websites: action="open", platform=<app/site name>
4. For navigation: action="navigate", url=<URL>
5. Extract ONLY the actual search query - remove "hey jarvis", "search", "on youtube", etc.

Return ONLY valid JSON:
{"action":"search|open|play|navigate","platform":"string","query":"string or null","url":"string or null","confidence":0.0-1.0,"reasoning":"brief explanation"}

Examples:
"hey jarvis search youtube for steve jobs" → {"action":"search","platform":"youtube","query":"steve jobs","confidence":0.95,"reasoning":"YouTube search for steve jobs"}
"open spotify" → {"action":"open","platform":"spotify","query":null,"url":null,"confidence":0.95,"reasoning":"Open Spotify app"}
"go to gmail" → {"action":"open","platform":"gmail","query":null,"url":"https://gmail.com","confidence":0.95,"reasoning":"Open Gmail website"}`;
  }

  static async isAvailable(): Promise<boolean> {
    const secureAPI = SecureAPIService.getInstance();
    const settings = AppSettingsService.getInstance().getSettings(); // Used AppSettingsService

    // Check if Ollama is enabled
    if (settings.useOllama) {
      // Try to ping Ollama
      try {
        if (!settings.ollamaUrl || !isSafeLoopbackHttpUrl(settings.ollamaUrl)) {
          throw new Error('Only a local Ollama server is allowed');
        }
        const response = await fetch(`${settings.ollamaUrl}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000) // Use a short timeout to check availability
        });
        if (response.ok) {
          Logger.info(`🦙 [Ollama] Service is available at ${settings.ollamaUrl}`);
          return true;
        }
      } catch (error) {
        Logger.warning(`🦙 [Ollama] Service check failed at ${settings.ollamaUrl}, falling back to Gemini`);
      }
    }

    // Fallback to checking Gemini key
    try {
      const geminiKey = await secureAPI.getGeminiKey();
      const isGeminiAvailable = !!geminiKey;
      if (isGeminiAvailable) {
        Logger.info('♊ [Gemini] API key is available.');
      } else {
        Logger.warning('♊ [Gemini] API key is not available.');
      }
      return isGeminiAvailable;
    } catch (error) {
      Logger.error('♊ [Gemini] Error checking API key availability:', error);
      return false;
    }
  }

  static setBaseURL(_url: string): void {
    // No-op in local build
  }
}
