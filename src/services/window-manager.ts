import { BrowserWindow, screen, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { Logger } from '../core/logger';
import { AppSettingsService } from './app-settings-service';

export type WindowType = 'suggestion' | 'waveform' | 'dashboard' | 'analysisOverlay';

export class WindowManager {
  private static instance: WindowManager;
  private windows: Map<WindowType, BrowserWindow | null> = new Map();
  private waveformTrackingInterval: NodeJS.Timeout | null = null;
  private lastFrontmostDisplayId: number | null = null;

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
   * Get the position of the frontmost application's window using AppleScript
   * Returns the center point of the window, or null if unable to determine
   */
  private getFrontmostWindowPosition(): { x: number; y: number } | null {
    try {
      // AppleScript to get the frontmost app's window bounds
      // Using explicit string concatenation to avoid list formatting issues
      const script = `
        tell application "System Events"
          try
            set frontApp to first application process whose frontmost is true
            set frontWindow to first window of frontApp
            set winPos to position of frontWindow
            set winSize to size of frontWindow
            set winX to item 1 of winPos
            set winY to item 2 of winPos
            set winW to item 1 of winSize
            set winH to item 2 of winSize
            return (winX as text) & "," & (winY as text) & "," & (winW as text) & "," & (winH as text)
          on error
            return "error"
          end try
        end tell`;

      const result = spawnSync('osascript', ['-e', script], {
        encoding: 'utf8',
        timeout: 200,
        maxBuffer: 1024 * 64,
      });

      Logger.info(`🔄 [WindowManager] AppleScript result: status=${result.status}, stdout="${result.stdout?.trim()}", stderr="${result.stderr?.trim()}"`);

      if (result.status === 0 && result.stdout && result.stdout.trim() !== 'error') {
        const parts = result.stdout.trim().split(',').map(s => parseInt(s.trim(), 10));
        Logger.info(`🔄 [WindowManager] Parsed parts: ${JSON.stringify(parts)}`);
        if (parts.length === 4 && parts.every(n => !isNaN(n))) {
          const [winX, winY, winWidth, winHeight] = parts;
          // Return the center of the window
          const center = {
            x: winX + Math.round(winWidth / 2),
            y: winY + Math.round(winHeight / 2)
          };
          Logger.info(`🔄 [WindowManager] Frontmost window center: ${JSON.stringify(center)}`);
          return center;
        }
      }
    } catch (error) {
      Logger.info(`🔄 [WindowManager] Failed to get frontmost window position: ${error}`);
    }
    return null;
  }

  /**
   * FAST reposition using last known frontmost display.
   * Call this BEFORE showing the window to avoid flash.
   * On first trigger (no cached data), runs AppleScript synchronously to get correct display.
   * Returns the display ID where window was positioned.
   */
  quickRepositionWaveformWindow(): number | null {
    const window = this.windows.get('waveform');
    if (!window || window.isDestroyed()) {
      return null;
    }

    let activeDisplay: Electron.Display;

    if (this.lastFrontmostDisplayId !== null) {
      // Fast path: use cached display from previous AppleScript tracking
      const displays = screen.getAllDisplays();
      const lastDisplay = displays.find(d => d.id === this.lastFrontmostDisplayId);
      activeDisplay = lastDisplay || screen.getPrimaryDisplay();
    } else {
      // First trigger: run AppleScript synchronously to get correct display
      const frontWindowPos = this.getFrontmostWindowPosition();
      if (frontWindowPos) {
        activeDisplay = screen.getDisplayNearestPoint(frontWindowPos);
      } else {
        activeDisplay = screen.getPrimaryDisplay();
      }
      this.lastFrontmostDisplayId = activeDisplay.id;
    }

    const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = activeDisplay.workArea;

    const windowWidth = 80;
    const windowHeight = 50;
    const margin = 20;

    const x = displayX + displayWidth - windowWidth - margin;
    const y = displayY + displayHeight - windowHeight - margin;

    window.setPosition(x, y);

    return activeDisplay.id;
  }

  /**
   * Reposition waveform window to bottom-right of the screen containing the frontmost app
   * Falls back to cursor position if frontmost window can't be determined
   */
  repositionWaveformWindow(): void {
    Logger.info('🔄 [WindowManager] repositionWaveformWindow called');

    const window = this.windows.get('waveform');
    if (!window || window.isDestroyed()) {
      Logger.info('🔄 [WindowManager] No waveform window to reposition');
      return;
    }

    // Try to get the frontmost app's window position (where paste will go)
    const frontWindowPos = this.getFrontmostWindowPosition();
    Logger.info(`🔄 [WindowManager] Frontmost window position: ${JSON.stringify(frontWindowPos)}`);

    let activeDisplay: Electron.Display;
    if (frontWindowPos) {
      // Position based on frontmost application's window
      activeDisplay = screen.getDisplayNearestPoint(frontWindowPos);
      Logger.info(`🔄 [WindowManager] Using frontmost window display: ${activeDisplay.id}`);
    } else {
      // Fallback to cursor position
      const cursorPoint = screen.getCursorScreenPoint();
      activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
      Logger.info(`🔄 [WindowManager] Fallback to cursor display: ${activeDisplay.id}, cursor at: ${JSON.stringify(cursorPoint)}`);
    }

    const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = activeDisplay.workArea;
    Logger.info(`🔄 [WindowManager] Display workArea: x=${displayX}, y=${displayY}, w=${displayWidth}, h=${displayHeight}`);

    // Window dimensions (sized to fit compact 48x32 bar with small padding)
    const windowWidth = 80;
    const windowHeight = 50;
    const margin = 20;

    // Position in bottom-right corner of active display
    const x = displayX + displayWidth - windowWidth - margin;
    const y = displayY + displayHeight - windowHeight - margin;

    Logger.info(`🔄 [WindowManager] Setting waveform position to: x=${x}, y=${y}`);
    window.setPosition(x, y);

    // Track which display we're on
    this.lastFrontmostDisplayId = activeDisplay.id;
  }

  /**
   * Start continuously tracking the frontmost app and repositioning waveform
   * Called when waveform becomes visible
   */
  startWaveformTracking(): void {
    // Don't start if already tracking
    if (this.waveformTrackingInterval) return;

    // Only track on multi-monitor setups - single monitor doesn't need tracking
    const displays = screen.getAllDisplays();
    if (displays.length <= 1) {
      Logger.info('🔄 [WindowManager] Single monitor detected, skipping waveform tracking');
      return;
    }

    Logger.info('🔄 [WindowManager] Starting waveform tracking (multi-monitor)');

    // Check every 500ms for frontmost app changes (reduced from 100ms to save CPU)
    // AppleScript process spawning is expensive, so we minimize frequency
    this.waveformTrackingInterval = setInterval(() => {
      const window = this.windows.get('waveform');
      if (!window || window.isDestroyed() || !window.isVisible()) {
        this.stopWaveformTracking();
        return;
      }

      // Get current frontmost window position
      const frontWindowPos = this.getFrontmostWindowPosition();
      if (!frontWindowPos) return;

      // Get the display for the frontmost window
      const activeDisplay = screen.getDisplayNearestPoint(frontWindowPos);

      // Only reposition if the display changed
      if (activeDisplay.id !== this.lastFrontmostDisplayId) {
        Logger.info(`🔄 [WindowManager] Frontmost app moved to different display: ${this.lastFrontmostDisplayId} → ${activeDisplay.id}`);
        this.repositionWaveformWindow();
      }
    }, 500);
  }

  /**
   * Stop tracking the frontmost app
   * Called when waveform is hidden
   */
  stopWaveformTracking(): void {
    if (this.waveformTrackingInterval) {
      Logger.info('🔄 [WindowManager] Stopping waveform tracking');
      clearInterval(this.waveformTrackingInterval);
      this.waveformTrackingInterval = null;
      this.lastFrontmostDisplayId = null;
    }
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
