import { shell } from 'electron';
import { Logger } from '../core/logger';
import { AICommandParser, ParsedIntent } from './ai-command-parser';
import { intelligentCommandParser, ParsedCommand } from './intelligent-command-parser';

export interface BrowserAction {
  type: 'navigate' | 'search' | 'play_video' | 'play_music' | 'social_action';
  platform: string;
  query?: string;
  url?: string;
  specificAction?: string;
}

/**
 * Smart Browser Automation Service
 * Uses AI-powered intelligent command parsing instead of crude regex patterns
 */
export class SmartBrowserService {
  private aiParser?: AICommandParser;
  private platformHandlers = new Map([
    ['youtube', this.handleYouTube.bind(this)],
    ['spotify', this.handleSpotify.bind(this)],
    ['facebook', this.handleFacebook.bind(this)],
    ['instagram', this.handleInstagram.bind(this)],
    ['twitter', this.handleTwitter.bind(this)],
    ['x', this.handleTwitter.bind(this)],
    ['linkedin', this.handleLinkedIn.bind(this)],
    ['amazon', this.handleAmazon.bind(this)],
    ['netflix', this.handleNetflix.bind(this)],
    ['gmail', this.handleGmail.bind(this)]
  ]);

  /**
   * Parse complex commands and execute smart browser actions using pure AI agent
   */
  public async executeSmartAction(command: string): Promise<boolean> {
    // Use pure AI agent for intelligent parsing
    const intent = await this.parseWithAI(command);
    
    if (!intent) {
      return false;
    }

    // Reject native app commands - these should go to app launcher
    const nativeApps = ['apple mail', 'mail', 'safari', 'chrome', 'spotify app', 'discord app', 'slack app', 'zoom app'];
    if (intent.action === 'open' && nativeApps.includes(intent.platform.toLowerCase())) {
      Logger.info('🚫 [SmartBrowser] Rejecting native app command, should use app launcher');
      return false;
    }

    // Convert AI intent to browser action
    const action = this.intentToBrowserAction(intent);
    if (!action) {
      return false;
    }

    const handler = this.platformHandlers.get(action.platform);
    if (handler) {
      return await handler(action);
    } else {
      // Fallback to generic navigation
      return await this.handleGeneric(action);
    }
  }

  /**
   * Initialize AI parser
   */
  public initializeAIParser(openaiKey: string, geminiKey?: string): void {
    this.aiParser = new AICommandParser(openaiKey, geminiKey);
    Logger.info('🤖 [SmartBrowser] AI parser initialized with Gemini 2.0 Flash + OpenAI fallback');
  }

  /**
   * Parse command using pure AI intelligence (no pattern matching!)
   */
  private async parseWithAI(command: string): Promise<ParsedIntent | null> {
    if (!this.aiParser) {
      Logger.error('❌ [SmartBrowser] AI parser not initialized');
      return null;
    }

    Logger.info('🤖 [SmartBrowser] Using pure AI agent for command parsing');
    return await this.aiParser.parseCommand(command);
  }

