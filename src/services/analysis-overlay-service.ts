import { BrowserWindow, screen, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../core/logger';
import { WindowManager } from './window-manager';
import { AppState } from './app-state';

interface AnalysisOverlayState {
  isVisible: boolean;
  currentText: string;
  isVisionQuery: boolean;
}

export class AnalysisOverlayService {
  private static instance: AnalysisOverlayService;
  private windowManager: WindowManager;
  private appState: AppState;
  private overlayState: AnalysisOverlayState = {
    isVisible: false,
    currentText: '',
    isVisionQuery: false
  };
  
  private constructor() {
    this.windowManager = WindowManager.getInstance();
    this.appState = AppState.getInstance();
    this.setupIpcHandlers();
  }
  
  public static getInstance(): AnalysisOverlayService {
    if (!AnalysisOverlayService.instance) {
      AnalysisOverlayService.instance = new AnalysisOverlayService();
    }
    return AnalysisOverlayService.instance;
  }
  
  private setupIpcHandlers(): void {
    ipcMain.on('hide-analysis-overlay', () => {
      this.hideOverlay();
    });
    
    ipcMain.handle('show-analysis-overlay', async (_, analysisText: string, isVisionQuery: boolean = false) => {
      this.showOverlay(analysisText, isVisionQuery);
      return true;
    });
  }
  
  public createOverlayWindow(): BrowserWindow | null {
    Logger.info('◆ Creating analysis overlay window');
    
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    
    // Force destroy existing overlay to prevent stacking/remains
    const existing = this.windowManager.getWindow('analysisOverlay');
    if (existing && !existing.isDestroyed()) {
      Logger.info('◆ Force destroying existing overlay to prevent stacking');
      existing.destroy(); // Use destroy() for immediate cleanup
      this.windowManager.removeWindow('analysisOverlay');
    }
    
    // Check if analysis overlay HTML file exists before creating window
    const overlayPath = path.join(__dirname, '../analysis-overlay.html');
    const distOverlayPath = path.join(process.cwd(), 'dist', 'analysis-overlay.html');
    
    // Try both dist path (for built app) and src path (for development)
    const finalOverlayPath = fs.existsSync(distOverlayPath) ? distOverlayPath : overlayPath;
    
    if (!fs.existsSync(finalOverlayPath)) {
      Logger.error(`✖ Analysis overlay HTML file not found at: ${finalOverlayPath}`);
      Logger.error(`✖ Also checked: ${overlayPath}`);
      Logger.error('✖ Skipping overlay creation to prevent click-blocking without content');
      return null;
    }
    
    const overlayWindow = new BrowserWindow({
      width: 280, // Match the analyzing overlay size
      height: 80,
      x: screenWidth - 300, // Position in top-right corner (remove Math.round)
      y: 20,
      frame: false,
      alwaysOnTop: false, // Don't force always on top to prevent click blocking
      transparent: true,
      resizable: false,
      movable: false, // Disable dragging to prevent click interception
      show: false,
      skipTaskbar: true,
      hasShadow: false, // Remove shadow to prevent click area expansion
      focusable: true, // Allow focusing for text input - we'll manage click-through differently
      acceptFirstMouse: false, // Don't accept first mouse to prevent accidental activation
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    // Load the analysis overlay HTML file
    Logger.info(`◆ Loading overlay from: ${finalOverlayPath}`);
    
    overlayWindow.loadFile(finalOverlayPath);
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Don't set always on top to prevent blocking clicks
    // overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    
    // Add smart window management for text input
    overlayWindow.on('focus', () => {
      Logger.debug('◆ Analysis overlay focused - enabling text input');
    });
    
    overlayWindow.on('blur', () => {
      Logger.debug('◆ Analysis overlay blurred - maintaining input capability');
      // Don't make it non-focusable on blur since user might want to click back into it
    });
    
    overlayWindow.on('closed', () => {
      Logger.info('◌ Analysis overlay closed - cleaning up references');
      this.windowManager.removeWindow('analysisOverlay');
      
      // Clear state when overlay is closed
      this.overlayState = {
        isVisible: false,
        currentText: '',
        isVisionQuery: false
      };
    });
    
    overlayWindow.on('ready-to-show', () => {
      Logger.info('● Analysis overlay ready to show');
    });
    
    this.windowManager.addWindow('analysisOverlay', overlayWindow);
    Logger.info('● Analysis overlay created successfully');
    return overlayWindow;
  }
  
  public showOverlay(analysisText: string, isVisionQuery: boolean = false, loadingMessage?: string): void {
    try {
      // DEFENSIVE: Never show overlay if we're in dictation mode
      const currentDictationMode = this.appState.getDictationMode();
      if (currentDictationMode) {
        Logger.info('🛡️ [Defensive] Blocking analysis overlay - currently in dictation mode');
        return;
      }
      
      Logger.info('◆ Showing analysis overlay');
      
      // Properly cleanup existing overlay to prevent stacking/remains
      this.hideOverlay();
      
      // Wait a moment for cleanup to complete before creating new overlay
      setTimeout(() => {
        // Create new overlay
        const overlayWindow = this.createOverlayWindow();
        
        // If overlay creation failed, don't proceed
        if (!overlayWindow) {
          Logger.error('✖ Failed to create overlay window - skipping overlay display');
          return;
        }
      
        // Wait a bit for the overlay to be created, then show it
        setTimeout(() => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            // Reset to analyzing state first (small window)
            overlayWindow.setSize(280, 80);
            const display = screen.getPrimaryDisplay();
            const screenWidth = display.workAreaSize.width;
            overlayWindow.setPosition(screenWidth - 300, 20);
            
            // Send reset signal to overlay to go back to analyzing state with custom message
            overlayWindow.webContents.send('reset-to-analyzing', loadingMessage || 'Analyzing screen...');
            
            // Show the window immediately in analyzing state without focusing
            overlayWindow.showInactive();
            // Don't set always on top to prevent blocking clicks in Chrome tabs
            // overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
            
            Logger.info('◆ Analysis overlay window shown');
            
            // If there's analysis text, send it after showing the analyzing state
            if (analysisText) {
              const sendResults = () => {
                if (overlayWindow && !overlayWindow.isDestroyed()) {
                  Logger.info('🔍 Sending analysis result');
                  overlayWindow.webContents.send('analysis-result', {
                    text: analysisText,
                    isVisionQuery: isVisionQuery
                  });
                }
              };
              
              // Wait for webContents to be ready then send data
              if (overlayWindow.webContents.isLoading()) {
                overlayWindow.webContents.once('dom-ready', () => {
                  setTimeout(sendResults, 300);
                });
              } else {
                setTimeout(sendResults, 300);
              }
            }
          }
        }, 200);
        
        this.overlayState = {
          isVisible: true,
          currentText: analysisText,
          isVisionQuery
        };
      }, 100);
    } catch (error) {
      Logger.error('✖ Failed to show analysis overlay:', error);
    }
  }
  
  public sendAnalysisResult(analysisText: string, isConversation: boolean = false): void {
    try {
      // Add detailed logging to trace the source of overlay calls
      const stack = new Error().stack;
      const caller = stack?.split('\n')[2]?.trim() || 'unknown';
      Logger.info(`▶ Sending analysis result to overlay - called from: ${caller}`);
      Logger.debug(`▶ Analysis text: "${analysisText.substring(0, 100)}..."`);
      
      // DEFENSIVE CHECK: Don't show overlay if we're in dictation mode
      if (this.appState.getDictationMode()) {
        Logger.warning(`🚫 [Dictation] Blocking overlay display - currently in dictation mode`);
        Logger.warning(`🚫 [Dictation] This indicates a bug in the flow - overlay should not be called during dictation`);
        return;
      }
      
      // Function to actually send the result
      const sendResults = () => {
        const overlayWindow = this.windowManager.getWindow('analysisOverlay');
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          // Resize window for expanded view
          const display = screen.getPrimaryDisplay();
          const screenWidth = display.workAreaSize.width;
          overlayWindow.setSize(480, 600);
          overlayWindow.setPosition(screenWidth - 500, 20);
          
          // Make it focusable for interaction but don't steal focus
          overlayWindow.setFocusable(true); // Ensure it can receive focus for text input
          
          // Ensure window is visible but don't set always on top to prevent click blocking
          overlayWindow.showInactive(); // Show without focusing
          // Don't set always on top to prevent blocking clicks in Chrome tabs
          // overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
          
          overlayWindow.webContents.send('analysis-result', {
            text: analysisText,
            isVisionQuery: !isConversation, // Only true for actual vision/screen analysis
            isConversation: isConversation // New flag to distinguish conversation
          });
          
          Logger.info('▶ Analysis result sent and overlay ensured visible');
        } else {
          Logger.info('▶ No overlay window available to send results to');
        }
      };
      
      // Wait for overlay to be ready before sending results
      const overlayWindow = this.windowManager.getWindow('analysisOverlay');
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        // If overlay exists, wait for it to be ready
        if (overlayWindow.webContents.isLoading()) {
          overlayWindow.webContents.once('dom-ready', () => {
            setTimeout(sendResults, 100);
          });
        } else {
          setTimeout(sendResults, 100);
        }
      } else {
        // If no overlay exists, wait for it to be created
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = 100;
        
        const waitForOverlay = () => {
          const window = this.windowManager.getWindow('analysisOverlay');
          if (window && !window.isDestroyed()) {
            // Wait for DOM to be ready
            if (window.webContents.isLoading()) {
              window.webContents.once('dom-ready', () => {
                setTimeout(sendResults, 100);
              });
            } else {
              setTimeout(sendResults, 100);
            }
          } else if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(waitForOverlay, retryInterval);
          } else {
            Logger.info('▶ Timed out waiting for overlay window to be created');
          }
        };
        
        waitForOverlay();
      }
      
      // Update overlay state
      this.overlayState.currentText = analysisText;
    } catch (error) {
      Logger.error('✖ Failed to send analysis result:', error);
    }
  }
  
  public hideOverlay(): void {
    try {
      const overlayWindow = this.windowManager.getWindow('analysisOverlay');
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        Logger.info('● [Analysis] Hiding and destroying overlay');
        
        // Hide first, then destroy to prevent visual artifacts
        overlayWindow.hide();
        
        // Close the window completely to prevent remains
        overlayWindow.close();
        
        // Clear overlay state immediately
        this.overlayState = {
          isVisible: false,
          currentText: '',
          isVisionQuery: false
        };
        
        // Send window focus to all windows
        this.windowManager.sendToAllWindows('window-focus');
        
        Logger.info('● [Analysis] Overlay hidden and cleaned up');
      } else {
        Logger.info('● [Analysis] No overlay to hide');
        
        // Clear state anyway to be safe
        this.overlayState = {
          isVisible: false,
          currentText: '',
          isVisionQuery: false
        };
      }
    } catch (error) {
      Logger.error('Failed to hide analysis overlay:', error);
      
      // Clear state even if there was an error
      this.overlayState = {
        isVisible: false,
        currentText: '',
        isVisionQuery: false
      };
    }
  }
  
  public isVisible(): boolean {
    return this.overlayState.isVisible;
  }
  
  public getCurrentText(): string {
    return this.overlayState.currentText;
  }
}
