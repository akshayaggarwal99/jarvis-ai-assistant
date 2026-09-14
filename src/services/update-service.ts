import { Logger } from '../core/logger';
import { BrowserWindow, app, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execFileSync } from 'child_process';

const MAX_UPDATE_BYTES = 500 * 1024 * 1024;

const isAllowedUpdateUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.hostname === 'github.com') {
      return url.pathname.startsWith('/akshayaggarwal99/jarvis-ai-assistant/releases/download/');
    }
    return ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname);
  } catch {
    return false;
  }
};

export class UpdateService {
  private mainWindow: BrowserWindow | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  // Re-poll GitHub every 6h while the app is running. Without this, a user
  // who never quits Jarvis would only ever see the boot-time check and miss
  // updates released during their session.
  private static readonly PERIODIC_INTERVAL_MS = 6 * 60 * 60 * 1000;
  private latestUpdate: { version: string; releaseNotes: string; downloadUrl: string } | null = null;

  constructor() {
    Logger.info('🚀 UpdateService initialized with custom update check');
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
    // If the update notification was queued before the dashboard window
    // existed, re-emit now that we finally have a destination. Avoids the
    // race where forceCheckForUpdates resolves before setMainWindow runs
    // and the renderer never hears about the update.
    if (this.latestUpdate) {
      this.notifyUpdateAvailable(this.latestUpdate);
    }
  }

  // Polls the GitHub Releases API for the latest published release and
  // fires `update-available` if a newer semver lands. No electron-updater
  // dependency — DMGs are downloaded + installed manually by
  // downloadUpdate() below. Picks the DMG asset whose name matches the
  // current arch (Apple_Silicon vs Intel).
  async customCheckForUpdates() {
    try {
      const currentVersion = require('../../package.json').version;
      Logger.info(`[UpdateService] Checking GitHub for newer release (current: ${currentVersion})...`);

      const release = await this.fetchLatestRelease();
      if (!release || !release.tag_name) {
        Logger.warning('[UpdateService] No release info returned from GitHub');
        return;
      }

      const latestVersion = String(release.tag_name).replace(/^v/, '');
      if (!this.isNewerVersion(currentVersion, latestVersion)) {
        Logger.info(`[UpdateService] No update available. Latest: ${latestVersion}, current: ${currentVersion}`);
        return;
      }

      // Pick the DMG asset matching the user's REAL machine architecture,
      // not the running Electron binary's arch. A user who accidentally
      // installed the Intel DMG on an Apple Silicon Mac would otherwise
      // re-download the wrong build every update and stay stuck forever.
      // This makes auto-update a self-healing path for arch mismatch.
      const { getRealMachineArch } = await import('../core/machine-arch');
      const realArch = getRealMachineArch();
      const arch = realArch === 'arm64' ? 'Apple_Silicon' : 'Intel';
      const procArch = process.arch === 'arm64' ? 'arm64' : 'x64';
      if (realArch !== procArch) {
        Logger.warning(`[UpdateService] Arch mismatch detected — running ${procArch}, machine is ${realArch}. Update will swap to ${arch} build.`);
      }
      const asset = (release.assets || []).find((a: any) => typeof a.name === 'string' && a.name.includes(arch) && a.name.endsWith('.dmg'));
      if (!asset) {
        Logger.warning(`[UpdateService] Newer version ${latestVersion} found, but no DMG asset matched arch=${arch}`);
        return;
      }

      Logger.info(`[UpdateService] Update available: ${latestVersion} (${asset.name})`);
      const update = {
        version: latestVersion,
        releaseNotes: release.body || '',
        downloadUrl: asset.browser_download_url
      };
      this.latestUpdate = update;
      this.notifyUpdateAvailable(update);
    } catch (err) {
      Logger.error('[UpdateService] Update check failed:', err);
    }
  }

  // Boot + periodic. Boot check runs once; periodic catches users who keep
  // Jarvis running for days. Idempotent — safe to call multiple times.
  startPeriodicChecks() {
    if (this.periodicTimer) return;
    this.periodicTimer = setInterval(() => {
      Logger.info('[UpdateService] Periodic update check tick');
      this.customCheckForUpdates();
    }, UpdateService.PERIODIC_INTERVAL_MS);
    Logger.info(`[UpdateService] Periodic update checks scheduled every ${UpdateService.PERIODIC_INTERVAL_MS / 1000 / 60 / 60}h`);
  }

