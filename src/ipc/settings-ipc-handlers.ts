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

type HotkeyCallback = () => void;

export class SettingsIPCHandlers {
  private static instance: SettingsIPCHandlers;
  private pushToTalkService: PushToTalkService | null = null;
  private waveformWindow: BrowserWindow | null = null;
  private stopHotkeyCallback: HotkeyCallback | null = null;
  private startHotkeyCallback: HotkeyCallback | null = null;
  private handlersRegistered = false;

  private constructor() {}

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
        Logger.info('[SettingsIPC] Received app:update-settings:', settings);
        const previousSettings = appSettings.getSettings();
        
        appSettings.updateSettings(settings);
        
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
            this.pushToTalkService.setStreamingMode(currentSettings.useDeepgramStreaming);
            Logger.info(`[SettingsIPC] Streaming mode updated - Deepgram: ${currentSettings.useDeepgramStreaming}`);
          }
        }
        
        // If hotkey changed, restart monitoring
        if (updates.hotkey && updates.hotkey !== previousSettings.hotkey) {
          Logger.info(`[SettingsIPC] Hotkey changed to ${updates.hotkey} - restarting monitoring`);
          this.restartHotkeyMonitoring(250);
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
        };
      } catch (error) {
        Logger.error('[SettingsIPC] Failed to get API keys:', error);
        return { openaiApiKey: '', deepgramApiKey: '', anthropicApiKey: '', geminiApiKey: '' };
      }
    });

    // Save API keys
    ipcMain.handle('api-keys:save', async (_, keys: { 
      openaiApiKey?: string; 
      deepgramApiKey?: string; 
      anthropicApiKey?: string; 
      geminiApiKey?: string 
    }) => {
      try {
        Logger.info('[SettingsIPC] Saving API keys...');
        
        const updates: Record<string, string | undefined> = {};
        if (keys.openaiApiKey !== undefined) updates.openaiApiKey = keys.openaiApiKey;
        if (keys.deepgramApiKey !== undefined) updates.deepgramApiKey = keys.deepgramApiKey;
        if (keys.anthropicApiKey !== undefined) updates.anthropicApiKey = keys.anthropicApiKey;
        if (keys.geminiApiKey !== undefined) updates.geminiApiKey = keys.geminiApiKey;
        
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
