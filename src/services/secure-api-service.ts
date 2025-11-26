import { Logger } from '../core/logger';
import { AppSettingsService } from './app-settings-service';

const cleanKey = (value?: string | null) => (value ?? '').trim() || undefined;

export class SecureAPIService {
  private static instance: SecureAPIService;
  private readonly cache = new Map<string, { key: string; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): SecureAPIService {
    if (!SecureAPIService.instance) {
      SecureAPIService.instance = new SecureAPIService();
    }
    return SecureAPIService.instance;
  }

  /**
   * Backwards compatible no-op. We no longer rely on Firebase auth tokens.
   */
  setAuthToken(): void {
    Logger.debug('🔐 [SecureAPI] Auth tokens are no longer required in the open-source build.');
  }

  async getOpenAIKey(): Promise<string> {
    return this.getProviderKey('openai');
  }

  async getDeepgramKey(): Promise<string> {
    return this.getProviderKey('deepgram');
  }

  async getGeminiKey(): Promise<string> {
    return this.getProviderKey('gemini');
  }

  async getAnthropicKey(): Promise<string> {
    return this.getProviderKey('anthropic');
  }

  async proxyOpenAIRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const key = await this.getProviderKey('openai');
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${key}`);
    headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
    return fetch(url, { ...options, headers });
  }

  async proxyDeepgramRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const key = await this.getProviderKey('deepgram');
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Token ${key}`);
    return fetch(url, { ...options, headers });
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async getProviderKey(cacheKey: string): Promise<string> {
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_DURATION) {
      return cached.key;
    }

    // Get key from app settings (user-configured via UI)
    try {
      const appSettings = AppSettingsService.getInstance();
      const settings = appSettings.getSettings();
      const settingsKeyMap: Record<string, string | undefined> = {
        openai: settings.openaiApiKey,
        deepgram: settings.deepgramApiKey,
        anthropic: settings.anthropicApiKey,
        gemini: settings.geminiApiKey,
      };
      const settingsValue = cleanKey(settingsKeyMap[cacheKey]);
      if (settingsValue) {
        Logger.debug(`[SecureAPI] Using ${cacheKey} key from app settings`);
        this.cache.set(cacheKey, { key: settingsValue, timestamp: now });
        return settingsValue;
      }
    } catch (error) {
      Logger.debug(`[SecureAPI] App settings not available for ${cacheKey}`);
    }

    throw new Error(`${cacheKey} API key is not configured. Please add it in Settings.`);
  }
}
