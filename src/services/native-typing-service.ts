const path = require('path');

interface TypingMonitor {
  startMonitoring(callback: (event: string) => void): void;
  stopMonitoring(): void;
  checkAccessibilityPermissions(): boolean;
}

export class NativeTypingService {
  private typingMonitor: TypingMonitor | null = null;
  private isActive = false;
  private onTyping: (() => void) | null = null;

  constructor(onTyping: () => void) {
    this.onTyping = onTyping;
  }

  private loadNativeModule(): boolean {
    if (this.typingMonitor) return true;

    try {
      // For Electron apps, we need to bypass webpack's require interception
      const nodeRequire = eval('require');
      const fs = nodeRequire('fs');
      
      // Check multiple possible paths
      const possiblePaths = [
        // Production build - extraResources location
        path.join(process.resourcesPath, 'typing_monitor.node'),
        // Development - dist folder
        path.join(__dirname, '../typing_monitor.node'),           
        path.join(__dirname, '../../build/Release/typing_monitor.node'),
        // From app root
        path.join(process.cwd(), 'dist/typing_monitor.node'),     
        path.join(process.cwd(), 'build/Release/typing_monitor.node')
      ];
      
      let foundPath: string | null = null;
      for (const modulePath of possiblePaths) {
        if (fs.existsSync(modulePath)) {
          foundPath = modulePath;
          break;
        }
      }
      
      if (!foundPath) {
        const errorMsg = `Native typing monitor module not found. Searched paths: ${possiblePaths.join(', ')}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Load the native module using eval('require') to bypass webpack
      this.typingMonitor = nodeRequire(foundPath);
      
      console.log('Native typing monitor module loaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to load native typing monitor module:', error);
      console.error('💡 Make sure to run: npm run build:native');
      return false;
    }
  }

  start(): boolean {
    if (this.isActive) {
      console.log('Typing monitor already running');
      return false;
    }

    if (!this.loadNativeModule()) {
      console.error('Native typing monitor module not loaded');
      return false;
    }

    try {
      // Check accessibility permissions
      const hasPermissions = this.typingMonitor!.checkAccessibilityPermissions();
      if (!hasPermissions) {
        console.warn('Accessibility permissions required for typing monitoring');
        console.log('Please enable in System Settings > Privacy & Security > Accessibility');
        return false;
      }

      // Start monitoring with callback
      this.typingMonitor!.startMonitoring((event: string) => {
        if (event === 'TYPING_DETECTED') {
          console.log('Typing activity detected');
          this.onTyping?.();
        }
      });

      this.isActive = true;
      console.log('Native typing monitoring started successfully');
      return true;
    } catch (error) {
      console.error('Failed to start typing monitoring:', error);
      return false;
    }
  }

  stop(): void {
    if (this.typingMonitor && this.isActive) {
      console.log('Stopping typing monitoring');
      this.typingMonitor.stopMonitoring();
      this.isActive = false;
      console.log('Typing monitoring stopped');
    }
  }

  get monitoring(): boolean {
    return this.isActive;
  }

  getLastError(): string {
    return this.isActive ? '' : 'Typing monitoring not active';
  }
}
