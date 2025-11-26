/**
 * Permission IPC Handlers Module
 * 
 * Handles all IPC communication related to system permissions.
 * Extracted from main.ts to improve modularity.
 */

import { ipcMain, systemPreferences, shell } from 'electron';
import { Logger } from '../core/logger';

export class PermissionIPCHandlers {
  private static instance: PermissionIPCHandlers;
  private handlersRegistered = false;

  private constructor() {}

  static getInstance(): PermissionIPCHandlers {
    if (!PermissionIPCHandlers.instance) {
      PermissionIPCHandlers.instance = new PermissionIPCHandlers();
    }
    return PermissionIPCHandlers.instance;
  }

  registerHandlers(): void {
    if (this.handlersRegistered) {
      Logger.warning('[PermissionIPC] Handlers already registered');
      return;
    }

    // Check permission status
    ipcMain.handle('check-permission-status', async (_, permission: string) => {
      try {
        switch (permission) {
          case 'microphone':
            const micStatus = systemPreferences.getMediaAccessStatus('microphone');
            Logger.info(`[Permissions] Microphone status: ${micStatus}`);
            return { status: micStatus, granted: micStatus === 'granted' };
            
          case 'accessibility':
            const accessibilityStatus = systemPreferences.isTrustedAccessibilityClient(false);
            Logger.info(`[Permissions] Accessibility status: ${accessibilityStatus}`);
            return { status: accessibilityStatus ? 'granted' : 'denied', granted: accessibilityStatus };
            
          case 'notifications':
            return { status: 'unknown', granted: false };
            
          default:
            Logger.warning(`[Permissions] Unknown permission type: ${permission}`);
            return { status: 'unknown', granted: false };
        }
      } catch (error) {
        Logger.error(`[Permissions] Failed to check ${permission} permission:`, error);
        return { status: 'error', granted: false };
      }
    });

    // Request microphone permission
    ipcMain.handle('request-microphone-permission', async () => {
      try {
        Logger.info('[Permissions] Requesting microphone permission...');
        const status = await systemPreferences.askForMediaAccess('microphone');
        Logger.info(`[Permissions] Microphone permission result: ${status}`);
        
        return { granted: status, status: status ? 'granted' : 'denied' };
      } catch (error) {
        Logger.error('[Permissions] Failed to request microphone permission:', error);
        return { granted: false, status: 'error' };
      }
    });

    // Request accessibility permission
    ipcMain.handle('request-accessibility-permission', async () => {
      try {
        Logger.info('[Permissions] Checking accessibility permission...');
        const hasAccess = systemPreferences.isTrustedAccessibilityClient(true);
        
        if (!hasAccess) {
          Logger.info('[Permissions] Opening System Preferences for accessibility...');
          await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
          
          return { 
            granted: false, 
            status: 'pending',
            message: 'Please grant accessibility permission in System Preferences and restart the app'
          };
        }
        
        Logger.info('[Permissions] Accessibility permission already granted');
        return { granted: true, status: 'granted' };
      } catch (error) {
        Logger.error('[Permissions] Failed to request accessibility permission:', error);
        return { granted: false, status: 'error' };
      }
    });

    // Request notification permission (handled by renderer)
    ipcMain.handle('request-notification-permission', async () => {
      try {
        Logger.info('[Permissions] Notification permission handled by renderer');
        return { granted: false, status: 'renderer-handled' };
      } catch (error) {
        Logger.error('[Permissions] Failed to handle notification permission:', error);
        return { granted: false, status: 'error' };
      }
    });

    this.handlersRegistered = true;
    Logger.info('[PermissionIPC] All handlers registered');
  }
}
