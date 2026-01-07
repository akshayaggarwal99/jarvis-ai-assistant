import { BrowserWindow, screen, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';
import { AppSettingsService } from './app-settings-service';

export type WindowType = 'suggestion' | 'waveform' | 'dashboard' | 'analysisOverlay';

export class WindowManager {
  private static instance: WindowManager;
  private windows: Map<WindowType, BrowserWindow | null> = new Map();
  
  private constructor() {}
  
  static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  // Simple path resolution for HTML files
  private getResourcePath(filename: string): string {
    return path.join(__dirname, filename);
  }
  
  getWindow(type: WindowType): BrowserWindow | null {
    return this.windows.get(type) || null;
  }
  
  createSuggestionWindow(): BrowserWindow {
    const existing = this.windows.get('suggestion');
    if (existing && !existing.isDestroyed()) {
      return existing;
    }
    
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    
    const window = new BrowserWindow({
      width: 350,
      height: 180,
      x: screenWidth - 370,
      y: screenHeight / 2 - 90,
      frame: false,
      alwaysOnTop: true,
      transparent: true,
      resizable: false,
      movable: true,
      show: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    window.loadFile(this.getResourcePath('suggestion.html'));
    window.setVisibleOnAllWorkspaces(true);
    window.setAlwaysOnTop(true, 'floating');
    
    this.windows.set('suggestion', window);
    return window;
  }
  
  createWaveformWindow(): BrowserWindow {
    const existing = this.windows.get('waveform');
    if (existing && !existing.isDestroyed()) {
      return existing;
    }

    // Get the active display (where the cursor is)
    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = activeDisplay.workArea;

    // Window dimensions (sized to fit compact 48x32 bar with small padding)
    const windowWidth = 80;
    const windowHeight = 50;
    const margin = 20; // Margin from screen edge

    // Position in bottom-right corner of active display
    const x = displayX + displayWidth - windowWidth - margin;
    const y = displayY + displayHeight - windowHeight - margin;

    const window = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x,
      y,
      frame: false,
      alwaysOnTop: true,
      transparent: true,
      resizable: false,
      movable: true,
      focusable: false,
      show: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    window.loadFile(this.getResourcePath('waveform.html'));
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setAlwaysOnTop(true, 'screen-saver');

    window.webContents.once('dom-ready', () => {
      const appSettings = AppSettingsService.getInstance();
      const settings = appSettings.getSettings();
      window.webContents.send('audio-feedback-setting', settings.audioFeedback);
    });

    this.windows.set('waveform', window);
    return window;
  }

  /**
   * Reposition waveform window to bottom-right of active monitor
   */
  repositionWaveformWindow(): void {
    const window = this.windows.get('waveform');
    if (!window || window.isDestroyed()) return;

    // Get the active display (where the cursor is)
    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = activeDisplay.workArea;

    // Window dimensions (sized to fit compact 48x32 bar with small padding)
    const windowWidth = 80;
    const windowHeight = 50;
    const margin = 20;

    // Position in bottom-right corner of active display
    const x = displayX + displayWidth - windowWidth - margin;
    const y = displayY + displayHeight - windowHeight - margin;

    window.setPosition(x, y);
  }
  
  createDashboardWindow(): BrowserWindow {
    const existing = this.windows.get('dashboard');
    if (existing && !existing.isDestroyed()) {
      // If window exists and is not destroyed, just show and focus it
      if (!existing.isVisible()) {
        existing.show();
      }
      existing.focus();
      return existing;
    }
    
    // Clean up any destroyed window reference
    if (existing && existing.isDestroyed()) {
      this.windows.delete('dashboard');
    }
    
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    
    const window = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 1200,
      minHeight: 800,
      x: Math.round((screenWidth - 1200) / 2),
      y: Math.round((screenHeight - 800) / 2),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      title: 'Jarvis Dashboard',
      icon: path.join(__dirname, '..', 'assets', 'icon.icns'),
      titleBarStyle: 'hiddenInset',
      movable: true,
      show: false, // Keep hidden until ready
      backgroundColor: '#ffffff', // Set background to prevent white flash
      paintWhenInitiallyHidden: true // Prevent flickering during load
    });
    
    // Load the HTML file
    window.loadFile(this.getResourcePath('dashboard-react.html'));
    
    // Handle window closed event
    window.on('closed', () => {
      this.windows.set('dashboard', null);
    });
    
    // Store the window reference
    this.windows.set('dashboard', window);
    return window;
  }
  
  createAnalysisOverlay(): BrowserWindow | null {
    try {
      Logger.info('◆ Creating analysis overlay window');
      
      const existing = this.windows.get('analysisOverlay');
      if (existing && !existing.isDestroyed()) {
        Logger.info('◆ Closing existing overlay to prevent stacking');
        existing.close();
      }
      
      const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
      
      // Small delay to ensure proper cleanup
      setTimeout(() => {
        const window = new BrowserWindow({
          width: 280,
          height: 80,
          x: Math.round(screenWidth - 300),
          y: 20,
          frame: false,
          alwaysOnTop: true,
          transparent: true,
          resizable: false,
          movable: true,
          show: false,
          skipTaskbar: true,
          hasShadow: true,
          focusable: true,
          acceptFirstMouse: true,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
          }
        });
        
        window.on('closed', () => {
          Logger.info('◌ Analysis overlay closed');
          this.windows.set('analysisOverlay', null);
        });
        
        window.on('ready-to-show', () => {
          Logger.info('● Analysis overlay ready to show');
        });
        
        const overlayPath = this.getResourcePath('analysis-overlay.html');
        Logger.info(`◆ Loading overlay from: ${overlayPath}`);
        
        window.loadFile(overlayPath);
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        window.setAlwaysOnTop(true, 'screen-saver', 1);
        
        this.windows.set('analysisOverlay', window);
        Logger.info('● Analysis overlay created successfully');
      }, 100);
      
      return this.windows.get('analysisOverlay') || null;
    } catch (error) {
      Logger.error('✖ Failed to create analysis overlay:', error);
      return null;
    }
  }
  
  closeWindow(type: WindowType): void {
    console.log(`🔧 [WindowManager] Closing window: ${type}`);
    const window = this.windows.get(type);
    if (window && !window.isDestroyed()) {
      console.log(`🔧 [WindowManager] Window found and not destroyed, closing...`);
      window.close();
      console.log(`🔧 [WindowManager] Window ${type} closed successfully`);
    } else if (window === null) {
      console.log(`🔧 [WindowManager] Window ${type} was already closed and marked as null`);
    } else {
      console.log(`🔧 [WindowManager] Window ${type} not found or already destroyed`);
    }
    this.windows.delete(type);
    console.log(`🔧 [WindowManager] Window ${type} removed from map`);
  }
  
  hideWindow(type: WindowType): void {
    const window = this.windows.get(type);
    if (window && !window.isDestroyed()) {
      window.hide();
    }
  }
  
  showWindow(type: WindowType): void {
    const window = this.windows.get(type);
    if (window && !window.isDestroyed()) {
      window.show();
    }
  }
  
  isWindowDestroyed(type: WindowType): boolean {
    const window = this.windows.get(type);
    return !window || window.isDestroyed();
  }
  
  sendToWindow(type: WindowType, channel: string, ...args: any[]): void {
    const window = this.windows.get(type);
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, ...args);
    }
  }
  
  focusWindow(type: WindowType): void {
    const window = this.windows.get(type);
    if (window && !window.isDestroyed()) {
      window.focus();
    }
  }
  
  sendToAllWindows(channel: string, data: any = null, excludeWindow?: WindowType): void {
    this.windows.forEach((window, name) => {
      if (name !== excludeWindow && window && !window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    });
  }
  
  addWindow(name: WindowType, window: BrowserWindow): void {
    this.windows.set(name, window);
  }
  
  removeWindow(name: WindowType): void {
    this.windows.delete(name);
  }
}
