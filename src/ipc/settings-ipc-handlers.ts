/**
 * Settings IPC Handlers Module
 * 
 * Handles all IPC communication related to app settings and API keys.
 * Extracted from main.ts to improve modularity.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { Logger } from '../core/logger';
import { AppSettingsService } from '../services/app-settings-service';
import { PushToTalkService } from '../input/push-to-talk-refactored';
import fetch from 'node-fetch';

type HotkeyCallback = () => void;

export class SettingsIPCHandlers {
  private static instance: SettingsIPCHandlers;
  private pushToTalkService: PushToTalkService | null = null;
  private waveformWindow: BrowserWindow | null = null;
  private stopHotkeyCallback: HotkeyCallback | null = null;
  private startHotkeyCallback: HotkeyCallback | null = null;
  private handlersRegistered = false;

  private constructor() { }

  static getInstance(): SettingsIPCHandlers {
    if (!SettingsIPCHandlers.instance) {
      SettingsIPCHandlers.instance = new SettingsIPCHandlers();
    }
    return SettingsIPCHandlers.instance;
  }

  setPushToTalkService(service: PushToTalkService | null): void {
    this.pushToTalkService = service;
  }

  setWaveformWindow(window: BrowserWindow | null): void {
    this.waveformWindow = window;
  }

  setHotkeyCallbacks(stop: HotkeyCallback, start: HotkeyCallback): void {
    this.stopHotkeyCallback = stop;
    this.startHotkeyCallback = start;
  }

  registerHandlers(): void {
    if (this.handlersRegistered) {
      Logger.warning('[SettingsIPC] Handlers already registered');
      return;
    }

    const appSettings = AppSettingsService.getInstance();

    // Get app settings (legacy)
    ipcMain.handle('app:get-settings', async () => {
      try {
        return appSettings.getSettings();
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to get app settings:', error);
        return null;
      }
    });

    // Update app settings (legacy)
    ipcMain.handle('app:update-settings', async (_, settings) => {
      try {
        Logger.info('[SettingsIPC] Received app:update-settings:', JSON.stringify(settings));
        const previousSettings = appSettings.getSettings();

        appSettings.updateSettings(settings);

        // Log if local whisper settings changed
        if (settings.useLocalWhisper !== undefined) {
          Logger.info(`[SettingsIPC] Local Whisper setting changed to: ${settings.useLocalWhisper}`);
          // When local whisper is enabled, disable streaming mode
          if (settings.useLocalWhisper && this.pushToTalkService) {
            this.pushToTalkService.setStreamingMode(false);
            Logger.info('[SettingsIPC] Streaming disabled due to Local Whisper enabled');
          } else if (!settings.useLocalWhisper && this.pushToTalkService) {
            // Re-enable streaming if local whisper is disabled and Deepgram streaming is enabled
            const currentSettings = appSettings.getSettings();
            this.pushToTalkService.setStreamingMode(currentSettings.useDeepgramStreaming);
            Logger.info(`[SettingsIPC] Streaming mode restored to: ${currentSettings.useDeepgramStreaming}`);
          }
        }
        if (settings.localWhisperModel !== undefined) {
          Logger.info(`[SettingsIPC] Local Whisper model changed to: ${settings.localWhisperModel}`);
        }

        // If hotkey setting changed, restart monitoring
        if (settings.hotkey !== undefined && settings.hotkey !== previousSettings.hotkey) {
          Logger.info(`[SettingsIPC] Hotkey changed to ${settings.hotkey}, restarting monitoring...`);
          this.restartHotkeyMonitoring();
        }

        // If audioFeedback setting changed, update waveform and restart
        if (settings.audioFeedback !== undefined && settings.audioFeedback !== previousSettings.audioFeedback) {
          Logger.info(`[SettingsIPC] Audio feedback changed to ${settings.audioFeedback}`);
          this.waveformWindow?.webContents.send('audio-feedback-setting', settings.audioFeedback);
          this.restartHotkeyMonitoring();
        }

        // Handle showWaveform changes - hide waveform window immediately when disabled
        if (settings.showWaveform !== undefined && !settings.showWaveform) {
          if (this.waveformWindow && !this.waveformWindow.isDestroyed()) {
            this.waveformWindow.hide();
          }
        }

        return true;
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to update app settings:', error);
        return false;
      }
    });

    // Get app settings (new API)
    ipcMain.handle('app-settings:get', async () => {
      return appSettings.getSettings();
    });

    // Update app settings (new API)
    ipcMain.handle('app-settings:update', async (_, updates) => {
      try {
        Logger.info('[SettingsIPC] Received settings update:', updates);
        const previousSettings = appSettings.getSettings();

        appSettings.updateSettings(updates);

        // Handle streaming mode changes
        if ('useDeepgramStreaming' in updates) {
          const currentSettings = appSettings.getSettings();
          if (this.pushToTalkService) {
            // Only enable streaming if local whisper is also disabled
            const shouldStream = currentSettings.useDeepgramStreaming && !currentSettings.useLocalWhisper;
            this.pushToTalkService.setStreamingMode(shouldStream);
            Logger.info(`[SettingsIPC] Streaming mode updated - Deepgram: ${currentSettings.useDeepgramStreaming}, LocalWhisper: ${currentSettings.useLocalWhisper}, Streaming: ${shouldStream}`);
          }
        }

        // Handle local whisper changes - affects streaming mode
        if ('useLocalWhisper' in updates) {
          const currentSettings = appSettings.getSettings();
          if (this.pushToTalkService) {
            // When local whisper is enabled, disable streaming
            const shouldStream = currentSettings.useDeepgramStreaming && !currentSettings.useLocalWhisper;
            this.pushToTalkService.setStreamingMode(shouldStream);
            Logger.info(`[SettingsIPC] Local Whisper changed - Streaming mode: ${shouldStream}`);
          }
        }

        // If hotkey changed, restart monitoring
        if (updates.hotkey && updates.hotkey !== previousSettings.hotkey) {
          Logger.info(`[SettingsIPC] Hotkey changed to ${updates.hotkey} - restarting monitoring`);
          this.restartHotkeyMonitoring(250);
        }

        // Handle showWaveform changes - hide waveform window immediately when disabled
        if ('showWaveform' in updates && !updates.showWaveform) {
          if (this.waveformWindow && !this.waveformWindow.isDestroyed()) {
            this.waveformWindow.hide();
          }
        }

        Logger.success('[SettingsIPC] Settings updated successfully');
        return true;
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to update app settings:', error);
        return false;
      }
    });

    // Get auto-launch status
    ipcMain.handle('app-settings:get-auto-launch-status', async () => {
      return appSettings.getAutoLaunchStatus();
    });

    // Sync auto-launch setting
    ipcMain.handle('app-settings:sync-auto-launch', async () => {
      appSettings.syncAutoLaunchSetting();
      return true;
    });

    // Get API keys
    ipcMain.handle('api-keys:get', async () => {
      try {
        const settings = appSettings.getSettings();
        return {
          openaiApiKey: settings.openaiApiKey || '',
          deepgramApiKey: settings.deepgramApiKey || '',
          anthropicApiKey: settings.anthropicApiKey || '',
          geminiApiKey: settings.geminiApiKey || '',
          awsAccessKeyId: settings.awsAccessKeyId || '',
          awsSecretAccessKey: settings.awsSecretAccessKey || '',
          awsRegion: settings.awsRegion || '',
        };
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to get API keys:', error);
        return { openaiApiKey: '', deepgramApiKey: '', anthropicApiKey: '', geminiApiKey: '', awsAccessKeyId: '', awsSecretAccessKey: '', awsRegion: '' };
      }
    });

    // Verify Ollama connection and get models
    ipcMain.handle('ollama:get-models', async (_, url) => {
      const tryFetchModels = async (fetchUrl: string) => {
        Logger.info(`[SettingsIPC] Attempting fetch from: ${fetchUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(`${fetchUrl}/api/tags`, {
            signal: controller.signal as any
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status}`);
          }

          const data = await response.json() as { models: Array<{ name: string }> };
          const names = (data.models || []).map(m => m.name);
          Logger.info(`[SettingsIPC] Ollama returned ${names.length} models: ${names.join(', ')}`);
          return names;
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      };

      try {
        const baseUrl = (url || 'http://localhost:11434').replace(/\/$/, '');

        try {
          const models = await tryFetchModels(baseUrl);
          return { success: true, models: models };
        } catch (firstError) {
          if (baseUrl.includes('localhost')) {
            const fallbackUrl = baseUrl.replace('localhost', '127.0.0.1');
            Logger.info(`[SettingsIPC] Localhost failed, trying fallback: ${fallbackUrl}`);
            try {
              const models = await tryFetchModels(fallbackUrl);
              return { success: true, models: models };
            } catch (secondError) {
              throw secondError;
            }
          }
          throw firstError;
        }
      } catch (error) {
        const err = error as Error;
        Logger.error(`[SettingsIPC] Ollama connection failed: ${err.message}`);
        return { success: false, error: err.message };
      }
    });

    // Save API keys
    ipcMain.handle('api-keys:save', async (_, keys: {
      openaiApiKey?: string;
      deepgramApiKey?: string;
      anthropicApiKey?: string;
      geminiApiKey?: string;
      awsAccessKeyId?: string;
      awsSecretAccessKey?: string;
      awsRegion?: string;
    }) => {
      try {
        Logger.info('[SettingsIPC] Saving API keys...');

        const updates: Record<string, string | undefined> = {};
        if (keys.openaiApiKey !== undefined) updates.openaiApiKey = keys.openaiApiKey;
        if (keys.deepgramApiKey !== undefined) updates.deepgramApiKey = keys.deepgramApiKey;
        if (keys.anthropicApiKey !== undefined) updates.anthropicApiKey = keys.anthropicApiKey;
        if (keys.geminiApiKey !== undefined) updates.geminiApiKey = keys.geminiApiKey;
        if (keys.awsAccessKeyId !== undefined) updates.awsAccessKeyId = keys.awsAccessKeyId;
        if (keys.awsSecretAccessKey !== undefined) updates.awsSecretAccessKey = keys.awsSecretAccessKey;
        if (keys.awsRegion !== undefined) updates.awsRegion = keys.awsRegion;

        appSettings.updateSettings(updates);

        // Clear API cache so new keys are used
        const { SecureAPIService } = await import('../services/secure-api-service');
        SecureAPIService.getInstance().clearCache();

        Logger.success('[SettingsIPC] API keys saved successfully');
        return true;
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to save API keys:', error);
        return false;
      }
    });

    // Streaming mode handlers
    ipcMain.handle('set-streaming-mode', async (_, enabled: boolean) => {
      try {
        Logger.info(`[SettingsIPC] Setting streaming mode to: ${enabled}`);
        appSettings.updateSettings({ useDeepgramStreaming: enabled });

        if (this.pushToTalkService) {
          this.pushToTalkService.setStreamingMode(enabled);
        }

        return { success: true };
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to set streaming mode:', error);
        return { success: false, error: String(error) };
      }
    });

    ipcMain.handle('get-streaming-mode', async () => {
      const settings = appSettings.getSettings();
      return { enabled: settings.useDeepgramStreaming };
    });

    // Whisper model management handlers
    ipcMain.handle('whisper:get-downloaded-models', async () => {
      try {
        const { LocalWhisperTranscriber } = await import('../transcription/local-whisper-transcriber');
        const transcriber = new LocalWhisperTranscriber();
        return transcriber.getDownloadedModels();
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to get downloaded models:', error);
        return [];
      }
    });

    ipcMain.handle('whisper:is-model-downloaded', async (_, modelId: string) => {
      try {
        const { LocalWhisperTranscriber } = await import('../transcription/local-whisper-transcriber');
        const transcriber = new LocalWhisperTranscriber();
        return transcriber.isModelDownloaded(modelId);
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to check model:', error);
        return false;
      }
    });

    ipcMain.handle('whisper:download-model', async (event, modelId: string) => {
      try {
        const { LocalWhisperTranscriber } = await import('../transcription/local-whisper-transcriber');
        const transcriber = new LocalWhisperTranscriber();

        // Send progress updates to renderer
        const result = await transcriber.downloadModel(modelId, (percent, downloadedMB, totalMB) => {
          event.sender.send('whisper:download-progress', { modelId, percent, downloadedMB, totalMB });
        });

        return { success: result };
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to download model:', error);
        return { success: false, error: String(error) };
      }
    });

    // Sherpa-ONNX model management handlers
    ipcMain.handle('sherpa:get-downloaded-models', async () => {
      try {
        const { SherpaModelDownloader } = await import('../transcription/sherpa-model-downloader');
        const downloader = new SherpaModelDownloader();
        return downloader.getDownloadedModels();
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to get downloaded Sherpa models:', error);
        return [];
      }
    });

    ipcMain.handle('sherpa:is-model-downloaded', async (_, modelId: string) => {
      try {
        const { SherpaModelDownloader } = await import('../transcription/sherpa-model-downloader');
        const downloader = new SherpaModelDownloader();
        return downloader.isModelDownloaded(modelId);
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to check Sherpa model:', error);
        return false;
      }
    });

    ipcMain.handle('sherpa:download-model', async (event, modelId: string) => {
      try {
        const { SherpaModelDownloader } = await import('../transcription/sherpa-model-downloader');
        const downloader = new SherpaModelDownloader();

        // Send progress updates to renderer
        const result = await downloader.downloadModel(modelId, (percent, downloadedMB, totalMB) => {
          event.sender.send('sherpa:download-progress', { modelId, percent, downloadedMB, totalMB });
        });

        return { success: result };
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to download Sherpa model:', error);
        return { success: false, error: String(error) };
      }
    });

    this.handlersRegistered = true;
    Logger.info('[SettingsIPC] All handlers registered');
  }

  private restartHotkeyMonitoring(delay = 200): void {
    if (this.stopHotkeyCallback) {
      this.stopHotkeyCallback();
    }

    if (this.startHotkeyCallback) {
      setTimeout(() => {
        this.startHotkeyCallback?.();
      }, delay);
    }
  }
}
