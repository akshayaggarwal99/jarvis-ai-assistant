import { ipcMain, shell, app } from 'electron';
import { Logger } from '../core/logger';
import { AuthService } from '../services/auth-service';
import { WindowManager } from '../services/window-manager';
import { OptimizedAnalyticsManager } from '../analytics/optimized-analytics-manager';
import { nodeDictionaryService } from '../services/node-dictionary';

// Global registry to track registered handlers and prevent duplicates
const registeredHandlers = new Set<string>();

function safeRegisterHandler(event: string, handler: (...args: any[]) => any | Promise<any>) {
  if (registeredHandlers.has(event)) {
    Logger.warning(`[IPCHandlers] Handler for '${event}' already registered, skipping`);
    return;
  }
  
  try {
    ipcMain.handle(event, handler);
    registeredHandlers.add(event);
    Logger.debug(`[IPCHandlers] Successfully registered handler for '${event}'`);
  } catch (error) {
    Logger.error(`[IPCHandlers] Failed to register handler for '${event}':`, error);
  }
}

function safeRegisterListener(event: string, handler: (...args: any[]) => void) {
  const listenerKey = `listener:${event}`;
  if (registeredHandlers.has(listenerKey)) {
    Logger.warning(`[IPCHandlers] Listener for '${event}' already registered, skipping`);
    return;
  }
  
  try {
    ipcMain.on(event, handler);
    registeredHandlers.add(listenerKey);
    Logger.debug(`[IPCHandlers] Successfully registered listener for '${event}'`);
  } catch (error) {
    Logger.error(`[IPCHandlers] Failed to register listener for '${event}':`, error);
  }
}

export class IPCHandlers {
  private static instance: IPCHandlers;
  private handlersRegistered = false;
  
  private authService: AuthService;
  private windowManager: WindowManager;
  private analyticsManager!: OptimizedAnalyticsManager; // Will be set by AppInitializer
  
  private constructor() {
    this.authService = AuthService.getInstance();
    this.windowManager = WindowManager.getInstance();
  }
  
  static getInstance(): IPCHandlers {
    if (!IPCHandlers.instance) {
      IPCHandlers.instance = new IPCHandlers();
    }
    return IPCHandlers.instance;
  }
  
  registerHandlers(): void {
    if (this.handlersRegistered) {
      Logger.warning('[IPCHandlers] Handlers already registered, skipping duplicate registration');
      return;
    }
    
    Logger.info('[IPCHandlers] Starting handler registration...');
    
    try {
      this.registerAuthHandlers();
      Logger.info('[IPCHandlers] Auth handlers registered');
      
      this.registerAnalyticsHandlers();
      Logger.info('[IPCHandlers] Analytics handlers registered');
      
      this.registerDictionaryHandlers();
      Logger.info('[IPCHandlers] Dictionary handlers registered');
      
      this.registerWindowHandlers();
      Logger.info('[IPCHandlers] Window handlers registered');
      
      this.registerMiscHandlers();
      Logger.info('[IPCHandlers] Misc handlers registered');
      
      this.handlersRegistered = true;
      Logger.info('[IPCHandlers] All handlers registered successfully');
    } catch (error) {
      Logger.error('[IPCHandlers] Error registering handlers:', error);
      // Don't set handlersRegistered to true so we can retry
    }
  }
  
  private registerAuthHandlers(): void {
    // Auth handlers are registered in main.ts because they need access to
    // jarvisCore and secureAPI instances for initialization logic
    Logger.info('[IPCHandlers] Auth handlers are registered in main.ts');
  }
  