  /**
   * Convert AI parsed intent to browser action
   */
  private intentToBrowserAction(intent: ParsedIntent): BrowserAction | null {
    Logger.success(`🎯 [SmartBrowser] Converting AI intent to action:`, intent);

    // Handle WhatsApp Web specifically
    if (intent.platform.toLowerCase().includes('whatsapp') && intent.platform.toLowerCase().includes('web')) {
      return {
        type: 'navigate',
        platform: 'whatsapp web',
        url: 'https://web.whatsapp.com',
        specificAction: 'navigate'
      };
    }

    // Handle other web service shortcuts
    const webServiceUrls: { [key: string]: string } = {
      'whatsapp web': 'https://web.whatsapp.com',
      'gmail web': 'https://gmail.com',
      'outlook web': 'https://outlook.live.com',
      'google drive': 'https://drive.google.com',
      'dropbox': 'https://dropbox.com',
      'notion': 'https://notion.so'
    };

    const webUrl = webServiceUrls[intent.platform.toLowerCase()];
    if (webUrl) {
      return {
        type: 'navigate',
        platform: intent.platform,
        url: webUrl,
        specificAction: 'navigate'
      };
    }

    switch (intent.action) {
      case 'search':
        if (intent.platform === 'youtube') {
          return {
            type: 'play_video',
            platform: 'youtube',
            query: intent.query,
            specificAction: 'search'
          };
        } else if (intent.platform === 'amazon') {
          return {
            type: 'search',
            platform: 'amazon',
            query: intent.query,
            specificAction: 'search'
          };
        }
        break;

      case 'play':
        if (intent.platform === 'spotify') {
          return {
            type: 'play_music',
            platform: 'spotify',
            query: intent.query,
            specificAction: 'search'
          };
        } else if (intent.platform === 'youtube') {
          return {
            type: 'play_video',
            platform: 'youtube',
            query: intent.query,
            specificAction: 'autoplay'
          };
        }
        break;

      case 'open':
        return {
          type: 'social_action',
          platform: intent.platform,
          specificAction: 'home'
        };

      case 'navigate':
        // Enhanced URL construction to handle .com domains properly
        let navigateUrl = intent.url;
        if (!navigateUrl) {
          // If platform contains a full domain, use it as is
          if (intent.platform.includes('.')) {
            navigateUrl = `https://${intent.platform}`;
          } else {
            // For known platforms, append .com
            const knownPlatforms = ['twitter', 'facebook', 'instagram', 'linkedin', 'amazon', 'netflix'];
            if (knownPlatforms.includes(intent.platform.toLowerCase())) {
              navigateUrl = `https://${intent.platform}.com`;
            } else {
              navigateUrl = `https://${intent.platform}`;
            }
          }
        }
        
        // Check if we have a specific handler for this platform
        const hasSpecificHandler = this.platformHandlers.has(intent.platform.toLowerCase());
        
        return {
          type: 'navigate',
          platform: hasSpecificHandler ? intent.platform : 'web',
          url: navigateUrl,
          specificAction: 'navigate'
        };
    }

    return null;
  }

  /**
   * Parse complex natural language commands using intelligent extraction
   */
  private parseComplexCommand(command: string): BrowserAction | null {
    const lowerCommand = command.toLowerCase().trim();

    // Smart YouTube parsing
    if (lowerCommand.includes('youtube')) {
      // Pattern: "open youtube and search for [query]"
      let match = lowerCommand.match(/open\s+youtube\s+and\s+search\s+for\s+(.+)/);
      if (match) {
        return {
          type: 'play_video',
          platform: 'youtube',
          query: match[1].trim(),
          specificAction: 'search'
        };
      }
      
      // Pattern: "youtube search [query]"
      match = lowerCommand.match(/youtube\s+search\s+(.+)/);
      if (match) {
        return {
          type: 'play_video',
          platform: 'youtube',
          query: match[1].trim(),
          specificAction: 'search'
        };
      }
      
      // Pattern: "search [query] on youtube"
      match = lowerCommand.match(/search\s+(.+?)\s+on\s+youtube/);
      if (match) {
        return {
          type: 'play_video',
          platform: 'youtube',
          query: match[1].trim(),
          specificAction: 'search'
        };
      }
      
      // Pattern: "play [query] on youtube"
      match = lowerCommand.match(/play\s+(.+?)\s+on\s+youtube/);
      if (match) {
        return {
          type: 'play_video',
          platform: 'youtube',
          query: match[1].trim(),
          specificAction: 'autoplay'
        };
      }
      
      // Simple pattern: just "youtube" with other words
      match = lowerCommand.match(/youtube\s+(.+)/);
      if (match) {
        return {
          type: 'play_video',
          platform: 'youtube',
          query: match[1].trim(),
          specificAction: 'search'
        };
      }
    }

    // Spotify patterns
    if (this.matchesPattern(lowerCommand, [
      /open spotify and (search for|play) (.+)/,
      /play (.+) on spotify/,
      /spotify (.+)/,
      /listen to (.+) on spotify/
    ])) {
      const query = this.extractQuery(lowerCommand, ['spotify', 'play', 'listen', 'to', 'on', 'and', 'search', 'for']);
      return {
        type: 'play_music',
        platform: 'spotify',
        query,
        specificAction: lowerCommand.includes('play') || lowerCommand.includes('listen') ? 'autoplay' : 'search'
      };
    }

    // Facebook patterns
    if (this.matchesPattern(lowerCommand, [
      /open facebook/,
      /go to facebook/,
      /check facebook/
    ])) {
      return {
        type: 'social_action',
        platform: 'facebook',
        specificAction: 'home'
      };
    }

    // Instagram patterns
    if (this.matchesPattern(lowerCommand, [
      /open instagram/,
      /check instagram/,
      /go to instagram/
    ])) {
      return {
        type: 'social_action',
        platform: 'instagram',
        specificAction: 'home'
      };
    }

    // Shopping patterns
    if (this.matchesPattern(lowerCommand, [
      /search (.+) on amazon/,
      /buy (.+) on amazon/,
      /amazon (.+)/,
      /shop for (.+)/
    ])) {
      const query = this.extractQuery(lowerCommand, ['amazon', 'search', 'buy', 'shop', 'for', 'on']);
      return {
        type: 'search',
        platform: 'amazon',
        query
      };
    }

    // Gmail patterns
    if (this.matchesPattern(lowerCommand, [
      /open gmail/,
      /check email/,
      /go to gmail/
    ])) {
      return {
        type: 'navigate',
        platform: 'gmail',
        specificAction: 'inbox'
      };
    }

    return null;
  }

