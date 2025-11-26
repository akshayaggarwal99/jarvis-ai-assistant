import { app, BrowserWindow } from 'electron';
import { Logger } from '../core/logger';
import { WindowManager } from './window-manager';
import { AppState } from './app-state';
import { ShortcutService } from './shortcut-service';
import { AuthService } from './auth-service';

export class AppLifecycleService {
  private static instance: AppLifecycleService;
  private windowManager: WindowManager;
  private appState: AppState;
  private shortcutService: ShortcutService;
  private authService: AuthService;
  private hotkeyStopCallback: (() => void) | null = null;
  
  private constructor() {
    this.windowManager = WindowManager.getInstance();
    this.appState = AppState.getInstance();
    this.shortcutService = ShortcutService.getInstance();
    this.authService = AuthService.getInstance();
  }
  
  public static getInstance(): AppLifecycleService {
    if (!AppLifecycleService.instance) {
      AppLifecycleService.instance = new AppLifecycleService();
    }
    return AppLifecycleService.instance;
  }
  
  public setHotkeyStopCallback(callback: () => void): void {
    this.hotkeyStopCallback = callback;
  }
  
  public registerLifecycleHandlers(): void {
    // Window all closed handler
    app.on('window-all-closed', () => {
      Logger.info('All windows closed, but keeping app running in menu bar');
      // Don't quit on macOS - app should stay in menu bar
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    
    // Before quit handler
    app.on('before-quit', async () => {
      Logger.info('[Lifecycle] App is quitting...');
      
      // Unregister global shortcuts
      this.shortcutService.unregisterAllShortcuts();
      
      // Stop hotkey monitoring
      if (this.hotkeyStopCallback) {
        this.hotkeyStopCallback();
      }
      
      // Auth state is saved automatically when it changes
      
      // Close all windows
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(window => {
        try {
          window.destroy();
        } catch (error) {
          Logger.error('[Lifecycle] Error destroying window:', error);
        }
      });
    });
    
    // Will quit handler
    app.on('will-quit', () => {
      Logger.info('[Lifecycle] Will quit - final cleanup');
      
      // Ensure shortcuts are unregistered
      this.shortcutService.unregisterAllShortcuts();
      
      // Stop hotkey monitoring
      if (this.hotkeyStopCallback) {
        this.hotkeyStopCallback();
      }
    });
    
    // Activate handler (macOS)
    app.on('activate', () => {
      Logger.info('[Lifecycle] App activated');
      
      // On macOS, re-create window when dock icon is clicked
      if (process.platform === 'darwin') {
        const dashboardWindow = this.windowManager.getWindow('dashboard');
        if (!dashboardWindow) {
          // Emit event to create dashboard
          this.windowManager.sendToAllWindows('create-dashboard-window');
        } else {
          dashboardWindow.show();
        }
      }
    });
    
    Logger.info('✅ [Lifecycle] App lifecycle handlers registered');
  }
}