  private registerAnalyticsHandlers(): void {
    safeRegisterHandler('get-stats', async () => {
      Logger.info('🔍 [IPC] Getting stats from analytics manager...');
      if (!this.analyticsManager) {
        Logger.error('❌ [IPC] Analytics manager not set!');
        return null;
      }
      const stats = await this.analyticsManager.getStats();
      Logger.info(`📊 [IPC] Retrieved stats: ${stats ? `${stats.totalSessions} sessions` : 'null'}`);
      return stats;
    });
    
    safeRegisterHandler('refresh-analytics', async () => {
      Logger.info('🔄 [IPC] Forcing analytics refresh');
      if (!this.analyticsManager) {
        Logger.error('❌ [IPC] Analytics manager not set!');
        return null;
      }
      this.analyticsManager.forceRefreshStats();
      const stats = await this.analyticsManager.getStats();
      Logger.info(`📊 [IPC] Refreshed stats: ${stats ? `${stats.totalSessions} sessions` : 'null'}`);
      return stats;
    });

    // Bridge for renderer-side anonymous-usage events (onboarding funnel,
    // future UI events). Event name + a shallow properties object only.
    // Caller-supplied strings are NOT trusted for routing — capture()
    // forwards verbatim and posthog.ts gates on the Settings toggle.
    safeRegisterHandler('posthog:capture', async (_e, event: string, properties?: Record<string, any>) => {
      try {
        if (typeof event !== 'string' || !event) return false;
        const { posthog } = await import('../analytics/posthog');
        posthog.capture(event, properties && typeof properties === 'object' ? properties : {});
        return true;
      } catch (err) {
        Logger.debug('[IPC] posthog:capture failed (ignored):', err);
        return false;
      }
    });

    // Show or hide the waveform window from the renderer. Used by the
    // onboarding tutorial screens so the user sees the same waveform
    // overlay they'll see in normal use.
    safeRegisterHandler('waveform:show', async () => {
      try {
        const win = this.windowManager.getWindow('waveform');
        if (win && !win.isDestroyed()) win.showInactive();
        return true;
      } catch (err) { Logger.debug('[IPC] waveform:show failed:', err); return false; }
    });
    safeRegisterHandler('waveform:hide', async () => {
      try {
        const win = this.windowManager.getWindow('waveform');
        if (win && !win.isDestroyed() && win.isVisible()) win.hide();
        return true;
      } catch (err) { Logger.debug('[IPC] waveform:hide failed:', err); return false; }
    });

    // Warm the configured local transcription model from the renderer.
    // Called right after the user picks/downloads a model in onboarding or
    // Settings so the first dictation doesn't pay the cold-load tax.
    safeRegisterHandler('model:preload', async () => {
      try {
        const { AppSettingsService } = await import('../services/app-settings-service');
        const settings = AppSettingsService.getInstance().getSettings();
        if (!settings.useLocalModel || !settings.localModelId) return { ok: false, reason: 'not_configured' };

        const { PARAKEET_MODELS } = await import('../transcription/sherpa-models');
        const isParakeet = PARAKEET_MODELS.some(m => m.id === settings.localModelId);

        if (isParakeet) {
          const { SherpaOnnxTranscriber } = await import('../transcription/sherpa-onnx-transcriber');
          const ok = await SherpaOnnxTranscriber.getInstance().preloadModel();
          return { ok, family: 'parakeet' };
        } else {
          const { LocalWhisperTranscriber } = await import('../transcription/local-whisper-transcriber');
          const ok = await new LocalWhisperTranscriber().preloadModel(settings.localModelId);
          return { ok, family: 'whisper' };
        }
      } catch (err) {
        Logger.error('[IPC] model:preload failed:', err);
        return { ok: false, reason: 'error' };
      }
    });
  }
  
  private registerDictionaryHandlers(): void {
    safeRegisterHandler('get-dictionary', async () => {
      try {
        return nodeDictionaryService.getDictionary();
      } catch (error) {
        Logger.error('Failed to get dictionary:', error);
        return [];
      }
    });
    
    safeRegisterHandler('add-dictionary-entry', async (event, word: string, pronunciation?: string) => {
      try {
        const entry = nodeDictionaryService.addEntry(word, pronunciation);
        Logger.info(`Dictionary entry added: ${word}`);
        return entry;
      } catch (error) {
        Logger.error('Failed to add dictionary entry:', error);
        throw error;
      }
    });
    
    safeRegisterHandler('remove-dictionary-entry', async (event, id: string) => {
      try {
        const success = nodeDictionaryService.removeEntry(id);
        Logger.info(`Dictionary entry removed: ${id}`);
        return success;
      } catch (error) {
        Logger.error('Failed to remove dictionary entry:', error);
        throw error;
      }
    });
  }
  
  private registerWindowHandlers(): void {
    safeRegisterListener('close-suggestion', () => {
      this.windowManager.hideWindow('suggestion');
    });
    
    // Note: Analysis overlay handlers are registered by AnalysisOverlayService
    // to avoid duplicate registration
  }
  
  private registerMiscHandlers(): void {
    safeRegisterHandler('open-external', async (_, url: string) => {
      try {
        await shell.openExternal(url);
        return true;
      } catch (error) {
        Logger.error('Failed to open external URL:', error);
        return false;
      }
    });
    
    safeRegisterHandler('shell-open-external', async (_, url: string) => {
      try {
        Logger.info(`🌐 [IPCHandlers] Opening external URL: ${url}`);
        await shell.openExternal(url);
        Logger.info(`✅ [IPCHandlers] Successfully opened external URL`);
        return true;
      } catch (error) {
        Logger.error('❌ [IPCHandlers] Failed to open external URL:', error);
        return false;
      }
    });
  }
  
  setAnalyticsManager(manager: OptimizedAnalyticsManager): void {
    Logger.info('[IPCHandlers] Setting analytics manager');
    this.analyticsManager = manager;
  }
}
