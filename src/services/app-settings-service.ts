import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface AppSettings {
  audioFeedback: boolean;
  showOnStartup: boolean; // Controls auto-launch on Mac login
  analytics: boolean;
  hotkey: string;
  aiPostProcessing: boolean;
  useDeepgramStreaming: boolean;
  privacyConsentGiven: boolean; // User has explicitly consented to third-party data processing
  privacyConsentDate?: string; // When consent was given
  // API Keys (stored locally, never uploaded)
  openaiApiKey?: string;
  deepgramApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
}

/**
 * Service for managing general app settings (non-nudge related)
 */
export class AppSettingsService {
  private static instance: AppSettingsService;
  private settings: AppSettings;
  private settingsPath: string;

  private constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'app-settings.json');
    this.settings = this.loadSettings();
  }

  public static getInstance(): AppSettingsService {
    if (!AppSettingsService.instance) {
      AppSettingsService.instance = new AppSettingsService();
    }
    return AppSettingsService.instance;
  }

  private getDefaultSettings(): AppSettings {
    return {
      audioFeedback: true,
      showOnStartup: false,
      analytics: true,
      hotkey: 'fn',
      aiPostProcessing: true,
      useDeepgramStreaming: true,
      privacyConsentGiven: false // User must explicitly consent
    };
  }

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        const parsed = JSON.parse(data);
        const settings = { ...this.getDefaultSettings(), ...parsed };
        
        // Migrate command key to fn key (command key is no longer supported)
        if (settings.hotkey === 'command') {
          settings.hotkey = 'fn';
        }
        
        return settings;
      }
    } catch (error) {
      console.error('[AppSettings] Failed to load settings:', error);
    }
    return this.getDefaultSettings();
  }

  private saveSettings(): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('[AppSettings] Failed to save settings:', error);
    }
  }

  /**
   * Get all current settings
   */
  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  /**
   * Update specific settings
   */
  public updateSettings(updates: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
    
    // Handle auto-launch setting change
    if (updates.showOnStartup !== undefined) {
      this.updateAutoLaunch(updates.showOnStartup);
    }
  }

  /**
   * Update the auto-launch setting using Electron's login item API
   */
  private updateAutoLaunch(enabled: boolean): void {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        name: 'Jarvis AI Assistant',
        path: process.execPath,
        args: []
      });
    } catch (error) {
      console.error('[AppSettings] Failed to update auto-launch setting:', error);
    }
  }

  /**
   * Get the current auto-launch status from the system
   */
  public getAutoLaunchStatus(): boolean {
    try {
      const loginSettings = app.getLoginItemSettings();
      return loginSettings.openAtLogin;
    } catch (error) {
      console.error('[AppSettings] Failed to get auto-launch status:', error);
      return false;
    }
  }

  /**
   * Sync the showOnStartup setting with the actual system state
   */
  public syncAutoLaunchSetting(): void {
    const systemStatus = this.getAutoLaunchStatus();
    if (this.settings.showOnStartup !== systemStatus) {
      this.settings.showOnStartup = systemStatus;
      this.saveSettings();
    }
  }

  /**
   * Give privacy consent for third-party data processing
   */
  public givePrivacyConsent(): void {
    this.settings.privacyConsentGiven = true;
    this.settings.privacyConsentDate = new Date().toISOString();
    this.saveSettings();
  }

  /**
   * Revoke privacy consent - this will disable core functionality
   */
  public revokePrivacyConsent(): void {
    this.settings.privacyConsentGiven = false;
    this.settings.privacyConsentDate = undefined;
    this.saveSettings();
  }

  /**
   * Check if user has given privacy consent
   */
  public hasPrivacyConsent(): boolean {
    return this.settings.privacyConsentGiven;
  }

  /**
   * Get when privacy consent was given
   */
  public getPrivacyConsentDate(): string | undefined {
    return this.settings.privacyConsentDate;
  }
}
