import { Logger } from '../core/logger';
import { BrowserWindow, app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { execSync } from 'child_process';

const GITHUB_OWNER = 'akshayaggarwal99';
const GITHUB_REPO = 'jarvis-ai-assistant';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubAsset[];
  published_at: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  releaseName?: string;
  error?: string;
}

export class UpdateService {
  private mainWindow: BrowserWindow | null = null;
  private updateCheckTimer: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor() {
    Logger.info('🚀 UpdateService initialized with GitHub Releases update check');
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
    // Start periodic update checks when main window is set
    this.startPeriodicChecks();
  }

  /**
   * Start periodic update checks every 4 hours
   */
  private startPeriodicChecks() {
    if (this.updateCheckTimer) {
      clearInterval(this.updateCheckTimer);
    }

    this.updateCheckTimer = setInterval(() => {
      Logger.info('⏰ [UpdateService] Periodic update check triggered');
      this.checkForUpdates(false);
    }, UPDATE_CHECK_INTERVAL_MS);

    Logger.info(`⏰ [UpdateService] Periodic update checks scheduled every ${UPDATE_CHECK_INTERVAL_MS / 1000 / 60 / 60} hours`);
  }

  /**
   * Fetch the latest release from GitHub Releases API
   */
  private fetchLatestRelease(): Promise<GitHubRelease> {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': `Jarvis-AI-Assistant/${app.getVersion()}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      https.get(GITHUB_API_URL, options, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            https.get(redirectUrl, options, (redirectResponse) => {
              let data = '';
              redirectResponse.on('data', (chunk) => { data += chunk; });
              redirectResponse.on('end', () => {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  reject(new Error(`Failed to parse GitHub API response: ${e}`));
                }
              });
            }).on('error', reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`GitHub API returned status ${response.statusCode}`));
          return;
        }

        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse GitHub API response: ${e}`));
          }
        });
      }).on('error', reject);
    });
  }

  // Get the correct architecture key for downloads
  private getArchitectureKey(): string {
    const arch = process.arch;

    switch (arch) {
      case 'arm64':
        return 'Apple_Silicon';
      case 'x64':
        return 'Intel';
      default:
        Logger.warning(`Unknown architecture: ${arch}, defaulting to Apple_Silicon`);
        return 'Apple_Silicon';
    }
  }

  /**
   * Find the correct DMG asset for the current platform/architecture
   */
  private findMatchingAsset(assets: GitHubAsset[]): GitHubAsset | null {
    const archKey = this.getArchitectureKey();

    // Look for DMG files matching our architecture
    // Asset naming pattern: "Jarvis.-.AI.Assistant-{version}-{Apple_Silicon|Intel}.dmg"
    const matchingAsset = assets.find(asset => {
      const name = asset.name.toLowerCase();
      return name.endsWith('.dmg') && name.includes(archKey.toLowerCase());
    });

    if (matchingAsset) {
      Logger.info(`📦 [UpdateService] Found matching asset: ${matchingAsset.name} for arch: ${archKey}`);
    } else {
      Logger.warning(`⚠️ [UpdateService] No matching DMG found for arch: ${archKey}. Available assets: ${assets.map(a => a.name).join(', ')}`);
    }

    return matchingAsset || null;
  }

  /**
   * Parse version string, stripping 'v' prefix if present
   */
  private parseVersion(version: string): string {
    return version.replace(/^v/, '');
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

  /**
   * Check for updates against GitHub Releases.
   * This is the main update check method.
   */
  async customCheckForUpdates(): Promise<UpdateCheckResult> {
    if (this.isChecking) {
      Logger.info('[UpdateService] Update check already in progress, skipping');
      return { updateAvailable: false, currentVersion: app.getVersion() };
    }

    this.isChecking = true;
    const currentVersion = app.getVersion();

    try {
      Logger.info(`🔍 [UpdateService] Checking for updates... Current version: ${currentVersion}`);

      const release = await this.fetchLatestRelease();

      // Skip drafts and prereleases
      if (release.draft || release.prerelease) {
        Logger.info('[UpdateService] Latest release is draft/prerelease, skipping');
        return { updateAvailable: false, currentVersion };
      }

      const latestVersion = this.parseVersion(release.tag_name);
      Logger.info(`🔍 [UpdateService] Latest GitHub release: ${latestVersion} (tag: ${release.tag_name})`);

      if (!this.isNewerVersion(currentVersion, latestVersion)) {
        Logger.info(`✅ [UpdateService] App is up to date (${currentVersion} >= ${latestVersion})`);
        return {
          updateAvailable: false,
          currentVersion,
          latestVersion
        };
      }

      // Find the correct DMG for this platform
      const matchingAsset = this.findMatchingAsset(release.assets);
      if (!matchingAsset) {
        Logger.warning('[UpdateService] Update available but no matching DMG found for this architecture');
        return {
          updateAvailable: true,
          currentVersion,
          latestVersion,
          releaseNotes: release.body,
          error: 'No compatible download found for your system architecture'
        };
      }

      const isMajor = this.isMajorUpdate(currentVersion, latestVersion);

      Logger.info(`🎉 [UpdateService] Update available: ${currentVersion} → ${latestVersion} (${isMajor ? 'MAJOR' : 'minor'})`);

      // Notify the renderer
      this.notifyUpdateAvailable({
        version: latestVersion,
        releaseNotes: release.body || release.name || 'New version available with improvements and bug fixes.',
        isMajor,
        downloadUrl: matchingAsset.browser_download_url,
        releaseName: release.name
      });

      return {
        updateAvailable: true,
        currentVersion,
        latestVersion,
        releaseNotes: release.body,
        downloadUrl: matchingAsset.browser_download_url,
        releaseName: release.name
      };

    } catch (error: any) {
      Logger.error('❌ [UpdateService] Update check failed:', error);
      return {
        updateAvailable: false,
        currentVersion,
        error: error.message
      };
    } finally {
      this.isChecking = false;
    }
  }

  checkForUpdates(force = false) {
    // Use app.isPackaged instead of NODE_ENV for more reliable detection
    if (!app.isPackaged && !force) {
      Logger.info('🚧 Skipping update check in development mode (use force=true to test)');
      return;
    }

    // Use custom update check against GitHub Releases
    this.customCheckForUpdates();
  }

  // Force update check for testing (returns result for menu feedback)
  async forceCheckForUpdates(): Promise<UpdateCheckResult> {
    Logger.info('🧪 Force update check requested - bypassing all environment checks');
    return this.customCheckForUpdates();
  }

  private notifyUpdateAvailable(info: {
    version: string;
    releaseNotes: string;
    isMajor: boolean;
    downloadUrl: string;
    releaseName?: string;
  }) {
    if (!this.mainWindow) return;

    // Send to renderer for custom UI following design guidelines
    this.mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      isMajor: info.isMajor,
      downloadUrl: info.downloadUrl,
      releaseName: info.releaseName
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
    Logger.info(`📥 [UpdateService] Starting download for v${version} from: ${downloadUrl}`);

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

    } catch (error: any) {
      Logger.error('❌ Download/install error:', error);

      // Notify renderer of download error
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update-download-error', { error: error.message });
      }
    }
  }

  /**
   * Download a file with redirect support (GitHub serves assets via redirect)
   */
  private async downloadFile(url: string, destinationPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const doDownload = (downloadUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'));
          return;
        }

        const protocol = downloadUrl.startsWith('https') ? https : http;

        protocol.get(downloadUrl, {
          headers: {
            'User-Agent': `Jarvis-AI-Assistant/${app.getVersion()}`
          }
        }, (response) => {
          // Handle redirects (GitHub uses 302 for asset downloads)
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              Logger.info(`🔄 [UpdateService] Following redirect to: ${redirectUrl.substring(0, 80)}...`);
              doDownload(redirectUrl, redirectCount + 1);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
            return;
          }

          const file = fs.createWriteStream(destinationPath);
          const totalSize = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedSize = 0;

          response.on('data', (chunk: Buffer) => {
            downloadedSize += chunk.length;
            const progress = totalSize > 0
              ? Math.round((downloadedSize / totalSize) * 100)
              : -1; // Indeterminate if no content-length

            // Send progress to renderer
            if (this.mainWindow) {
              this.mainWindow.webContents.send('update-progress', {
                percent: progress,
                downloadedMB: Math.round(downloadedSize / 1024 / 1024 * 10) / 10,
                totalMB: totalSize > 0 ? Math.round(totalSize / 1024 / 1024 * 10) / 10 : 0
              });
            }
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            Logger.info(`✅ [UpdateService] Download completed: ${destinationPath} (${Math.round(downloadedSize / 1024 / 1024)}MB)`);
            resolve();
          });

          file.on('error', (err) => {
            fs.unlink(destinationPath, () => {}); // Delete partial file
            reject(err);
          });

        }).on('error', (err) => {
          reject(err);
        });
      };

      doDownload(url);
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
        // Unmount DMG before returning
        try { execSync(`hdiutil unmount "${mountPoint}"`); } catch (e) { /* ignore */ }
        if (this.mainWindow) {
          this.mainWindow.webContents.send('update-downloaded');
        }
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

  /**
   * Clean up resources
   */
  destroy() {
    if (this.updateCheckTimer) {
      clearInterval(this.updateCheckTimer);
      this.updateCheckTimer = null;
    }
  }
}
