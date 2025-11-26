import { Logger } from '../core/logger';
import { SecureAPIService } from './secure-api-service';

export interface ParsedIntent {
  action: 'search' | 'open' | 'navigate' | 'play';
  platform: string;
  query?: string;
  url?: string;
  confidence: number;
  reasoning: string;
}

/**
 * Command parser using Gemini 2.5 Flash for intelligent intent parsing.
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
    try {
      const secureAPI = SecureAPIService.getInstance();
      const geminiKey = await secureAPI.getGeminiKey();
      
      if (!geminiKey) {
        Logger.debug('[CommandParser] No Gemini API key available');
        return null;
      }
      
      const prompt = `You are a command parser. Parse this voice command and extract the intent.

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
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as ParsedIntent;
        }
      }
    } catch (error) {
      Logger.error('[CommandParser] AI parsing error:', error);
    }
    
    return null;
  }

  static async isAvailable(): Promise<boolean> {
    const secureAPI = SecureAPIService.getInstance();
    const geminiKey = await secureAPI.getGeminiKey();
    return !!geminiKey;
  }

  static setBaseURL(_url: string): void {
    // No-op in local build
  }
}