  /**
   * Check if command matches any of the given patterns
   */
  private matchesPattern(command: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(command));
  }

  /**
   * Extract query from command using intelligent parsing
   */
  private extractQuery(command: string, wordsToRemove: string[]): string {
    const lowerCommand = command.toLowerCase();
    
    // Use regex patterns to intelligently extract the actual search query
    
    // Pattern: "open [platform] and search for [query]"
    let match = lowerCommand.match(/open\s+\w+\s+and\s+search\s+for\s+(.+)/);
    if (match) return match[1].trim();
    
    // Pattern: "search for [query] on [platform]"
    match = lowerCommand.match(/search\s+for\s+(.+?)\s+on\s+\w+/);
    if (match) return match[1].trim();
    
    // Pattern: "play [query] on [platform]"
    match = lowerCommand.match(/play\s+(.+?)\s+on\s+\w+/);
    if (match) return match[1].trim();
    
    // Pattern: "[platform] search [query]"
    match = lowerCommand.match(/\w+\s+search\s+(.+)/);
    if (match) return match[1].trim();
    
    // Pattern: "[platform] [query]" (for "youtube steve jobs")
    match = lowerCommand.match(/(?:youtube|spotify|amazon)\s+(.+)/);
    if (match) return match[1].trim();
    
    // Fallback: remove words and clean up
    let query = command;
    wordsToRemove.forEach(word => {
      query = query.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
    });
    
    return query.replace(/\s+/g, ' ').trim();
  }

  /**
   * Handle YouTube actions
   */
  private async handleYouTube(action: BrowserAction): Promise<boolean> {
    try {
      let url: string;
      
      if (action.specificAction === 'autoplay' && action.query) {
        // Try to go directly to first search result (YouTube's "I'm Feeling Lucky")
        url = `https://www.youtube.com/results?search_query=${encodeURIComponent(action.query)}`;
      } else if (action.query) {
        url = `https://www.youtube.com/results?search_query=${encodeURIComponent(action.query)}`;
      } else {
        url = 'https://www.youtube.com';
      }
      
      await shell.openExternal(url);
      
      if (action.query) {
        Logger.success(`🎥 YouTube: Searching for "${action.query}"`);
      } else {
        Logger.success('🎥 YouTube: Opened homepage');
      }
      
      return true;
    } catch (error) {
      Logger.error('Failed to open YouTube:', error);
      return false;
    }
  }

  /**
   * Handle Spotify actions
   */
  private async handleSpotify(action: BrowserAction): Promise<boolean> {
    try {
      let url: string;
      
      if (action.query) {
        const encodedQuery = encodeURIComponent(action.query);
        url = `https://open.spotify.com/search/${encodedQuery}`;
      } else {
        url = 'https://open.spotify.com';
      }
      
      await shell.openExternal(url);
      
      if (action.query) {
        Logger.success(`🎵 Spotify: Searching for "${action.query}"`);
      } else {
        Logger.success('🎵 Spotify: Opened homepage');
      }
      
      return true;
    } catch (error) {
      Logger.error('Failed to open Spotify:', error);
      return false;
    }
  }

  /**
   * Handle Facebook actions
   */
  private async handleFacebook(action: BrowserAction): Promise<boolean> {
    try {
      const url = 'https://www.facebook.com';
      await shell.openExternal(url);
      Logger.success('👥 Facebook: Opened homepage');
      return true;
    } catch (error) {
      Logger.error('Failed to open Facebook:', error);
      return false;
    }
  }

  /**
   * Handle Instagram actions
   */
  private async handleInstagram(action: BrowserAction): Promise<boolean> {
    try {
      const url = 'https://www.instagram.com';
      await shell.openExternal(url);
      Logger.success('📸 Instagram: Opened homepage');
      return true;
    } catch (error) {
      Logger.error('Failed to open Instagram:', error);
      return false;
    }
  }

  /**
   * Handle Twitter/X actions
   */
  private async handleTwitter(action: BrowserAction): Promise<boolean> {
    try {
      const url = 'https://x.com';
      await shell.openExternal(url);
      Logger.success('🐦 X (Twitter): Opened homepage');
      return true;
    } catch (error) {
      Logger.error('Failed to open X (Twitter):', error);
      return false;
    }
  }

  /**
   * Handle LinkedIn actions
   */
  private async handleLinkedIn(action: BrowserAction): Promise<boolean> {
    try {
      const url = 'https://www.linkedin.com';
      await shell.openExternal(url);
      Logger.success('💼 LinkedIn: Opened homepage');
      return true;
    } catch (error) {
      Logger.error('Failed to open LinkedIn:', error);
      return false;
    }
  }

  /**
   * Handle Amazon actions
   */
  private async handleAmazon(action: BrowserAction): Promise<boolean> {
    try {
      let url: string;
      
      if (action.query) {
        url = `https://www.amazon.com/s?k=${encodeURIComponent(action.query)}`;
        Logger.success(`🛒 Amazon: Searching for "${action.query}"`);
      } else {
        url = 'https://www.amazon.com';
        Logger.success('🛒 Amazon: Opened homepage');
      }
      
      await shell.openExternal(url);
      return true;
    } catch (error) {
      Logger.error('Failed to open Amazon:', error);
      return false;
    }
  }

  /**
   * Handle Netflix actions
   */
  private async handleNetflix(action: BrowserAction): Promise<boolean> {
    try {
      const url = 'https://www.netflix.com';
      await shell.openExternal(url);
      Logger.success('🎬 Netflix: Opened homepage');
      return true;
    } catch (error) {
      Logger.error('Failed to open Netflix:', error);
      return false;
    }
  }

  /**
   * Handle Gmail actions
   */
  private async handleGmail(action: BrowserAction): Promise<boolean> {
    try {
      const url = 'https://gmail.com';
      await shell.openExternal(url);
      Logger.success('📧 Gmail: Opened inbox');
      return true;
    } catch (error) {
      Logger.error('Failed to open Gmail:', error);
      return false;
    }
  }

  /**
   * Handle generic browser actions
   */
  private async handleGeneric(action: BrowserAction): Promise<boolean> {
    try {
      if (action.url) {
        await shell.openExternal(action.url);
        Logger.success(`🌐 Opened: ${action.url}`);
        return true;
      }
      return false;
    } catch (error) {
      Logger.error('Failed to open URL:', error);
      return false;
    }
  }

  /**
   * Get popular platforms for autocomplete
   */
  public getSupportedPlatforms(): string[] {
    return Array.from(this.platformHandlers.keys());
  }

  /**
   * Generate platform-specific suggestions
   */
  public generateSuggestions(platform: string): string[] {
    const suggestions: Record<string, string[]> = {
      youtube: [
        'Open YouTube and search for cats',
        'Play music videos on YouTube',
        'Watch tutorials on YouTube'
      ],
      spotify: [
        'Play jazz music on Spotify',
        'Open Spotify and search for podcasts',
        'Listen to classical music on Spotify'
      ],
      amazon: [
        'Search for books on Amazon',
        'Buy electronics on Amazon',
        'Shop for clothes on Amazon'
      ],
      facebook: [
        'Open Facebook',
        'Check Facebook news feed'
      ],
      instagram: [
        'Open Instagram',
        'Check Instagram stories'
      ]
    };

    return suggestions[platform] || [];
  }
}

export const smartBrowserService = new SmartBrowserService();
