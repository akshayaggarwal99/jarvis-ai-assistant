import { AppContext } from '../interfaces/transcription';

export class ContextDetector {
  private contextCache: AppContext | null = null;
  private lastCacheTime = 0;
  private cacheValidityMs = 2000; // Extended cache for better performance in tutorial mode

  detectContext(): AppContext {
    // Return cached context if recent (performance optimization)
    const now = Date.now();
    if (this.contextCache && (now - this.lastCacheTime) < this.cacheValidityMs) {
      return this.contextCache;
    }

    // Check if in tutorial mode first - skip expensive operations
    const isVoiceTutorialMode = (global as any).isVoiceTutorialMode;
    const isEmailTutorialMode = (global as any).isEmailTutorialMode;
    
    if (isVoiceTutorialMode && isEmailTutorialMode) {
      // Return cached email context for tutorial mode
      const tutorialContext = {
        activeApp: 'jarvis-email-tutorial',
        windowTitle: 'Email Tutorial',
        type: 'email' as const
      };
      this.contextCache = tutorialContext;
      this.lastCacheTime = now;
      return tutorialContext;
    }

    try {
      const { execSync } = require('child_process');
      let activeApp = '';
      let windowTitle = '';
      
      // Get active application with timeout to avoid hanging
      try {
        activeApp = execSync(
          'osascript -e "tell application \\"System Events\\" to get name of first application process whose frontmost is true"', 
          { encoding: 'utf8', timeout: 300 } // Further reduced for snappier UX
        ).trim().toLowerCase();
      } catch (error) {
        activeApp = '';
      }
      
      // Skip window title if we already have enough context from app name
      if (this.isDefinitiveApp(activeApp)) {
        const context = {
          activeApp,
          windowTitle: '',
          type: this.determineContextType(activeApp, '')
        };
        this.contextCache = context;
        this.lastCacheTime = now;
        return context;
      }
      
      // Get window title only if needed - optimized
      try {
        windowTitle = execSync(
          'osascript -e "tell application \\"System Events\\" to get title of front window of (first application process whose frontmost is true)"', 
          { encoding: 'utf8', timeout: 250 } // Further reduced for snappier performance
        ).trim().toLowerCase();
      } catch {
        windowTitle = '';
      }
      
      const context = {
        activeApp,
        windowTitle,
        type: this.determineContextType(activeApp, windowTitle)
      };
      
      this.contextCache = context;
      this.lastCacheTime = now;
      return context;
    } catch (error) {
      const defaultContext = {
        activeApp: '',
        windowTitle: '',
        type: 'default' as const
      };
      this.contextCache = defaultContext;
      this.lastCacheTime = now;
      return defaultContext;
    }
  }

  /**
   * Clear context cache to force fresh detection
   */
  clearCache(): void {
    this.contextCache = null;
    this.lastCacheTime = 0;
  }

  private isDefinitiveApp(activeApp: string): boolean {
    const definitiveApps = [
      // Email apps
      'mail', 'outlook', 'thunderbird', 'airmail', 'spark', 'canary mail',
      // Communication apps
      'slack', 'teams', 'zoom', 'discord', 'telegram',
      // Development apps  
      'code', 'xcode', 'atom', 'sublime', 'webstorm', 'intellij', 'cursor', 'windsurf', 'pycharm', 'rubymine', 'phpstorm', 'goland', 'clion', 'rider', 'vim', 'emacs', 'neovim',
      // Document apps
      'word', 'pages', 'notion', 'obsidian', 'typora'
    ];
    
    return definitiveApps.some(app => activeApp.includes(app));
  }
  
