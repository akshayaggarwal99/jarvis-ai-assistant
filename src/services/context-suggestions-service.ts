import { appLauncherService } from './app-launcher-service';
import { smartBrowserService } from './smart-browser-service';
import { Logger } from '../core/logger';

export interface UserBehaviorPattern {
  command: string;
  frequency: number;
  lastUsed: Date;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number; // 0-6
  category: 'productivity' | 'entertainment' | 'social' | 'shopping' | 'other';
}

export interface SmartSuggestion {
  text: string;
  confidence: number;
  category: string;
  reason: string;
}

/**
 * Context-Aware Suggestions Service
 * Learns from user behavior and provides intelligent suggestions
 */
export class ContextSuggestionsService {
  private userPatterns: Map<string, UserBehaviorPattern> = new Map();
  private readonly PATTERNS_FILE = 'jarvis-usage-patterns.json';

  constructor() {
    this.loadPatterns();
  }

  /**
   * Record user action for learning
   */
  public recordAction(command: string, category: string = 'other'): void {
    const normalizedCommand = command.toLowerCase().trim();
    const now = new Date();
    const timeOfDay = this.getTimeOfDay(now);
    
    const existing = this.userPatterns.get(normalizedCommand);
    if (existing) {
      existing.frequency++;
      existing.lastUsed = now;
    } else {
      this.userPatterns.set(normalizedCommand, {
        command: normalizedCommand,
        frequency: 1,
        lastUsed: now,
        timeOfDay,
        dayOfWeek: now.getDay(),
        category: category as any
      });
    }
    
    this.savePatterns();
  }

