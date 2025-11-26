import { Logger } from '../core/logger';
import { BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';

export class UpdateService {
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    Logger.info('🚀 UpdateService initialized with custom update check');
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  // Custom update check (disabled in open-source build)
  async customCheckForUpdates() {
    Logger.info('[UpdateService] Update checks disabled in open-source build');
    Logger.info('[UpdateService] Check GitHub releases manually for updates');
    
    // No-op in open-source build
    // Users can check GitHub releases page for new versions
  }

  // Get the correct architecture key for downloads
  private getArchitectureKey(): string {
    const platform = process.platform;
    const arch = process.arch;
    
    // Map Node.js arch values to our download keys
    let mappedArch: string;
    switch (arch) {
      case 'arm64':
        mappedArch = 'arm64';
        break;
      case 'x64':
        mappedArch = 'x64';
        break;
      default:
        Logger.warning(`Unknown architecture: ${arch}, defaulting to arm64`);
        mappedArch = 'arm64';
    }
    
    const key = `${platform}-${mappedArch}`;
    Logger.info(`🏗️ Architecture key: ${key} (platform: ${platform}, arch: ${arch})`);
    return key;
  }

  private isNewerVersion(current: string, latest: string): boolean {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);
    
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;
      
      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }
    
    return false;
  }

  checkForUpdates(force = false) {
    // Use app.isPackaged instead of NODE_ENV for more reliable detection
    if (!app.isPackaged && !force) {
      Logger.info('🚧 Skipping update check in development mode (use force=true to test)');
      return;
    }
    
    // Use custom update check instead of electron-updater
    this.customCheckForUpdates();
  }

  // Force update check for testing
  forceCheckForUpdates() {
    Logger.info('🧪 Force update check requested - bypassing all environment checks');
    this.customCheckForUpdates();
  }

  private notifyUpdateAvailable(info: any) {
    if (!this.mainWindow) return;

    const currentVersion = require('../../package.json').version;
    const newVersion = info.version;
    const isMajorUpdate = this.isMajorUpdate(currentVersion, newVersion);

    // Send to renderer for custom UI following design guidelines
    this.mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes || 'New version available with improvements and bug fixes.',
      isMajor: isMajorUpdate,
      downloadUrl: info.downloadUrl
    });
  }

  private isMajorUpdate(currentVersion: string, newVersion: string): boolean {
    const current = currentVersion.split('.').map(Number);
    const new_ = newVersion.split('.').map(Number);
    
    // Major update if:
    // 1. Major version changes (1.0.0 -> 2.0.0)
    // 2. Minor version jumps significantly (0.1.0 -> 0.5.0)
    // 3. Special version patterns (0.x -> 1.0)
    
    if (new_[0] > current[0]) return true; // Major version bump
    if (new_[0] === 0 && current[0] === 0 && new_[1] - current[1] >= 3) return true; // Significant minor jump
    if (current[0] === 0 && new_[0] === 1) return true; // Beta to stable
    
    return false;
  }

  private notifyUpdateDownloaded() {
    if (!this.mainWindow) return;

    // Send to renderer for custom UI
    this.mainWindow.webContents.send('update-downloaded');
  }

  // Custom download function with automatic installation
  async downloadUpdate(downloadUrl: string, version: string) {
    Logger.info('📥 Starting automatic update download and installation...');
    
    try {
      const tempDir = path.join(require('os').tmpdir(), 'jarvis-update');
      const dmgPath = path.join(tempDir, `jarvis-${version}.dmg`);
      
      // Create temp directory
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Download the DMG file
      await this.downloadFile(downloadUrl, dmgPath);
      
      // Install the update
      await this.installUpdate(dmgPath, version);
      
    } catch (error) {
      Logger.error('❌ Download/install error:', error);
      
      // Notify renderer of download error
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update-download-error', { error: error.message });
      }
    }
  }

  private async downloadFile(url: string, destinationPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destinationPath);
      
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        
        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;
        
        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progress = Math.round((downloadedSize / totalSize) * 100);
          
          // Send progress to renderer
          if (this.mainWindow) {
            this.mainWindow.webContents.send('update-progress', { percent: progress });
          }
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          Logger.info('✅ Download completed');
          resolve();
        });
        
        file.on('error', (err) => {
          fs.unlink(destinationPath, () => {}); // Delete partial file
          reject(err);
        });
        
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  private async installUpdate(dmgPath: string, version: string): Promise<void> {
    Logger.info('🔧 Installing update...');
    
    try {
      // Mount the DMG
      const mountResult = execSync(`hdiutil mount "${dmgPath}"`, { encoding: 'utf8' });
      Logger.info(`🔍 Mount output: ${mountResult}`);
      
      // Extract mount point more reliably
      const mountLines = mountResult.split('\n');
      let mountPoint = '';
      
      Logger.info(`📋 hdiutil output lines: ${mountLines.length}`);
      Logger.info(`🔍 Lines: ${JSON.stringify(mountLines)}`);
      
      for (const line of mountLines) {
        // Look for lines containing /Volumes/ and extract the full path
        const volumeIndex = line.indexOf('/Volumes/');
        if (volumeIndex !== -1) {
          mountPoint = line.substring(volumeIndex).trim();
          // Remove any trailing whitespace or invisible characters
          mountPoint = mountPoint.replace(/\s+$/, '');
          Logger.info(`🔍 Found potential mount point: "${mountPoint}"`);
          break;
        }
      }
      
      if (!mountPoint) {
        throw new Error('Failed to extract mount point from hdiutil output');
      }
      
      // Verify mount point exists before proceeding
      if (!fs.existsSync(mountPoint)) {
        // Try to list available volumes for debugging
        try {
          const volumes = fs.readdirSync('/Volumes/');
          Logger.info(`📂 Available volumes: ${volumes.join(', ')}`);
        } catch (e) {
          Logger.error('❌ Could not list /Volumes/');
        }
        throw new Error(`Mount point does not exist: ${mountPoint}`);
      }
      
      Logger.info(`📂 DMG mounted at: ${mountPoint}`);
      
      // Find the app in the mounted DMG
      const mountContents = fs.readdirSync(mountPoint);
      Logger.info(`📋 DMG contents: ${mountContents.join(', ')}`);
      
      const appFile = mountContents.find(file => file.endsWith('.app'));
      if (!appFile) {
        throw new Error('No .app file found in DMG');
      }
      
      const sourceApp = path.join(mountPoint, appFile);
      Logger.info(`📱 Found app: ${appFile}`);
      
      // Get current app path
      const currentAppPath = app.getAppPath();
      Logger.info(`📍 Current app path: ${currentAppPath}`);
      
      let appBundle: string;
      if (currentAppPath.includes('.app')) {
        // Production mode - extract the .app bundle path
        appBundle = currentAppPath.split('.app')[0] + '.app';
      } else {
        // Development mode - we can't actually update, so simulate
        Logger.info('⚠️ Running in development mode - simulating update');
        this.mainWindow.webContents.send('update-downloaded');
        return;
      }
      
      Logger.info(`🔄 Replacing app at: ${appBundle}`);
      
      // Create backup of current app
      const backupPath = `${appBundle}.backup`;
      if (fs.existsSync(backupPath)) {
        execSync(`rm -rf "${backupPath}"`);
      }
      execSync(`cp -R "${appBundle}" "${backupPath}"`);
      
      // Replace the app
      execSync(`rm -rf "${appBundle}"`);
      execSync(`cp -R "${sourceApp}" "${path.dirname(appBundle)}"`);
      
      // Unmount DMG
      execSync(`hdiutil unmount "${mountPoint}"`);
      
      // Clean up
      fs.unlinkSync(dmgPath);
      
      Logger.info('✅ Update installed successfully');
      
      // Notify renderer that update is ready
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update-downloaded');
      }
      
      // Restart the app after a short delay
      setTimeout(() => {
        this.restartApp();
      }, 2000);
      
    } catch (error) {
      Logger.error('❌ Installation failed:', error);
      throw error;
    }
  }

  private restartApp() {
    Logger.info('🔄 Restarting app with new version...');
    app.relaunch();
    app.exit(0);
  }
}
