import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { defaultDictationPrompt, defaultEmailFormattingPrompt, defaultAssistantPrompt } from '../prompts/prompts';
import { SecretName, SecretStore } from './secret-store';

interface AppSettings {
  audioFeedback: boolean;
  showOnStartup: boolean; // Controls auto-launch on Mac login
  analytics: boolean;
  hotkey: string;
  aiPostProcessing: boolean;
  useDeepgramStreaming: boolean;

  // Unified Local Transcription Settings
  useLocalModel: boolean; // General toggle for local transcription (replaces useLocalWhisper/useParakeet)
  localModelId: string; // ID of the selected local model (Whisper or Parakeet)

  downloadedParakeetModels: string[]; // List of downloaded Parakeet model IDs
  privacyConsentGiven: boolean; // User has explicitly consented to third-party data processing
  privacyConsentDate?: string; // When consent was given
  userName?: string; // User's name for email signatures
  showWaveform: boolean; // Show/hide waveform window during recording
  // API Keys (stored locally, never uploaded)
  openaiApiKey?: string;
  deepgramApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  // AWS Bedrock credentials
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  // Ollama Settings
  useOllama?: boolean;
  ollamaUrl?: string;
  ollamaModel?: string;
  // Audio Device Settings
  preferredMicrophone?: string; // Device ID of preferred microphone (null = system default)
  transcriptionLanguage?: string; // Language code for transcription (e.g., 'en-US', 'es', 'fr')
  // Custom Prompts
  customDictationPrompt?: string;
  customEmailPrompt?: string;
  customAssistantPrompt?: string;
  // Jarvis 2.0 waitlist banner
  jarvis2BannerDismissed?: boolean;
  // Founder support / share banner
  supportBannerDismissed?: boolean;
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
      audioFeedback: false,
      // Privacy-sensitive behavior must be explicitly enabled by the user.
      showOnStartup: false,
      analytics: false,
      hotkey: 'fn',
      aiPostProcessing: false,
      useDeepgramStreaming: false,

      // Unified defaults
      useLocalModel: false,
      localModelId: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',

      downloadedParakeetModels: [],
      privacyConsentGiven: false, // User must explicitly consent
      showWaveform: true, // Show waveform by default
      useOllama: false,
      ollamaUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'llama3.2:1b',
      customDictationPrompt: defaultDictationPrompt,
      customEmailPrompt: defaultEmailFormattingPrompt,
      customAssistantPrompt: defaultAssistantPrompt,
      transcriptionLanguage: 'en-US'
    };
  }

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        const parsed = JSON.parse(data);

        // MIGRATION LOGIC
        // Check for legacy fields and migrate to new unified fields if needed
        if (parsed.useLocalWhisper !== undefined) {
          if (parsed.useLocalWhisper) {
            parsed.useLocalModel = true;
            parsed.localModelId = parsed.localWhisperModel || 'tiny.en';
          }
          delete parsed.useLocalWhisper;
          delete parsed.localWhisperModel;
        }

        if (parsed.useParakeet !== undefined) {
          if (parsed.useParakeet) {
            if (!parsed.useLocalModel) { // Only override if local whisper wasn't already set to true
              parsed.useLocalModel = true;
              parsed.localModelId = parsed.parakeetModel || 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8';
            }
          }
          delete parsed.useParakeet;
          delete parsed.parakeetModel;
        }

        // 1.3.6 changed the default for showOnStartup from false to true.
        // Existing users who never explicitly set the field would get
        // surprised by a sudden login-item registration — preserve their
        // old behavior. If they ever toggled it (true or false), parsed
        // will carry the value; only force the legacy default when the
        // field is genuinely absent.
        if (parsed.showOnStartup === undefined) {
          parsed.showOnStartup = false;
        }

        const settings = { ...this.getDefaultSettings(), ...parsed };

        // Migrate command key to fn key (command key is no longer supported)
        if (settings.hotkey === 'command') {
          settings.hotkey = 'fn';
        }

        return settings;
      }
      return this.getDefaultSettings();
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

      const persisted = { ...this.settings } as Record<string, unknown>;
      for (const name of this.getSecretNames()) {
        delete persisted[name];
      }

      fs.writeFileSync(this.settingsPath, JSON.stringify(persisted, null, 2), { mode: 0o600 });
      fs.chmodSync(this.settingsPath, 0o600);
    } catch (error) {
      console.error('[AppSettings] Failed to save settings:', error);
    }
  }

  /**
   * Get all current settings
   */
  public getSettings(): AppSettings {
    // Always reload from disk to get fresh settings
    this.settings = this.loadSettings();
    const secretStore = SecretStore.getInstance();
    const legacySecrets: Partial<Record<SecretName, string>> = {};
    for (const name of this.getSecretNames()) {
      const legacyValue = this.settings[name]?.trim();
      if (legacyValue) {
        legacySecrets[name] = legacyValue;
      }
    }

    if (Object.keys(legacySecrets).length > 0) {
      try {
        secretStore.setMany(legacySecrets);
        this.saveSettings();
      } catch {
        // Keep legacy credentials available in memory when OS encryption is unavailable.
      }
    }

    for (const name of this.getSecretNames()) {
      this.settings[name] = secretStore.get(name) ?? this.settings[name];
    }
    return { ...this.settings };
  }

  /**
   * Update specific settings
   */
  public updateSettings(updates: Partial<AppSettings>): void {
    const sanitizedUpdates = { ...updates };
    const secretUpdates: Partial<Record<SecretName, string | undefined>> = {};
    for (const name of this.getSecretNames()) {
      if (sanitizedUpdates[name] !== undefined) {
        secretUpdates[name] = sanitizedUpdates[name];
        delete sanitizedUpdates[name];
      }
    }
    if (Object.keys(secretUpdates).length > 0) {
      SecretStore.getInstance().setMany(secretUpdates);
    }

    this.settings = { ...this.settings, ...sanitizedUpdates };
    this.saveSettings();

    // Handle auto-launch setting change
    if (updates.showOnStartup !== undefined) {
      this.updateAutoLaunch(updates.showOnStartup);
    }

    // Any change to keys / local-model toggle could flip dictation
    // readiness. Re-broadcast so the renderer can clear (or re-show) the
    // setup banner without waiting for the next Fn-press.
    const setupRelevant =
      secretUpdates.openaiApiKey !== undefined ||
      secretUpdates.deepgramApiKey !== undefined ||
      secretUpdates.geminiApiKey !== undefined ||
      updates.useLocalModel !== undefined ||
      updates.localModelId !== undefined;
    if (setupRelevant) {
      // Dynamic import to avoid circular dep (SetupStatusService reads us back).
      import('./setup-status-service').then(({ SetupStatusService }) => {
        try { SetupStatusService.getInstance().broadcast(); } catch { /* */ }
      }).catch(() => { /* */ });
    }
  }

  private getSecretNames(): SecretName[] {
    return [
      'openaiApiKey',
      'deepgramApiKey',
      'anthropicApiKey',
      'geminiApiKey',
      'awsAccessKeyId',
      'awsSecretAccessKey'
    ];
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