  /**
   * Get contextual suggestions based on current time, patterns, and partial input
   */
  public getContextualSuggestions(partialInput: string = '', limit: number = 5): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];
    const now = new Date();
    const timeOfDay = this.getTimeOfDay(now);
    const dayOfWeek = now.getDay();
    
    // Time-based suggestions
    suggestions.push(...this.getTimeBasedSuggestions(timeOfDay, dayOfWeek));
    
    // Pattern-based suggestions (most frequent)
    suggestions.push(...this.getPatternBasedSuggestions());
    
    // Partial input suggestions
    if (partialInput.length > 2) {
      suggestions.push(...this.getPartialMatchSuggestions(partialInput));
    }
    
    // Popular app suggestions
    suggestions.push(...this.getPopularAppSuggestions());
    
    // Platform-specific suggestions
    suggestions.push(...this.getPlatformSuggestions());
    
    // Sort by confidence and return top suggestions
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Get suggestions based on time of day and patterns
   */
  private getTimeBasedSuggestions(timeOfDay: string, dayOfWeek: number): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];
    
    // Morning suggestions (weekday vs weekend)
    if (timeOfDay === 'morning') {
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Weekday
        suggestions.push({
          text: 'Open Gmail',
          confidence: 0.8,
          category: 'productivity',
          reason: 'People often check email in the morning on weekdays'
        });
        suggestions.push({
          text: 'Open Slack',
          confidence: 0.7,
          category: 'productivity', 
          reason: 'Work communication typically starts in the morning'
        });
      } else { // Weekend
        suggestions.push({
          text: 'Open YouTube and search for workout videos',
          confidence: 0.6,
          category: 'entertainment',
          reason: 'Weekend morning activity suggestions'
        });
      }
    }
    
    // Evening suggestions
    if (timeOfDay === 'evening') {
      suggestions.push({
        text: 'Open Netflix',
        confidence: 0.7,
        category: 'entertainment',
        reason: 'Popular evening entertainment choice'
      });
      suggestions.push({
        text: 'Play relaxing music on Spotify',
        confidence: 0.6,
        category: 'entertainment',
        reason: 'Evening relaxation'
      });
    }
    
    // Lunch time suggestions
    if (timeOfDay === 'afternoon') {
      suggestions.push({
        text: 'Search for restaurants on Google',
        confidence: 0.5,
        category: 'other',
        reason: 'Lunch time food search'
      });
    }
    
    return suggestions;
  }

  /**
   * Get suggestions based on user patterns
   */
  private getPatternBasedSuggestions(): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];
    
    // Get most frequent actions
    const sortedPatterns = Array.from(this.userPatterns.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3);
    
    for (const pattern of sortedPatterns) {
      suggestions.push({
        text: pattern.command,
        confidence: Math.min(0.9, pattern.frequency * 0.1),
        category: pattern.category,
        reason: `You've used this ${pattern.frequency} times`
      });
    }
    
    return suggestions;
  }

  /**
   * Get suggestions based on partial input
   */
  private getPartialMatchSuggestions(partialInput: string): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];
    const lowerInput = partialInput.toLowerCase();
    
    // Match against installed apps
    const installedApps = appLauncherService.getInstalledApps();
    for (const app of installedApps) {
      if (app.toLowerCase().includes(lowerInput)) {
        suggestions.push({
          text: `Open ${app}`,
          confidence: 0.8,
          category: 'productivity',
          reason: 'Installed app match'
        });
      }
    }
    
    // Match against popular websites
    const websites = ['YouTube', 'Facebook', 'Instagram', 'Twitter', 'Gmail', 'Amazon', 'Spotify'];
    for (const site of websites) {
      if (site.toLowerCase().includes(lowerInput)) {
        suggestions.push({
          text: `Open ${site}`,
          confidence: 0.7,
          category: 'social',
          reason: 'Popular website match'
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Get popular app suggestions
   */
  private getPopularAppSuggestions(): SmartSuggestion[] {
    const popularCommands = [
      { text: 'Open YouTube and search for music', category: 'entertainment' },
      { text: 'Go to Google', category: 'productivity' },
      { text: 'Open Spotify', category: 'entertainment' },
      { text: 'Check Facebook', category: 'social' },
      { text: 'Open Gmail', category: 'productivity' }
    ];
    
    return popularCommands.map(cmd => ({
      text: cmd.text,
      confidence: 0.4,
      category: cmd.category,
      reason: 'Popular command'
    }));
  }

  /**
   * Get platform-specific suggestions
   */
  private getPlatformSuggestions(): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];
    
    const platforms = smartBrowserService.getSupportedPlatforms();
    for (const platform of platforms.slice(0, 3)) {
      const platformSuggestions = smartBrowserService.generateSuggestions(platform);
      for (const suggestion of platformSuggestions.slice(0, 1)) {
        suggestions.push({
          text: suggestion,
          confidence: 0.3,
          category: 'entertainment',
          reason: `${platform} suggestion`
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Get time of day category
   */
  private getTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = date.getHours();
    
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';  
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Get quick suggestions for common scenarios
   */
  public getQuickSuggestions(): SmartSuggestion[] {
    return [
      {
        text: 'Open YouTube and search for cats',
        confidence: 0.9,
        category: 'entertainment',
        reason: 'Popular example command'
      },
      {
        text: 'Play jazz music on Spotify',
        confidence: 0.8,
        category: 'entertainment', 
        reason: 'Music streaming example'
      },
      {
        text: 'Search for restaurants on Google',
        confidence: 0.7,
        category: 'other',
        reason: 'Local search example'
      },
      {
        text: 'Open Facebook',
        confidence: 0.6,
        category: 'social',
        reason: 'Social media access'
      }
    ];
  }

  /**
   * Load patterns from storage
   */
  private loadPatterns(): void {
    try {
      // In a real implementation, this would load from app user data directory
      // For now, just initialize empty
      Logger.debug('📊 Context suggestions service initialized');
    } catch (error) {
      Logger.error('Failed to load user patterns:', error);
    }
  }

  /**
   * Save patterns to storage
   */
  private savePatterns(): void {
    try {
      // In a real implementation, this would save to app user data directory
      Logger.debug('💾 User patterns saved');
    } catch (error) {
      Logger.error('Failed to save user patterns:', error);
    }
  }

  /**
   * Clear all user patterns (for privacy/reset)
   */
  public clearPatterns(): void {
    this.userPatterns.clear();
    this.savePatterns();
    Logger.info('🗑️ User patterns cleared');
  }
}

export const contextSuggestionsService = new ContextSuggestionsService();
