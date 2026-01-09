import { Menu, app, shell, BrowserWindow, Tray, nativeImage, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';
import { WindowManager } from './window-manager';
import { UpdateService } from './update-service';

export class MenuService {
  private static instance: MenuService;
  private tray: Tray | null = null;
  private windowManager: WindowManager;
  private updateService: UpdateService | null = null;

  private constructor() {
    this.windowManager = WindowManager.getInstance();
  }
  
  public static getInstance(): MenuService {
    if (!MenuService.instance) {
      MenuService.instance = new MenuService();
    }
    return MenuService.instance;
  }
  
  public setUpdateService(updateService: UpdateService): void {
    this.updateService = updateService;
  }
  
  public createApplicationMenu(): void {
    const template: any[] = [
      {
        label: 'Jarvis',
        submenu: [
          {
            label: 'About Jarvis',
            click: () => {
              const dashboardWindow = this.windowManager.getWindow('dashboard');
              if (dashboardWindow) {
                dashboardWindow.show();
                dashboardWindow.focus();
                dashboardWindow.webContents.send('navigate-to', '/about');
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Check for Updates...',
            click: async () => {
              if (this.updateService) {
                try {
                  Logger.info('🔄 [Menu] Checking for updates...');
                  const result = await this.updateService.forceCheckForUpdates();
                  Logger.info('✅ [Menu] Update check completed:', result);
                } catch (error) {
                  Logger.error('❌ [Menu] Update check failed:', error);
                }
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Settings',
            accelerator: 'Cmd+,',
            click: () => {
              const dashboardWindow = this.windowManager.getWindow('dashboard');
              if (dashboardWindow) {
                dashboardWindow.show();
                dashboardWindow.focus();
                dashboardWindow.webContents.send('navigate-to', '/settings');
              }
            }
          },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Learn More',
            click: () => { shell.openExternal('https://www.jarvis.cx') }
          }
        ]
      }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    Logger.info('✅ ✅ [Application Menu] Menu created successfully');
  }
  
  public createTray(): void {
    try {
      this.updateTrayIcon();
      
      // Listen for theme changes and update icon
      nativeTheme.on('updated', () => {
        Logger.info('🎨 [Theme] Theme changed, updating tray icon');
        this.updateTrayIcon();
      });
      
      this.updateTrayMenu();
      
      // Set tooltip
      this.tray.setToolTip('Jarvis - AI Voice Assistant');
      
      // Handle click events
      this.tray.on('click', () => {
        const dashboardWindow = this.windowManager.getWindow('dashboard');
        if (dashboardWindow) {
          if (dashboardWindow.isVisible()) {
            dashboardWindow.hide();
          } else {
            dashboardWindow.show();
            dashboardWindow.focus();
          }
        }
      });
      
      // Double-click to open dashboard
      this.tray.on('double-click', () => {
        const dashboardWindow = this.windowManager.getWindow('dashboard');
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
          dashboardWindow.show();
          dashboardWindow.focus();
        } else {
          // Create dashboard window directly using WindowManager
          const newDashboardWindow = this.windowManager.createDashboardWindow();
          newDashboardWindow.show();
          newDashboardWindow.focus();
        }
      });
      
      Logger.info('✅ ✅ [Menu Bar] Tray setup completed successfully');
    } catch (error) {
      Logger.error('Failed to create tray:', error);
    }
  }
  
  private getTrayIconPath(): string {
    let iconPath: string;
    
    if (process.platform === 'darwin') {
      // Always use the template icon on macOS for proper dark/light mode support
      iconPath = path.join(__dirname, '..', 'assets', 'jarvis-menubar-template.png');
      Logger.debug(`🎨 [Tray] Using template icon: ${iconPath}`);
    } else {
      // For Windows/Linux, use theme-specific icons
      const isDarkMode = nativeTheme.shouldUseDarkColors;
      iconPath = path.join(
        __dirname, 
        '..', 
        'assets', 
        isDarkMode ? 'jarvis-menubar-light.png' : 'jarvis-menubar-dark.png'
      );
      Logger.debug(`🎨 [Tray] Platform-specific icon: ${iconPath}`);
    }
    
    return iconPath;
  }
  
  public updateTrayMenu(): void {
    if (!this.tray) return;
    
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
          const dashboardWindow = this.windowManager.getWindow('dashboard');
          if (dashboardWindow && !dashboardWindow.isDestroyed()) {
            dashboardWindow.show();
            dashboardWindow.focus();
          } else {
            // Create dashboard window directly using WindowManager
            const newDashboardWindow = this.windowManager.createDashboardWindow();
            newDashboardWindow.show();
            newDashboardWindow.focus();
          }
        }
      },
      {
        label: 'Check for Updates...',
        click: async () => {
          if (this.updateService) {
            try {
              Logger.info('🔄 [Tray Menu] Checking for updates...');
              const result = await this.updateService.forceCheckForUpdates();
              Logger.info('✅ [Tray Menu] Update check completed:', result);
            } catch (error) {
              Logger.error('❌ [Tray Menu] Update check failed:', error);
            }
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
              // Need to import AudioProcessor or use IPC
              const { AudioProcessor } = require('../audio/processor');
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
            const { AudioProcessor } = require('../audio/processor');
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
    
    this.tray.setContextMenu(contextMenu);
  }
  
  public updateTrayIcon(): void {
    const isDarkMode = nativeTheme.shouldUseDarkColors;

    // 🔧 IMPROVED: Use template icon for automatic theme adaptation on macOS
    let iconPath: string;
    let useTemplate = false;

    if (process.platform === 'darwin') {
      // On macOS, try to use a single template icon that adapts automatically
      const templateIconName = 'jarvis-menubar-template.png';

      if (app.isPackaged) {
        iconPath = path.join(process.resourcesPath, templateIconName);
      } else {
        // In dev mode, icons are copied to dist/ directory (same as __dirname for webpack bundle)
        iconPath = path.join(__dirname, templateIconName);
      }

      // If template icon doesn't exist, fall back to theme-specific icons
      if (!fs.existsSync(iconPath)) {
        const iconName = isDarkMode ? 'jarvis-logo-light.png' : 'jarvis-logo-dark.png';

        if (app.isPackaged) {
          iconPath = path.join(process.resourcesPath, iconName);
        } else {
          iconPath = path.join(__dirname, iconName);
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
        iconPath = path.join(__dirname, iconName);
      }
      Logger.debug(`🎨 [Tray] Platform-specific icon: ${iconPath}`);
    }

    // Fallback to default icon if theme-specific icon doesn't exist
    if (!fs.existsSync(iconPath)) {
      const fallbackIconName = 'jarvis-logo.png';
      if (app.isPackaged) {
        iconPath = path.join(process.resourcesPath, fallbackIconName);
      } else {
        iconPath = path.join(__dirname, fallbackIconName);
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
  
  public getTray(): Tray | null {
    return this.tray;
  }
}
