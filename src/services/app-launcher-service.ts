import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../core/logger';
import { shell } from 'electron';
import { AICommandParser } from './ai-command-parser';

const execAsync = promisify(exec);

export interface AppLaunchIntent {
  action: 'open_app' | 'open_website' | 'search_web' | 'app_action';
  appName?: string;
  website?: string;
  query?: string;
  searchEngine?: 'google' | 'youtube' | 'spotify' | 'amazon' | 'custom';
  customUrl?: string;
  confidence: number;
}

export interface InstalledApp {
  name: string;
  bundleId: string;
  executablePath: string;
  keywords: string[];
  lastUsed?: Date;
  usageCount: number;
}

/**
 * Universal App Launcher Service
 * Handles opening apps, websites, and performing web searches based on natural language commands
 */
export class AppLauncherService {
  private installedApps: Map<string, InstalledApp> = new Map();
  private aiParser?: AICommandParser;
  private popularWebsites = new Map([
    ['youtube', 'https://youtube.com'],
    ['facebook', 'https://facebook.com'],
    ['instagram', 'https://instagram.com'],
    ['twitter', 'https://twitter.com'],
    ['x', 'https://x.com'],
    ['gmail', 'https://gmail.com'],
    ['slack', 'https://slack.com'],
    ['zoom', 'https://zoom.us'],
    ['netflix', 'https://netflix.com'],
    ['amazon', 'https://amazon.com'],
    ['spotify', 'https://spotify.com'],
    ['github', 'https://github.com'],
    ['linkedin', 'https://linkedin.com'],
    ['reddit', 'https://reddit.com'],
    ['discord', 'https://discord.com']
  ]);

  constructor(openaiKey?: string, geminiKey?: string) {
    if (openaiKey) {
      this.aiParser = new AICommandParser(openaiKey, geminiKey);
    }
    this.initializeApps();
  }

  /**
   * Initialize AI parser with OpenAI and Gemini keys
   */
  public initializeAIParser(openaiKey: string, geminiKey?: string): void {
    this.aiParser = new AICommandParser(openaiKey, geminiKey);
    Logger.info('🤖 AI Command Parser initialized with Gemini 2.0 Flash + OpenAI fallback');
  }

  /**
   * Initialize by scanning for installed applications
   */
  private async initializeApps(): Promise<void> {
    try {
      await this.scanInstalledApps();
      Logger.info('🚀 App Launcher Service initialized');
    } catch (error) {
      Logger.error('Failed to initialize App Launcher Service:', error);
    }
  }

  /**
   * Scan for installed applications on macOS
   */
  private async scanInstalledApps(): Promise<void> {
    try {
      // Get applications from /Applications folder
      const { stdout } = await execAsync('find /Applications -name "*.app" -maxdepth 2');
      const appPaths = stdout.trim().split('\n').filter(path => path);

      for (const appPath of appPaths) {
        const appName = appPath.split('/').pop()?.replace('.app', '') || '';
        const bundleId = await this.getBundleId(appPath);
        
        if (appName && bundleId) {
          const keywords = this.generateKeywords(appName);
          this.installedApps.set(appName.toLowerCase(), {
            name: appName,
            bundleId,
            executablePath: appPath,
            keywords,
            usageCount: 0
          });
        }
      }

      Logger.debug(`📱 Found ${this.installedApps.size} installed applications`);
    } catch (error) {
      Logger.error('Failed to scan installed apps:', error);
    }
  }

