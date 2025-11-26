import { app, Menu } from 'electron';
import { Logger } from './logger';
import { SecureAPIService } from '../services/secure-api-service';
import { JarvisCore } from './jarvis-core';
import { agentManager } from './agent-manager';
import { AuthService } from '../services/auth-service';
import { WindowManager } from '../services/window-manager';
import { TrayManager } from '../services/tray-manager';
import { UpdateService } from '../services/update-service';
import { UserNudgeService } from '../services/user-nudge-service';
import { OnboardingManager } from '../services/onboarding-manager';
import { IPCHandlers } from '../ipc/ipc-handlers';
import { OptimizedAnalyticsManager } from '../analytics/optimized-analytics-manager';

export class AppInitializer {
  private static instance: AppInitializer;
  
  private jarvisCore: JarvisCore | null = null;
  private authService: AuthService;
  private windowManager: WindowManager;
  private trayManager: TrayManager;
  private updateService: UpdateService;
  private userNudgeService: UserNudgeService | null = null;
  private onboardingManager: OnboardingManager;
  private ipcHandlers: IPCHandlers;
  private analyticsManager: OptimizedAnalyticsManager;
  
  private constructor() {
    this.authService = AuthService.getInstance();
    this.windowManager = WindowManager.getInstance();
    this.trayManager = TrayManager.getInstance();
    this.updateService = new UpdateService();
    this.onboardingManager = OnboardingManager.getInstance();
    this.ipcHandlers = IPCHandlers.getInstance();
    this.analyticsManager = new OptimizedAnalyticsManager();
  }
  
  static getInstance(): AppInitializer {
    if (!AppInitializer.instance) {
      AppInitializer.instance = new AppInitializer();
    }
    return AppInitializer.instance;
  }
  
  async initialize(): Promise<void> {
    try {
      // IPC handlers already registered in main.ts at module initialization
      // Just ensure analytics manager is set
      this.ipcHandlers.setAnalyticsManager(this.analyticsManager);
      
      // Create application menu
      this.createApplicationMenu();
      
      // Initialize tray
      this.trayManager.initialize();
      
      // Create main dashboard window
      const dashboardWindow = this.windowManager.createDashboardWindow();
      this.updateService.setMainWindow(dashboardWindow);
      
      // Check for saved auth state
      const savedAuthState = this.authService.loadAuthState();
      if (savedAuthState) {
        await this.handleAuthRestore(savedAuthState);
      }
      
      Logger.success('✅ [App] Application initialized successfully');
    } catch (error) {
      Logger.error('❌ [App] Failed to initialize application:', error);
      throw error;
    }
  }
  
  async initializeJarvisCore(): Promise<JarvisCore | null> {
    try {
      if (this.jarvisCore) {
        return this.jarvisCore;
      }
      
      // Initialize secure API service
      const secureAPI = SecureAPIService.getInstance();
      
      // Get API keys securely
      const openaiKey = await secureAPI.getOpenAIKey();
      let geminiKey = '';
      let anthropicKey = '';
      
      try {
        geminiKey = await secureAPI.getGeminiKey();
      } catch (error) {
        Logger.warning('GEMINI_API_KEY not available - some features may be limited');
      }
      
      try {
        anthropicKey = await secureAPI.getAnthropicKey();
      } catch (error) {
        Logger.warning('ANTHROPIC_API_KEY not available - some features may be limited');
      }
      
      // Initialize Jarvis Core
      this.jarvisCore = new JarvisCore(openaiKey, geminiKey, anthropicKey);
      await this.jarvisCore.initialize();
      Logger.success('Jarvis Core initialized successfully');
      
      // Initialize persistent agent
      try {
        await agentManager.initialize(openaiKey, geminiKey);
        Logger.success('★ Jarvis Agent initialized and ready for live interactions');
      } catch (error) {
        Logger.warning('▲ Failed to initialize Jarvis Agent - will fallback to on-demand creation:', error);
      }
      
      // Initialize nudge service
      if (!this.userNudgeService) {
        this.userNudgeService = UserNudgeService.getInstance();
        Logger.info('◉ [Nudge] User nudge service initialized');
      }
      
      return this.jarvisCore;
    } catch (error) {
      Logger.error('Failed to initialize Jarvis Core:', error);
      return null;
    }
  }
  
