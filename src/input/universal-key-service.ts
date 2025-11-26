const path = require('path');
import { Logger } from '../core/logger';
import { shell } from 'electron';

interface UniversalKeyMonitor {
  startMonitoring(keyName: string, callback: (event: string) => void): boolean;
  stopMonitoring(): boolean;
  checkAccessibilityPermissions(): boolean;
  getSupportedKeys(): string[];
}

export class UniversalKeyService {
  private keyMonitor: UniversalKeyMonitor | null = null;
  private isActive = false;
  private onKeyDown: (() => void) | null = null;
  private onKeyUp: (() => void) | null = null;
  private currentKey: string = 'fn';
  private lastKeyDownTime = 0;
  private lastKeyUpTime = 0;
  private debounceMs = 5; // Reduced from 10ms to 5ms for even faster response
  private isProcessingKeyDown = false;
  private isProcessingKeyUp = false;

  constructor(onKeyDown: () => void, onKeyUp: () => void) {
    this.onKeyDown = onKeyDown;
    this.onKeyUp = onKeyUp;
  }

  private loadNativeModule(): boolean {
    if (this.keyMonitor) return true;

    try {
      // For Electron apps, we need to bypass webpack's require interception
      const nodeRequire = eval('require');
      const fs = nodeRequire('fs');
      
      // Check multiple possible paths
      const possiblePaths = [
        // Production build - extraResources location
        path.join(process.resourcesPath, 'universal_key_monitor.node'),

        // <----- NEW: DMG / asar-unpacked paths ----->  
        path.join(process.resourcesPath, 'app.asar.unpacked', 'universal_key_monitor.node'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'Release', 'universal_key_monitor.node'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'universal_key_monitor.node'),

        // Development - dist folder
        path.join(__dirname, '../universal_key_monitor.node'),
        path.join(__dirname, '../../build/Release/universal_key_monitor.node'),

        // From app root
        path.join(process.cwd(), 'dist/universal_key_monitor.node'),
        path.join(process.cwd(), 'build/Release/universal_key_monitor.node')
      ];
      
      let foundPath: string | null = null;
      for (const modulePath of possiblePaths) {
        if (fs.existsSync(modulePath)) {
          foundPath = modulePath;
          break;
        }
      }
      
      if (!foundPath) {
        const errorMsg = `Universal key monitor not found. Searched paths: ${possiblePaths.join(', ')}`;
        Logger.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Load the native module using eval('require') to bypass webpack
      this.keyMonitor = nodeRequire(foundPath);
      
      Logger.success('Universal key monitor loaded successfully');
      return true;
    } catch (error) {
      Logger.error('Failed to load universal key monitor:', error);
      Logger.error('💡 Make sure to run: npm run build:native');
      return false;
    }
  }

  start(keyName: string = 'fn'): boolean {
    if (this.isActive) {
      Logger.info('Universal key monitor already running');
      return false;
    }

    if (!this.loadNativeModule()) {
      Logger.error('Universal key monitor not loaded');
      return false;
    }

    // Make start method async to handle permission prompts
    this.startAsync(keyName).catch(error => {
      Logger.error('Failed to start key monitoring:', error);
    });

    return true; // Return true immediately, actual success will be logged
  }

  private async startAsync(keyName: string): Promise<boolean> {
    try {
      // Check accessibility permissions
      const hasPermissions = this.keyMonitor!.checkAccessibilityPermissions();
      if (!hasPermissions) {
        Logger.warning('Accessibility permissions required for key monitoring');
        await this.promptForAccessibilityPermissions();
        
        // Check again after user interaction
        const hasPermissionsAfter = this.keyMonitor!.checkAccessibilityPermissions();
        if (!hasPermissionsAfter) {
          Logger.error('Accessibility permissions still not granted - key monitoring disabled');
          return false;
        }
      }

      // Set the current key
      this.currentKey = keyName;

      // Start monitoring with callback and debouncing
      const success = this.keyMonitor!.startMonitoring(keyName, (event: string) => {
        const now = Date.now();
        const keyUpper = keyName.toUpperCase();
        
        if (event === `${keyUpper}_KEY_DOWN`) {
          // Debounce key down events to prevent double triggers
          if (this.isProcessingKeyDown || (now - this.lastKeyDownTime < this.debounceMs)) {
            Logger.debug(`${keyName} key down debounced (${now - this.lastKeyDownTime}ms since last)`);
            return;
          }
          
          this.isProcessingKeyDown = true;
          this.lastKeyDownTime = now;
          
          Logger.debug(`${keyName} key pressed - Push-to-talk activated`);
          
          // ⚡ IMMEDIATE EXECUTION - Remove setTimeout for instant response
          try {
            this.onKeyDown?.();
          } catch (error) {
            Logger.error(`Error in key down handler for ${keyName}:`, error);
          } finally {
            this.isProcessingKeyDown = false;
          }
          
        } else if (event === `${keyUpper}_KEY_UP`) {
          // Debounce key up events to prevent double triggers
          if (this.isProcessingKeyUp || (now - this.lastKeyUpTime < this.debounceMs)) {
            Logger.debug(`${keyName} key up debounced (${now - this.lastKeyUpTime}ms since last)`);
            return;
          }
          
          this.isProcessingKeyUp = true;
          this.lastKeyUpTime = now;
          
          Logger.debug(`${keyName} key released - Push-to-talk deactivated`);
          
          // ⚡ IMMEDIATE EXECUTION - Remove setTimeout for instant response
          try {
            this.onKeyUp?.();
          } catch (error) {
            Logger.error(`Error in key up handler for ${keyName}:`, error);
          } finally {
            this.isProcessingKeyUp = false;
          }
        }
      });

      if (success) {
        this.isActive = true;
        Logger.success(`Universal key monitoring started for: ${keyName}`);
        Logger.info(`Press and hold the ${keyName.charAt(0).toUpperCase() + keyName.slice(1)} key for push-to-talk`);
        return true;
      } else {
        Logger.error(`Failed to start monitoring for key: ${keyName}`);
        return false;
      }
    } catch (error) {
      Logger.error(`Failed to start ${keyName} key monitoring:`, error);
      return false;
    }
  }

  stop(): void {
    if (this.keyMonitor && this.isActive) {
      Logger.debug(`🛑 [${this.currentKey}] Stopping key monitoring`);
      
      try {
        this.keyMonitor.stopMonitoring();
        Logger.info(`✅ [${this.currentKey}] Key monitoring stopped successfully`);
      } catch (error) {
        Logger.error(`❌ [${this.currentKey}] Error stopping key monitoring:`, error);
      }
      
      // Reset all state
      this.isActive = false;
      this.isProcessingKeyDown = false;
      this.isProcessingKeyUp = false;
      this.lastKeyDownTime = 0;
      this.lastKeyUpTime = 0;
    } else {
      Logger.debug(`🛑 [${this.currentKey}] Stop called but monitoring not active`);
    }
  }

  get monitoring(): boolean {
    return this.isActive;
  }

  getLastError(): string {
    return this.isActive ? '' : `${this.currentKey} key monitoring not active`;
  }

  getSupportedKeys(): string[] {
    if (!this.loadNativeModule()) {
      return ['fn']; // fallback to at least function key
    }
    try {
      return this.keyMonitor!.getSupportedKeys();
    } catch (error) {
      Logger.error('Failed to get supported keys:', error);
      return ['fn', 'option', 'control']; // default list without command key
    }
  }

  private async promptForAccessibilityPermissions(): Promise<void> {
    // Send IPC message to renderer to show custom permission dialog
    const { ipcMain } = require('electron');
    
    return new Promise((resolve) => {
      // Send event to dashboard window to show permission dialog
      const dashboardWindow = (global as any).dashboardWindow;
      if (dashboardWindow) {
        dashboardWindow.webContents.send('show-permission-dialog', {
          type: 'accessibility',
          title: 'Accessibility Permissions Required',
          message: 'Jarvis needs accessibility permissions to monitor the key for push-to-talk.'
        });
        
        // Listen for response
        const handleResponse = (event: any, response: string) => {
          ipcMain.removeListener('permission-dialog-response', handleResponse);
          
          if (response === 'open-settings') {
            shell.openPath('/System/Library/PreferencePanes/Security.prefPane')
              .then(() => {
                Logger.info('Opened System Settings - Please grant accessibility permissions to Jarvis');
                // Wait for user to potentially grant permissions
                setTimeout(resolve, 2000);
              })
              .catch((error) => {
                Logger.error('Failed to open System Settings:', error);
                resolve();
              });
          } else if (response === 'try-again') {
            Logger.info('Checking accessibility permissions again...');
            resolve();
          } else {
            Logger.info('User chose to skip accessibility permissions setup');
            resolve();
          }
        };
        
        ipcMain.once('permission-dialog-response', handleResponse);
      } else {
        // Fallback to opening settings directly
        shell.openPath('/System/Library/PreferencePanes/Security.prefPane');
        Logger.info('Opened System Settings - Please grant accessibility permissions to Jarvis');
        setTimeout(resolve, 2000);
      }
    });
  }
}