  /**
   * Get bundle ID for an app
   */
  private async getBundleId(appPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`defaults read "${appPath}/Contents/Info.plist" CFBundleIdentifier`);
      return stdout.trim();
    } catch {
      return '';
    }
  }

  /**
   * Generate search keywords for an app
   */
  private generateKeywords(appName: string): string[] {
    const keywords = [appName.toLowerCase()];
    
    // Add common abbreviations and variations
    const commonMappings: Record<string, string[]> = {
      'visual studio code': ['vscode', 'vs code', 'code'],
      'google chrome': ['chrome', 'browser'],
      'microsoft word': ['word'],
      'microsoft excel': ['excel'],
      'microsoft powerpoint': ['powerpoint', 'ppt'],
      'adobe photoshop': ['photoshop', 'ps'],
      'final cut pro': ['final cut', 'fcp'],
      'logic pro': ['logic'],
      'safari': ['browser'],
      'firefox': ['browser'],
      'slack': ['communication', 'chat'],
      'zoom': ['video', 'meeting'],
      'spotify': ['music', 'streaming'],
      'netflix': ['streaming', 'video'],
      'terminal': ['command line', 'shell'],
      'finder': ['file manager', 'files']
    };

    const mapping = commonMappings[appName.toLowerCase()];
    if (mapping) {
      keywords.push(...mapping);
    }

    return keywords;
  }

  /**
   * Parse natural language command to determine intent
   */
  public async parseIntent(command: string): Promise<AppLaunchIntent> {
    // Use AI parser if available
    if (this.aiParser) {
      try {
        const aiResult = await this.aiParser.parseCommand(command);
        
        if (aiResult) {
          // Convert AI result to AppLaunchIntent format
          const intent: AppLaunchIntent = {
            action: this.convertAIActionToAppAction(aiResult.action, aiResult.platform),
            confidence: aiResult.confidence,
          };

          // Map platform and query to appropriate fields
          if (aiResult.platform && aiResult.action === 'open' && !aiResult.query) {
            // Opening an app - map platform names
            intent.appName = this.mapPlatformToAppName(aiResult.platform);
            intent.action = 'open_app';
          } else if (aiResult.url) {
            // Opening a website
            intent.action = 'open_website';
            intent.website = aiResult.url;
          } else if (aiResult.query) {
            // Searching
            intent.action = 'search_web';
            intent.query = aiResult.query;
            intent.searchEngine = this.mapPlatformToSearchEngine(aiResult.platform);
          }

          Logger.info('🤖 AI Parser result:', intent);
          return intent;
        }
      } catch (error) {
        Logger.error('AI parser failed, falling back to pattern matching:', error);
      }
    }

    // Fallback to pattern matching
    return this.parseIntentWithPatterns(command);
  }

  /**
   * Convert AI action to app launcher action
   */
  private convertAIActionToAppAction(action: string, platform: string): AppLaunchIntent['action'] {
    const lowerPlatform = platform.toLowerCase();
    
    // Native app platforms
    const nativeApps = ['apple mail', 'mail', 'safari', 'chrome', 'spotify app', 'discord app', 'slack app', 'zoom app'];
    
    switch (action) {
      case 'open':
        // Check if it's explicitly a native app
        if (nativeApps.includes(lowerPlatform)) {
          return 'open_app';
        }
        // Check if it's a website or web service
        if (platform.includes('.') || this.popularWebsites.has(lowerPlatform)) {
          return 'open_website';
        }
        // Default to app for "open" commands
        return 'open_app';
      case 'search':
        return 'search_web';
      case 'navigate':
        return 'open_website';
      case 'play':
        return 'search_web';
      default:
        return 'search_web';
    }
  }

  /**
   * Map platform to search engine
   */
  private mapPlatformToSearchEngine(platform: string): AppLaunchIntent['searchEngine'] {
    const lowerPlatform = platform.toLowerCase();
    if (lowerPlatform.includes('youtube')) return 'youtube';
    if (lowerPlatform.includes('spotify')) return 'spotify';
    if (lowerPlatform.includes('amazon')) return 'amazon';
    return 'google';
  }

  /**
   * Map AI platform names to actual app names with better detection
   */
  private mapPlatformToAppName(platform: string): string {
    const lowerPlatform = platform.toLowerCase();
    
    // Map AI platform names to actual macOS app names - use simple names first
    const platformMap: { [key: string]: string } = {
      'apple mail': 'Mail',
      'mail': 'Mail', 
      'safari': 'Safari',
      'chrome': 'Google Chrome',
      'google chrome': 'Google Chrome',
      'firefox': 'Firefox',
      'spotify app': 'Spotify',
      'spotify': 'Spotify',
      'discord app': 'Discord',
      'discord': 'Discord',
      'slack app': 'Slack',
      'slack': 'Slack',
      'zoom app': 'Zoom',
      'zoom': 'Zoom',
      'whatsapp': 'WhatsApp',
      'whatsapp app': 'WhatsApp',
      'microsoft edge': 'Microsoft Edge',
      'edge': 'Microsoft Edge',
      'terminal': 'Terminal',
      'finder': 'Finder',
      'calculator': 'Calculator',
      'calendar': 'Calendar',
      'notes': 'Notes',
      'notes app': 'Notes',
      'reminders': 'Reminders',
      'messages': 'Messages',
      'facetime': 'FaceTime',
      'photos': 'Photos',
      'music': 'Music',
      'apple music': 'Music',
      'tv': 'TV',
      'books': 'Books',
      'podcasts': 'Podcasts'
    };

    return platformMap[lowerPlatform] || platform;
  }

  /**
   * Parse natural language command using pattern matching (fallback)
   */
  private parseIntentWithPatterns(command: string): AppLaunchIntent {
    const lowerCommand = command.toLowerCase().trim();
    
    // Remove common voice command prefixes
    const cleanCommand = lowerCommand
      .replace(/^(hey jarvis,?|jarvis,?|ok jarvis,?)\s*/i, '')
      .replace(/^(please|can you|could you)\s*/i, '')
      .trim();

    // Website patterns
    if (this.isWebsiteCommand(cleanCommand)) {
      return this.parseWebsiteIntent(cleanCommand);
    }

    // Search patterns
    if (this.isSearchCommand(cleanCommand)) {
      return this.parseSearchIntent(cleanCommand);
    }

    // App launch patterns
    if (this.isAppCommand(cleanCommand)) {
      return this.parseAppIntent(cleanCommand);
    }

    // Default to web search if unclear
    return {
      action: 'search_web',
      query: cleanCommand,
      searchEngine: 'google',
      confidence: 0.3
    };
  }

  /**
   * Check if command is for opening a website
   */
  private isWebsiteCommand(command: string): boolean {
    const websitePatterns = [
      /^(open|go to|visit|navigate to)\s+(.+\.(com|org|net|edu|io|co|uk))/,
      /^(open|go to|visit)\s+(youtube|facebook|instagram|twitter|gmail|slack)/,
      /\.(com|org|net|edu|io|co|uk)$/
    ];
    
    return websitePatterns.some(pattern => pattern.test(command));
  }

  /**
   * Check if command is for searching
   */
  private isSearchCommand(command: string): boolean {
    const searchPatterns = [
      /search\s+(for\s+)?(.+)/,
      /look up\s+(.+)/,
      /find\s+(.+)/,
      /(youtube|spotify|amazon)\s+(.+)/,
      /play\s+(.+)\s+(on\s+)?(youtube|spotify)/
    ];
    
    return searchPatterns.some(pattern => pattern.test(command));
  }

  /**
   * Check if command is for opening an app
   */
  private isAppCommand(command: string): boolean {
    const appPatterns = [
      /^(open|launch|start)\s+(.+)/,
      /^(.+)\s+app$/
    ];
    
    return appPatterns.some(pattern => pattern.test(command)) || 
           Array.from(this.installedApps.keys()).some(app => command.includes(app));
  }

  /**
   * Parse website opening intent
   */
  private parseWebsiteIntent(command: string): AppLaunchIntent {
    // Extract website from command
    const websiteMatch = command.match(/(open|go to|visit|navigate to)\s+(.+)/);
    let website = websiteMatch ? websiteMatch[2] : command;
    
    // Clean up the website
    website = website.replace(/^(www\.)?/, '');
    if (!website.includes('.') && this.popularWebsites.has(website)) {
      website = this.popularWebsites.get(website)!;
    } else if (!website.startsWith('http')) {
      website = website.includes('.') ? `https://${website}` : `https://${website}.com`;
    }

    return {
      action: 'open_website',
      website,
      confidence: 0.9
    };
  }

  /**
   * Parse search intent
   */
  private parseSearchIntent(command: string): AppLaunchIntent {
    let searchEngine: 'google' | 'youtube' | 'spotify' | 'amazon' | 'custom' = 'google';
    let query = command;

    // YouTube patterns
    const youtubeMatch = command.match(/(youtube|play.*on youtube)\s+(.+)/);
    if (youtubeMatch || command.includes('youtube')) {
      searchEngine = 'youtube';
      query = youtubeMatch ? youtubeMatch[2] : command.replace(/youtube|on youtube/g, '').trim();
    }

    // Spotify patterns
    const spotifyMatch = command.match(/(spotify|play.*on spotify)\s+(.+)/);
    if (spotifyMatch || command.includes('spotify')) {
      searchEngine = 'spotify';
      query = spotifyMatch ? spotifyMatch[2] : command.replace(/spotify|on spotify/g, '').trim();
    }

    // Amazon patterns
    if (command.includes('amazon') || command.includes('buy')) {
      searchEngine = 'amazon';
      query = command.replace(/amazon|buy/g, '').trim();
    }

    // General search patterns
    const searchMatch = command.match(/search\s+(for\s+)?(.+)/);
    if (searchMatch) {
      query = searchMatch[2];
    }

    return {
      action: 'search_web',
      query: query.replace(/^(for|about)\s+/, ''),
      searchEngine,
      confidence: 0.8
    };
  }

  /**
   * Parse app opening intent
   */
  private parseAppIntent(command: string): AppLaunchIntent {
    const appMatch = command.match(/(open|launch|start)\s+(.+)/);
    let appName = appMatch ? appMatch[2] : command;
    
    // Clean app name
    appName = appName.replace(/\s+app$/, '').trim();
    
    // Find best matching app
    const matchedApp = this.findBestAppMatch(appName);
    
    return {
      action: 'open_app',
      appName: matchedApp?.name || appName,
      confidence: matchedApp ? 0.9 : 0.4
    };
  }

  /**
   * Find best matching app from installed apps
   */
  private findBestAppMatch(query: string): InstalledApp | null {
    const lowerQuery = query.toLowerCase();
    
    // Exact match
    for (const [key, app] of this.installedApps) {
      if (key === lowerQuery) {
        return app;
      }
    }
    
    // Keyword match
    for (const [key, app] of this.installedApps) {
      if (app.keywords.some(keyword => keyword.includes(lowerQuery) || lowerQuery.includes(keyword))) {
        return app;
      }
    }
    
    // Partial match
    for (const [key, app] of this.installedApps) {
      if (key.includes(lowerQuery) || lowerQuery.includes(key)) {
        return app;
      }
    }
    
    return null;
  }

  /**
   * Execute the parsed intent
   */
  public async executeIntent(intent: AppLaunchIntent): Promise<boolean> {
    try {
      Logger.info(`🎯 Executing intent: ${intent.action}`, intent);
      
      switch (intent.action) {
        case 'open_app':
          return await this.openApp(intent.appName!);
        
        case 'open_website':
          return await this.openWebsite(intent.website!);
        
        case 'search_web':
          return await this.performWebSearch(intent.query!, intent.searchEngine!);
        
        default:
          Logger.warning('Unknown intent action:', intent.action);
          return false;
      }
    } catch (error) {
      Logger.error('Failed to execute intent:', error);
      return false;
    }
  }

  /**
   * Open an application - use simple names instead of bundle IDs
   */
  private async openApp(appName: string): Promise<boolean> {
    Logger.info(`🚀 [AppLauncher] Attempting to open app: ${appName}`);
    
    try {
      // First try opening by the mapped app name directly
      await execAsync(`open -a "${appName}"`);
      Logger.success(`✅ [AppLauncher] Successfully opened ${appName}`);
      return true;
    } catch (error) {
      Logger.debug(`🔄 [AppLauncher] Direct open failed, trying app search for: ${appName}`);
      
      // Try to find the app in our installed apps list
      const app = this.findBestAppMatch(appName);
      
      if (app) {
        try {
          Logger.info(`🚀 [AppLauncher] Found app match: ${app.name}`);
          // Use the app name instead of bundle ID
          await execAsync(`open -a "${app.name}"`);
          
          // Update usage stats
          app.usageCount++;
          app.lastUsed = new Date();
          
          Logger.success(`✅ [AppLauncher] Successfully opened ${app.name}`);
          return true;
        } catch (appError) {
          Logger.error(`❌ [AppLauncher] Failed to open ${app.name}:`, appError);
        }
      }
      
      // Final fallback - try common variations
      const variations = this.getAppNameVariations(appName);
      for (const variation of variations) {
        try {
          await execAsync(`open -a "${variation}"`);
          Logger.success(`✅ [AppLauncher] Successfully opened ${variation} (variation)`);
          return true;
        } catch (variationError) {
          Logger.debug(`🔄 [AppLauncher] Variation ${variation} failed`);
        }
      }
      
      // Special web fallbacks for communication apps
      if (appName.toLowerCase().includes('whatsapp')) {
        Logger.info('🌐 [AppLauncher] WhatsApp not found, opening web version');
        try {
          await shell.openExternal('https://web.whatsapp.com');
          Logger.success('✅ [AppLauncher] Opened WhatsApp Web instead');
          return true;
        } catch (webError) {
          Logger.error('❌ [AppLauncher] WhatsApp Web fallback failed:', webError);
        }
      }
      
      if (appName.toLowerCase().includes('telegram')) {
        Logger.info('🌐 [AppLauncher] Telegram not found, opening web version');
        try {
          await shell.openExternal('https://web.telegram.org');
          Logger.success('✅ [AppLauncher] Opened Telegram Web instead');
          return true;
        } catch (webError) {
          Logger.error('❌ [AppLauncher] Telegram Web fallback failed:', webError);
        }
      }
      
      Logger.error(`❌ [AppLauncher] App not found: ${appName}`, error);
      return false;
    }
  }

  /**
   * Get common variations of app names for fallback
   */
  private getAppNameVariations(appName: string): string[] {
    const lowerName = appName.toLowerCase();
    const variations: string[] = [];
    
    // Common app name variations
    const commonVariations: { [key: string]: string[] } = {
      'google chrome': ['Chrome', 'GoogleChrome'],
      'chrome': ['Google Chrome', 'GoogleChrome'],
      'safari': ['Safari'],
      'firefox': ['Firefox', 'Firefox Developer Edition'],
      'microsoft edge': ['Microsoft Edge', 'Edge'],
      'edge': ['Microsoft Edge'],
      'zoom': ['zoom.us', 'Zoom'],
      'notes': ['Notes'],
      'mail': ['Mail'],
      'apple mail': ['Mail'],
      'spotify': ['Spotify'],
      'discord': ['Discord'],
      'slack': ['Slack'],
      'whatsapp': ['WhatsApp', 'WhatsApp Desktop']
    };
    
    const mappedVariations = commonVariations[lowerName];
    if (mappedVariations) {
      variations.push(...mappedVariations);
    }
    
    // Add the original name if not already included
    if (!variations.includes(appName)) {
      variations.unshift(appName);
    }
    
    return variations;
  }

  /**
   * Open a website in default browser
   */
  private async openWebsite(website: string): Promise<boolean> {
    try {
      await shell.openExternal(website);
      Logger.success(`✅ Opened ${website}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to open website ${website}:`, error);
      return false;
    }
  }

  /**
   * Perform web search on specified platform
   */
  private async performWebSearch(query: string, searchEngine: string): Promise<boolean> {
    const encodedQuery = encodeURIComponent(query);
    let searchUrl: string;

    switch (searchEngine) {
      case 'youtube':
        searchUrl = `https://www.youtube.com/results?search_query=${encodedQuery}`;
        break;
      case 'spotify':
        searchUrl = `https://open.spotify.com/search/${encodedQuery}`;
        break;
      case 'amazon':
        searchUrl = `https://www.amazon.com/s?k=${encodedQuery}`;
        break;
      default:
        searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
    }

    try {
      await shell.openExternal(searchUrl);
      Logger.success(`✅ Searching for "${query}" on ${searchEngine}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to perform search:`, error);
      return false;
    }
  }

  /**
   * Get usage statistics for learning user preferences
   */
  public getUsageStats(): Array<{name: string, usageCount: number, lastUsed?: Date}> {
    return Array.from(this.installedApps.values())
      .filter(app => app.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount)
      .map(app => ({
        name: app.name,
        usageCount: app.usageCount,
        lastUsed: app.lastUsed
      }));
  }

  /**
   * Get list of installed apps for autocomplete/suggestions
   */
  public getInstalledApps(): string[] {
    return Array.from(this.installedApps.values()).map(app => app.name);
  }
}

// Export singleton instance (will be initialized with OpenAI key when available)
export const appLauncherService = new AppLauncherService();
