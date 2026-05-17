/**
 * UpdateIPCHandlers - Handles app update-related IPC communication
 */
import { app, ipcMain } from 'electron';
import { Logger } from '../core/logger';
import { UpdateService } from '../services/update-service';

export class UpdateIPCHandlers {
  private static instance: UpdateIPCHandlers;
  private handlersRegistered = false;
  
  private updateService: UpdateService | null = null;
  
  private constructor() {}
  
  static getInstance(): UpdateIPCHandlers {
    if (!UpdateIPCHandlers.instance) {
      UpdateIPCHandlers.instance = new UpdateIPCHandlers();
    }
    return UpdateIPCHandlers.instance;
  }
  
  setUpdateService(service: UpdateService): void {
    this.updateService = service;
  }
  
  registerHandlers(): void {
    if (this.handlersRegistered) {
      Logger.warning('Update IPC handlers already registered, skipping');
      return;
    }

    ipcMain.handle('check-for-updates', () => {
      Logger.info('🔍 Manual update check requested');
      if (this.updateService) {
        this.updateService.forceCheckForUpdates();
      }
    });
    
    ipcMain.handle('download-update', async (_, { downloadUrl, version }) => {
      Logger.info('📥 Download update requested:', version);
      if (!this.updateService) {
        return { ok: false, reason: 'no-update-service' };
      }
      try {
        await this.updateService.downloadUpdate(downloadUrl, version);
        return { ok: true };
      } catch (err: any) {
        Logger.error('[IPC] download-update failed:', err);
        return { ok: false, error: err?.message || 'unknown' };
      }
    });
    
    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });
    
    ipcMain.handle('restart-app', () => {
      Logger.info('🔄 Restarting app via IPC request...');
      app.relaunch();
      app.exit(0);
    });
    
    this.handlersRegistered = true;
    Logger.info('Update IPC handlers registered');
  }
}