  private determineContextType(activeApp: string, windowTitle: string): AppContext['type'] {
    // Normalize inputs for better matching
    const app = activeApp.toLowerCase();
    const title = windowTitle.toLowerCase();
    
    // Email contexts - comprehensive detection for all providers
    const emailApps = ['mail', 'outlook', 'thunderbird', 'airmail', 'spark', 'canary mail'];
    const emailWindowPatterns = [
      // Generic email terms
      'mail', 'email', 'inbox', 'compose', 'draft', 'message', 'reply', 'forward',
      // Gmail variations
      'gmail', 'google mail', 'g-mail',
      // Outlook variations  
      'outlook', 'hotmail', 'live.com', 'office 365', 'o365',
      // Yahoo variations
      'yahoo mail', 'yahoo.com', 'ymail',
      // Other providers
      'icloud mail', 'apple mail', 'protonmail', 'zoho mail', 'fastmail',
      // Corporate email
      'exchange', 'office.com', 'teams mail',
      // Email actions/states
      'new message', 'send', 'sent', 'received', 'unread', 'thread'
    ];
    
    const isEmailApp = emailApps.some(emailApp => app.includes(emailApp));
    const isEmailWindow = emailWindowPatterns.some(pattern => title.includes(pattern));
    
    if (isEmailApp || isEmailWindow) {
      // Debug log for email detection
      console.log(`📧 Email context detected: app="${app}", title="${title}", emailApp=${isEmailApp}, emailWindow=${isEmailWindow}`);
      return 'email';
    }
    
    // Messaging contexts - expanded
    const messagingApps = ['slack', 'teams', 'zoom', 'discord', 'telegram', 'whatsapp', 'signal'];
    const messagingPatterns = ['chat', 'meeting', 'call', 'conversation', 'dm', 'channel'];
    if (messagingApps.some(msgApp => app.includes(msgApp)) || 
        messagingPatterns.some(pattern => title.includes(pattern))) {
      return 'messaging';
    }
    
    // Document contexts - expanded
    const documentApps = ['word', 'pages', 'notion', 'obsidian', 'typora', 'google docs', 'docs'];
    const documentPatterns = ['document', 'doc', 'note', 'write', 'edit', 'draft'];
    if (documentApps.some(docApp => app.includes(docApp)) || 
        documentPatterns.some(pattern => title.includes(pattern))) {
      return 'document';
    }
    
    // Code contexts - expanded with better Electron app detection
    const codeApps = ['code', 'xcode', 'atom', 'sublime', 'webstorm', 'intellij', 'cursor', 'windsurf', 'pycharm', 'rubymine', 'phpstorm', 'goland', 'clion', 'rider', 'vim', 'emacs', 'neovim'];
    const codePatterns = ['github', 'gitlab', 'bitbucket', 'repository', 'commit', 'pull request', 'merge'];
    
    // Special handling for Electron-based editors (VS Code, Cursor, etc.)
    const electronCodePatterns = [
      '.ts', '.js', '.py', '.java', '.cpp', '.c', '.h', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.sh', '.sql', '.html', '.css', '.scss', '.sass', '.less', '.xml', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
      'main.ts', 'index.js', 'app.py', 'package.json', 'tsconfig.json', 'webpack.config', 'dockerfile', 'makefile',
      '— jarvis', '— cursor', '— code', '— windsurf', // Common editor title suffixes
      'src/', 'lib/', 'components/', 'services/', 'utils/', 'helpers/', 'models/', 'controllers/', 'views/',
      'dictation-recorder.ts', // Specific file patterns that indicate code context
      '(index)', // VS Code tab indicators
      'visual studio code', 'vs code' // Additional VS Code identifiers
    ];
    
    const isCodeApp = codeApps.some(codeApp => app.includes(codeApp));
    const isCodeWindow = codePatterns.some(pattern => title.includes(pattern));
    const isElectronCodeEditor = app === 'electron' && electronCodePatterns.some(pattern => title.includes(pattern));
    
    if (isCodeApp || isCodeWindow || isElectronCodeEditor) {
      console.log(`💻 Code context detected: app="${app}", title="${title}", codeApp=${isCodeApp}, codeWindow=${isCodeWindow}, electronCode=${isElectronCodeEditor}`);
      return 'code';
    }
    
    // Debug log for default case
    console.log(`🔍 Default context: app="${app}", title="${title}"`);
    return 'default';
  }
}
