import { globalShortcut, BrowserWindow } from 'electron';
import { Logger } from '../core/logger';
import { WindowManager } from './window-manager';
import { AppState } from './app-state';

export class ShortcutService {
  private static instance: ShortcutService;
  private windowManager: WindowManager;
  private appState: AppState;
  private registeredShortcuts: Set<string> = new Set();
  
  private constructor() {
    this.windowManager = WindowManager.getInstance();
    this.appState = AppState.getInstance();
  }
  
  public static getInstance(): ShortcutService {
    if (!ShortcutService.instance) {
      ShortcutService.instance = new ShortcutService();
    }
    return ShortcutService.instance;
  }
  
  public registerGlobalShortcuts(): void {
    try {
      // Dashboard shortcut
      this.registerShortcut('CommandOrControl+Option+J', () => {
        const dashboardWindow = this.windowManager.getWindow('dashboard');
        if (dashboardWindow) {
          if (dashboardWindow.isMinimized()) {
            dashboardWindow.restore();
          }
          dashboardWindow.show();
          dashboardWindow.focus();
        }
      }, 'Dashboard shortcut');
      
      // Dev tools shortcut (development only)
      if (process.env.NODE_ENV === 'development') {
        this.registerShortcut('CommandOrControl+Shift+I', () => {
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (focusedWindow) {
            focusedWindow.webContents.toggleDevTools();
          }
        }, 'Dev tools shortcut');
      }
      
      Logger.success('✅ [Shortcuts] Global shortcuts configured successfully');
    } catch (error) {
      Logger.error('❌ [Shortcuts] Failed to register global shortcuts:', error);
    }
  }
  
  private registerShortcut(accelerator: string, callback: () => void, description: string): void {
    try {
      const ret = globalShortcut.register(accelerator, callback);
      
      if (ret) {
        this.registeredShortcuts.add(accelerator);
        Logger.success(`✅ ${description} registered successfully: ${accelerator}`);
      } else {
        Logger.error(`❌ Failed to register ${description}: ${accelerator}`);
      }
    } catch (error) {
      Logger.error(`❌ Error registering ${description}:`, error);
    }
  }
  
  public unregisterAllShortcuts(): void {
    try {
      this.registeredShortcuts.forEach(accelerator => {
        globalShortcut.unregister(accelerator);
      });
      this.registeredShortcuts.clear();
      Logger.info('⚙ [Shortcuts] All shortcuts unregistered');
    } catch (error) {
      Logger.error('❌ [Shortcuts] Failed to unregister shortcuts:', error);
    }
  }
  
  public isRegistered(accelerator: string): boolean {
    return globalShortcut.isRegistered(accelerator);
  }
}
