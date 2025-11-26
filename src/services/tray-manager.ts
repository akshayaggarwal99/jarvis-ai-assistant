import { app, Tray, Menu, nativeImage, nativeTheme, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';
import { WindowManager } from './window-manager';
import { UpdateService } from './update-service';
import { AudioProcessor } from '../audio/processor';

export class TrayManager {
  private static instance: TrayManager;
  private tray: Tray | null = null;
  private windowManager: WindowManager;
  private updateService: UpdateService;
  
  private constructor() {
    this.windowManager = WindowManager.getInstance();
    this.updateService = new UpdateService();
  }
  
  static getInstance(): TrayManager {
    if (!TrayManager.instance) {
      TrayManager.instance = new TrayManager();
    }
    return TrayManager.instance;
  }
  
  initialize(): void {
    this.createMenuBarTray();
    
    // Listen for theme changes
    nativeTheme.on('updated', () => {
      Logger.info('🎨 [Theme] Theme changed, updating tray icon');
      this.updateTrayIcon();
    });
  }
  
  private updateTrayIcon(): void {
    const isDarkMode = nativeTheme.shouldUseDarkColors;
    
    let iconPath: string;
    let useTemplate = false;
    
    if (process.platform === 'darwin') {
      // On macOS, try to use a single template icon that adapts automatically
      const templateIconName = 'jarvis-menubar-template.png';
      
      if (app.isPackaged) {
        iconPath = path.join(process.resourcesPath, templateIconName);
      } else {
        iconPath = path.join(__dirname, '../../assets', templateIconName);
      }
      
      // If template icon doesn't exist, fall back to theme-specific icons
      if (!fs.existsSync(iconPath)) {
        const iconName = isDarkMode ? 'jarvis-logo-light.png' : 'jarvis-logo-dark.png';
        
        if (app.isPackaged) {
          iconPath = path.join(process.resourcesPath, iconName);
        } else {
          iconPath = path.join(__dirname, '../../assets', iconName);
        }
        Logger.debug(`🎨 [Tray] Using theme-specific icon: ${iconPath}`);
      } else {
        useTemplate = true;
        Logger.debug(`🎨 [Tray] Using template icon: ${iconPath}`);
      }
    } else {
      // Non-macOS: use theme-specific icons
      const iconName = isDarkMode ? 'jarvis-logo-light.png' : 'jarvis-logo-dark.png';
      
      if (app.isPackaged) {
        iconPath = path.join(process.resourcesPath, iconName);
      } else {
        iconPath = path.join(__dirname, '../../assets', iconName);
      }
      Logger.debug(`🎨 [Tray] Platform-specific icon: ${iconPath}`);
    }
    
    // Fallback to default icon if theme-specific icon doesn't exist
    if (!fs.existsSync(iconPath)) {
      const fallbackIconName = 'jarvis-logo.png';
      if (app.isPackaged) {
        iconPath = path.join(process.resourcesPath, fallbackIconName);
      } else {
        iconPath = path.join(__dirname, '../../assets', fallbackIconName);
      }
      useTemplate = false;
      Logger.warning(`▲ [Tray] Theme icon not found, using fallback: ${iconPath}`);
    }
    
    if (!fs.existsSync(iconPath)) {
      Logger.error(`❌ [Tray] Icon not found: ${iconPath}`);
      return;
    }
    
    const iconImage = nativeImage.createFromPath(iconPath);
    if (iconImage.isEmpty()) {
      Logger.error('❌ [Tray] Failed to create image from path:', iconPath);
      return;
    }
    
    // Resize for menu bar (22x22 for better visibility on macOS)
    const resizedIcon = iconImage.resize({ width: 22, height: 22 });
    
    // Set template mode for automatic theme adaptation on macOS
    if (useTemplate && process.platform === 'darwin') {
      resizedIcon.setTemplateImage(true);
      Logger.debug('🎨 [Tray] Template image mode enabled');
    }
    
    if (!this.tray) {
      this.tray = new Tray(resizedIcon);
      Logger.success('✅ [Tray] Tray icon created successfully');
    } else {
      this.tray.setImage(resizedIcon);
      Logger.success(`✅ [Tray] Tray icon updated for ${isDarkMode ? 'dark' : 'light'} theme${useTemplate ? ' (template mode)' : ''}`);
    }
  }
  
  private createMenuBarTray(): void {
    try {
      this.updateTrayIcon();
      
      if (!this.tray) {
        Logger.error('❌ [Menu Bar] Failed to create tray icon');
        return;
      }
      
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Jarvis - AI Voice Assistant',
          enabled: false
        },
        {
          type: 'separator'
        },
        {
          label: 'Open Dashboard',
          click: () => {
            const dashboard = this.windowManager.getWindow('dashboard');
            if (dashboard) {
              dashboard.show();
              dashboard.focus();
            } else {
              this.windowManager.createDashboardWindow();
            }
          }
        },
        {
          label: 'Check for Updates...',
          click: async () => {
            try {
              Logger.info('🔄 [Tray Menu] Checking for updates...');
              const result = await this.updateService.forceCheckForUpdates();
              Logger.info('✅ [Tray Menu] Update check completed:', result);
            } catch (error) {
              Logger.error('❌ [Tray Menu] Update check failed:', error);
            }
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Paste Last Transcription',
          click: async () => {
            const lastTranscription = (global as any).lastTranscription;
            if (lastTranscription?.trim()) {
              try {
                await AudioProcessor.pasteText(lastTranscription);
              } catch (error) {
                Logger.error('Menu paste failed:', error);
              }
            } else {
              Logger.warning('No transcription to paste');
            }
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Refresh Permissions',
          click: () => {
            try {
              AudioProcessor.forcePermissionRefresh();
              Logger.info('Permission cache manually refreshed');
            } catch (error) {
              Logger.error('Failed to refresh permissions:', error);
            }
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Quit Jarvis',
          click: () => {
            app.quit();
          }
        }
      ]);
      
      this.tray.setToolTip('Jarvis - AI Voice Assistant');
      this.tray.setContextMenu(contextMenu);
      
      // Double-click to open dashboard
      this.tray.on('double-click', () => {
        const dashboard = this.windowManager.getWindow('dashboard');
        if (dashboard) {
          dashboard.show();
          dashboard.focus();
        } else {
          this.windowManager.createDashboardWindow();
        }
      });
      
      Logger.success('✅ [Menu Bar] Tray setup completed successfully');
    } catch (error) {
      Logger.error('❌ [Menu Bar] Failed to create tray icon:', error);
    }
  }
  
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