  private async handleAuthRestore(authState: any): Promise<void> {
    Logger.info('⟲ [Startup] Restoring auth state:', authState.uid);
    
    // Set Firebase ID token if available
    if (authState.idToken) {
      const secureAPI = SecureAPIService.getInstance();
      secureAPI.setAuthToken(authState.idToken);
      Logger.info('🔐 [Startup] Restored Firebase ID token');
    }
    
    // Set user ID in analytics
    await this.analyticsManager.setUserId(authState.uid);
    Logger.info('● [Startup] Restored user ID in analytics');
    
    // Pre-load analytics data
    await this.analyticsManager.getStats();
    Logger.info('● [Startup] Analytics data pre-loaded');
    
    // Send auth state to dashboard
    const dashboardWindow = this.windowManager.getWindow('dashboard');
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('auth:restore', authState);
      Logger.info('📤 [Startup] Sent auth state to renderer');
    }
    
    // Check if onboarding is completed
    if (this.onboardingManager.hasCompletedOnboarding()) {
      Logger.info('🚀 [Startup] Auth restored and onboarding completed');
      // Activation of overlays would be handled elsewhere
    }
  }
  
  private createApplicationMenu(): void {
    try {
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: 'Jarvis',
          submenu: [
            {
              label: 'About Jarvis',
              role: 'about' as const
            },
            {
              type: 'separator' as const
            },
            {
              label: 'Check for Updates...',
              click: async () => {
                try {
                  Logger.info('🔄 [Menu] Checking for updates...');
                  const result = await this.updateService.forceCheckForUpdates();
                  Logger.info('✅ [Menu] Update check completed:', result);
                } catch (error) {
                  Logger.error('❌ [Menu] Update check failed:', error);
                }
              }
            },
            {
              type: 'separator' as const
            },
            {
              label: 'Hide Jarvis',
              accelerator: 'Command+H',
              role: 'hide' as const
            },
            {
              label: 'Hide Others',
              accelerator: 'Command+Shift+H',
              role: 'hideOthers' as const
            },
            {
              label: 'Show All',
              role: 'unhide' as const
            },
            {
              type: 'separator' as const
            },
            {
              label: 'Quit',
              accelerator: 'Command+Q',
              click: () => {
                app.quit();
              }
            }
          ]
        },
        {
          label: 'Edit',
          submenu: [
            {
              label: 'Undo',
              accelerator: 'CmdOrCtrl+Z',
              role: 'undo' as const
            },
            {
              label: 'Redo',
              accelerator: 'Shift+CmdOrCtrl+Z',
              role: 'redo' as const
            },
            {
              type: 'separator' as const
            },
            {
              label: 'Cut',
              accelerator: 'CmdOrCtrl+X',
              role: 'cut' as const
            },
            {
              label: 'Copy',
              accelerator: 'CmdOrCtrl+C',
              role: 'copy' as const
            },
            {
              label: 'Paste',
              accelerator: 'CmdOrCtrl+V',
              role: 'paste' as const
            }
          ]
        },
        {
          label: 'Window',
          submenu: [
            {
              label: 'Minimize',
              accelerator: 'CmdOrCtrl+M',
              role: 'minimize' as const
            },
            {
              label: 'Close',
              accelerator: 'CmdOrCtrl+W',
              role: 'close' as const
            }
          ]
        }
      ];
      
      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
      
      Logger.success('✅ [Application Menu] Menu created successfully');
    } catch (error) {
      Logger.error('❌ [Application Menu] Failed to create menu:', error);
    }
  }
  
  getJarvisCore(): JarvisCore | null {
    return this.jarvisCore;
  }
  
  getAnalyticsManager(): OptimizedAnalyticsManager {
    return this.analyticsManager;
  }
  
  getUserNudgeService(): UserNudgeService | null {
    return this.userNudgeService;
  }
}
