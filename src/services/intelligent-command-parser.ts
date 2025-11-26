import { Logger } from '../core/logger';

export interface ParsedCommand {
  action: 'open_app' | 'search' | 'navigate' | 'play_music' | 'play_video';
  platform: string;
  query?: string;
  confidence: number;
  rawCommand: string;
}

/**
 * AI-Powered Command Parser
 * Uses intelligent parsing instead of crude pattern matching
 */
export class IntelligentCommandParser {
  
  /**
   * Parse natural language command using AI-like intelligence
   */
  public parseCommand(command: string): ParsedCommand | null {
    const normalizedCommand = command.toLowerCase().trim();
    Logger.info('🧠 [IntelligentParser] Parsing command:', normalizedCommand);

    // YouTube video search parsing
    if (this.containsWords(normalizedCommand, ['youtube'])) {
      const query = this.extractSearchQuery(normalizedCommand, {
        platform: 'youtube',
        actionWords: ['open', 'go to', 'search', 'play', 'watch', 'find'],
        connectorWords: ['and', 'for', 'on', 'in']
      });
      
      if (query) {
        Logger.success('🎯 [IntelligentParser] YouTube search extracted:', query);
        return {
          action: 'play_video',
          platform: 'youtube',
          query,
          confidence: 0.95,
          rawCommand: command
        };
      }
    }

    // Spotify music search parsing  
    if (this.containsWords(normalizedCommand, ['spotify'])) {
      const query = this.extractSearchQuery(normalizedCommand, {
        platform: 'spotify',
        actionWords: ['open', 'play', 'listen', 'search', 'find'],
        connectorWords: ['and', 'to', 'on', 'for']
      });
      
      if (query) {
        Logger.success('🎯 [IntelligentParser] Spotify search extracted:', query);
        return {
          action: 'play_music',
          platform: 'spotify',
          query,
          confidence: 0.95,
          rawCommand: command
        };
      }
    }

    // Amazon search parsing
    if (this.containsWords(normalizedCommand, ['amazon'])) {
      const query = this.extractSearchQuery(normalizedCommand, {
        platform: 'amazon',
        actionWords: ['open', 'search', 'buy', 'shop', 'find'],
        connectorWords: ['and', 'for', 'on']
      });
      
      if (query) {
        Logger.success('🎯 [IntelligentParser] Amazon search extracted:', query);
        return {
          action: 'search',
          platform: 'amazon',
          query,
          confidence: 0.95,
          rawCommand: command
        };
      }
    }

    // Generic app opening
    const appMatch = this.extractAppName(normalizedCommand);
    if (appMatch) {
      Logger.success('🎯 [IntelligentParser] App opening extracted:', appMatch);
      return {
        action: 'open_app',
        platform: appMatch,
        confidence: 0.8,
        rawCommand: command
      };
    }

    // Website navigation
    const websiteMatch = this.extractWebsite(normalizedCommand);
    if (websiteMatch) {
      Logger.success('🎯 [IntelligentParser] Website navigation extracted:', websiteMatch);
      return {
        action: 'navigate',
        platform: 'web',
        query: websiteMatch,
        confidence: 0.9,
        rawCommand: command
      };
    }

    Logger.debug('❓ [IntelligentParser] No clear intent found');
    return null;
  }

  /**
   * Intelligently extract search query from command
   */
  private extractSearchQuery(command: string, config: {
    platform: string;
    actionWords: string[];
    connectorWords: string[];
  }): string | null {
    
    // Method 1: Find content after "search for"
    let match = command.match(/search\s+for\s+(.+?)(?:\s+on\s+\w+)?$/);
    if (match) {
      return match[1].trim();
    }
    
    // Method 2: Find content after platform and connector words
    const platformIndex = command.indexOf(config.platform);
    if (platformIndex !== -1) {
      const afterPlatform = command.substring(platformIndex + config.platform.length).trim();
      
      // Remove leading connector words
      const connectorPattern = new RegExp(`^(?:${config.connectorWords.join('|')})\\s+`, 'i');
      let cleaned = afterPlatform.replace(connectorPattern, '');
      
      // Remove leading action words
      const actionPattern = new RegExp(`^(?:${config.actionWords.join('|')})\\s+`, 'i');
      cleaned = cleaned.replace(actionPattern, '');
      
      // Remove "for" if it's at the beginning
      cleaned = cleaned.replace(/^for\s+/, '');
      
      if (cleaned.length > 0) {
        return cleaned.trim();
      }
    }
    
    // Method 3: Find content after action words
    for (const actionWord of config.actionWords) {
      const pattern = new RegExp(`${actionWord}\\s+(.+?)\\s+on\\s+${config.platform}`, 'i');
      match = command.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    // Method 4: Look for quoted content or content after "and"
    match = command.match(/and\s+(.+)/);
    if (match) {
      let content = match[1].trim();
      // Remove common prefixes
      content = content.replace(/^(?:search\s+(?:for\s+)?|play\s+|find\s+|look\s+for\s+)/, '');
      if (content.length > 0) {
        return content;
      }
    }
    
    return null;
  }

  /**
   * Extract app name from command
   */
  private extractAppName(command: string): string | null {
    const match = command.match(/(?:open|launch|start)\s+([a-zA-Z]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract website from command
   */
  private extractWebsite(command: string): string | null {
    const match = command.match(/([\w-]+\.(?:com|org|net|edu|io|co\.uk))/);
    return match ? `https://${match[1]}` : null;
  }

  /**
   * Check if command contains any of the given words
   */
  private containsWords(command: string, words: string[]): boolean {
    return words.some(word => command.includes(word));
  }
}

export const intelligentCommandParser = new IntelligentCommandParser();