  private fetchLatestRelease(): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        'https://api.github.com/repos/akshayaggarwal99/jarvis-ai-assistant/releases/latest',
        {
          headers: {
            'User-Agent': 'Jarvis-AI-Assistant-Updater',
            'Accept': 'application/vnd.github+json'
          }
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // Follow one redirect manually
            https.get(res.headers.location, { headers: { 'User-Agent': 'Jarvis-AI-Assistant-Updater' } }, (r2) => {
              let body = '';
              r2.on('data', (c) => body += c);
              r2.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
              r2.on('error', reject);
            });
            return;
          }
          let body = '';
          res.on('data', (c) => body += c);
          res.on('end', () => {
            if (!res.statusCode || res.statusCode >= 400) {
              reject(new Error(`GitHub API returned ${res.statusCode}: ${body.slice(0, 200)}`));
              return;
            }
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
          });
          res.on('error', reject);
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(new Error('GitHub API request timeout')); });
    });
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
      if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) || !isAllowedUpdateUrl(downloadUrl)) {
        throw new Error('Update metadata failed validation');
      }
      if (process.env.ENABLE_AUTO_UPDATE_INSTALL !== 'true') {
        throw new Error('Automatic update installation is disabled; use the signed GitHub release instead');
      }

      const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jarvis-update-'));
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

      if (this.mainWindow) {
        this.mainWindow.webContents.send('update-download-error', { error: error.message });
      }
      // Safety net: even if the in-app download failed, open the GitHub
      // releases page in the user's browser so they always have a way out.
      try {
        await shell.openExternal('https://github.com/akshayaggarwal99/jarvis-ai-assistant/releases/latest');
      } catch { /* nothing we can do */ }
      throw error;
    }
  }

  // GitHub release asset URLs (browser_download_url) always 302 to a
  // signed objects.githubusercontent.com URL. The previous version of this
  // method rejected anything that wasn't 200, which silently killed every
  // in-app download. Follow up to 5 redirects.
  private async downloadFile(url: string, destinationPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destinationPath);
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        try { file.close(); } catch { /* */ }
        fs.unlink(destinationPath, () => { /* best-effort */ });
        reject(err);
      };

      const go = (currentUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          fail(new Error('Too many redirects while downloading update'));
          return;
        }
        if (!isAllowedUpdateUrl(currentUrl)) {
          fail(new Error('Update redirect target is not allowed'));
          return;
        }
        Logger.info(`[UpdateService] GET ${currentUrl}`);
        const req = https.get(currentUrl, {
          headers: { 'User-Agent': 'Jarvis-AI-Assistant-Updater' }
        }, (response) => {
          const status = response.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            const next = response.headers.location;
            if (!next) {
              fail(new Error(`Redirect ${status} without Location header`));
              return;
            }
            // Drain so the socket can be reused / closed cleanly.
            response.resume();
            const absolute = next.startsWith('http') ? next : new URL(next, currentUrl).toString();
            go(absolute, redirectCount + 1);
            return;
          }
          if (status !== 200) {
            fail(new Error(`Failed to download: ${status}`));
            return;
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10);
          if (totalSize > MAX_UPDATE_BYTES) {
            response.destroy(new Error('Update exceeds maximum allowed size'));
            fail(new Error('Update exceeds maximum allowed size'));
            return;
          }
          let downloadedSize = 0;
          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (downloadedSize > MAX_UPDATE_BYTES) {
              response.destroy(new Error('Update exceeds maximum allowed size'));
              fail(new Error('Update exceeds maximum allowed size'));
              return;
            }
            if (this.mainWindow && totalSize > 0) {
              const percent = Math.round((downloadedSize / totalSize) * 100);
              this.mainWindow.webContents.send('update-progress', { percent });
            }
          });
          response.pipe(file);
          file.on('finish', () => {
            if (settled) return;
            settled = true;
            file.close();
            Logger.info(`[UpdateService] Download completed (${downloadedSize} bytes)`);
            resolve();
          });
          file.on('error', (err) => fail(err));
          response.on('error', (err) => fail(err));
        });
        req.setTimeout(60_000, () => req.destroy(new Error('Download request stalled')));
        req.on('error', (err) => fail(err));
      };

      go(url);
    });
  }

  private async installUpdate(dmgPath: string, version: string): Promise<void> {
    Logger.info('🔧 Installing update...');
    
    try {
      // Mount the DMG
      const mountResult = execFileSync('/usr/bin/hdiutil', ['mount', dmgPath], { encoding: 'utf8' });
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

      // Stage the new bundle off-volume first via `ditto` (preserves the
      // code signature, xattrs, and notarization ticket; plain `cp -R`
      // strips these on macOS and Gatekeeper will refuse to relaunch).
      const stagingPath = path.join(require('os').tmpdir(), `jarvis-update-${version}.app`);
      if (fs.existsSync(stagingPath)) fs.rmSync(stagingPath, { recursive: true, force: true });
      execFileSync('/usr/bin/ditto', [sourceApp, stagingPath]);

      // Move existing bundle aside as backup, then move staged into place.
      // Two mv calls are atomic on the same filesystem so we never have a
      // window where /Applications/<App>.app is missing on failure.
      const backupPath = `${appBundle}.backup`;
      if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { recursive: true, force: true });
      execFileSync('/bin/mv', [appBundle, backupPath]);
      try {
        execFileSync('/bin/mv', [stagingPath, appBundle]);
      } catch (mvErr) {
        // Roll back so user isn't left without an app.
        Logger.error('❌ Move-into-place failed, rolling back:', mvErr);
        try { execFileSync('/bin/mv', [backupPath, appBundle]); } catch { /* */ }
        throw mvErr;
      }

      // Verify the new bundle is signed and Gatekeeper-acceptable BEFORE
      // we relaunch. If verification fails, restore from backup.
      try {
        execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appBundle], { stdio: 'pipe' });
      } catch (verifyErr) {
        Logger.error('❌ Code signature verification failed, restoring backup:', verifyErr);
        fs.rmSync(appBundle, { recursive: true, force: true });
        execFileSync('/bin/mv', [backupPath, appBundle]);
        throw new Error('Update bundle failed code signature verification');
      }

      // Cleanup successful: drop the backup, unmount, remove DMG.
      try { fs.rmSync(backupPath, { recursive: true, force: true }); } catch { /* non-fatal */ }
      try { execFileSync('/usr/bin/hdiutil', ['unmount', mountPoint]); } catch { /* non-fatal */ }
      try { fs.unlinkSync(dmgPath); } catch { /* non-fatal */ }

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
