/**
 * Nudge IPC Handlers Module
 * 
 * Handles all IPC communication related to the nudge/reminder service.
 * Extracted from main.ts to improve modularity.
 */

import { ipcMain } from 'electron';
import { Logger } from '../core/logger';
import { UserNudgeService } from '../nudge';
import { SoundPlayer } from '../utils/sound-player';

export class NudgeIPCHandlers {
  private static instance: NudgeIPCHandlers;
  private userNudgeService: UserNudgeService | null = null;
  private soundPlayer: SoundPlayer;
  private handlersRegistered = false;

  private constructor() {
    this.soundPlayer = SoundPlayer.getInstance();
  }

  static getInstance(): NudgeIPCHandlers {
    if (!NudgeIPCHandlers.instance) {
      NudgeIPCHandlers.instance = new NudgeIPCHandlers();
    }
    return NudgeIPCHandlers.instance;
  }

  setNudgeService(service: UserNudgeService | null): void {
    this.userNudgeService = service;
  }

  registerHandlers(): void {
    if (this.handlersRegistered) {
      Logger.warning('[NudgeIPC] Handlers already registered');
      return;
    }

    // Record typing handler (legacy - now handled natively)
    ipcMain.handle('nudge:record-typing', async () => {
      if (this.userNudgeService) {
        this.userNudgeService.dismissNudgeExplicitly();
      }
    });

    // Record Jarvis usage
    ipcMain.handle('nudge:record-jarvis-usage', async () => {
      if (this.userNudgeService) {
        this.userNudgeService.recordJarvisUsage();
      }
    });

    // Get nudge config
    ipcMain.handle('nudge:get-config', async () => {
      if (this.userNudgeService) {
        return this.userNudgeService.getConfig();
      }
      return null;
    });

    // Update nudge config
    ipcMain.handle('nudge:update-config', async (_, config) => {
      if (this.userNudgeService) {
        this.userNudgeService.updateConfig(config);
        return true;
      }
      return false;
    });

    // Snooze nudge
    ipcMain.handle('nudge:snooze', async () => {
      if (this.userNudgeService) {
        this.userNudgeService.snooze();
        return true;
      }
      return false;
    });

    // Sound playback handler
    ipcMain.handle('play-sound', async (_, soundType: string) => {
      try {
        if (soundType === 'key-press') {
          await this.soundPlayer.playStartSound();
        } else if (soundType === 'key-release') {
          await this.soundPlayer.playStopSound();
        } else if (soundType === 'celebration') {
          await this.soundPlayer.playCelebrationSound();
        }
        return true;
      } catch (error) {
        Logger.error('[NudgeIPC] Failed to play sound:', error);
        return false;
      }
    });

    // Close nudge window
    ipcMain.handle('nudge:close', async () => {
      if (this.userNudgeService) {
        this.userNudgeService.dismissNudge();
      }
    });

    // Enable global typing detection (now handled natively)
    ipcMain.handle('nudge:enable-global-typing', async () => {
      Logger.info('[Nudge] Global typing detection is now handled natively');
      return true;
    });

    // Reset typing counter
    ipcMain.handle('nudge:reset-counter', async () => {
      if (this.userNudgeService) {
        this.userNudgeService.resetNudgeCounter();
        Logger.info('[Nudge IPC] Counter reset - nudges will show again');
        return true;
      }
      return false;
    });

    // Debug status
    ipcMain.handle('nudge:debug-status', async () => {
      if (this.userNudgeService) {
        this.userNudgeService.debugStatus();
        return true;
      }
      return false;
    });

    // Force disable nudge
    ipcMain.handle('nudge:force-disable', async () => {
      if (this.userNudgeService) {
        this.userNudgeService.forceDisable();
        Logger.info('[Nudge IPC] Nudges force-disabled via IPC');
        return true;
      }
      return false;
    });

    // Get nudge settings for dashboard
    ipcMain.handle('nudge:get-settings', async () => {
      if (this.userNudgeService) {
        return this.userNudgeService.getNudgeSettings();
      }
      return null;
    });

    // Update nudge settings from dashboard
    ipcMain.handle('nudge:update-settings', async (_, settings) => {
      if (!settings || typeof settings !== 'object') {
        Logger.error('[NudgeIPC] Invalid settings provided');
        return { success: false, error: 'Invalid settings: must be an object' };
      }
      
      if (!this.userNudgeService) {
        Logger.error('[NudgeIPC] userNudgeService not available');
        return { success: false, error: 'Nudge service not available' };
      }
      
      try {
        this.userNudgeService.updateNudgeSettings(settings);
        return { success: true };
      } catch (error) {
        Logger.error('[NudgeIPC] Error in updateNudgeSettings:', error);
        return { success: false, error: error.message };
      }
    });

    this.handlersRegistered = true;
    Logger.info('[NudgeIPC] All handlers registered');
  }
}
