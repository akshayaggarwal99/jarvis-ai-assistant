/**
 * UpdateIPCHandlers - Handles app update-related IPC communication
 */
import { app, ipcMain } from 'electron';
import { Logger } from '../core/logger';
import { UpdateService } from '../services/update-service';

export class UpdateIPCHandlers {
  private static instance: UpdateIPCHandlers;
  
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
    ipcMain.handle('check-for-updates', () => {
      Logger.info('🔍 Manual update check requested');
      if (this.updateService) {
        this.updateService.forceCheckForUpdates();
      }
    });
    
    ipcMain.handle('download-update', (_, { downloadUrl, version }) => {
      Logger.info('📥 Download update requested:', version);
      if (this.updateService) {
        this.updateService.downloadUpdate(downloadUrl, version);
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
    
    Logger.info('✅ UpdateIPCHandlers registered');
  }
}
