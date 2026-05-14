/**
 * DictationIPCHandlers - Handles dictation-related IPC communication
 */
import { ipcMain } from 'electron';
import { Logger } from '../core/logger';
import { AudioProcessor } from '../audio/processor';
import { PushToTalkService } from '../input/push-to-talk-refactored';
import { OptimizedAnalyticsManager } from '../analytics/optimized-analytics-manager';

export class DictationIPCHandlers {
  private static instance: DictationIPCHandlers;
  private handlersRegistered = false;

  private pushToTalkService: PushToTalkService | null = null;
  private transcripts: any[] = [];
  private createDashboardWindowFn: (() => void) | null = null;
  private setDictationModeFn: ((mode: boolean) => void) | null = null;
  private isHandsFreeModeActiveRef: { value: boolean } = { value: false };
  private analyticsManager: OptimizedAnalyticsManager | null = null;
  
  private constructor() {}
  
  static getInstance(): DictationIPCHandlers {
    if (!DictationIPCHandlers.instance) {
      DictationIPCHandlers.instance = new DictationIPCHandlers();
    }
    return DictationIPCHandlers.instance;
  }
  
  setPushToTalkService(service: PushToTalkService | null): void {
    this.pushToTalkService = service;
  }
  
  setTranscripts(transcripts: any[]): void {
    this.transcripts = transcripts;
  }
  
  setCallbacks(
    createDashboardWindow: () => void,
    setDictationMode: (mode: boolean) => void,
    isHandsFreeModeActiveRef: { value: boolean }
  ): void {
    this.createDashboardWindowFn = createDashboardWindow;
    this.setDictationModeFn = setDictationMode;
    this.isHandsFreeModeActiveRef = isHandsFreeModeActiveRef;
  }

  setAnalyticsManager(manager: OptimizedAnalyticsManager): void {
    this.analyticsManager = manager;
  }
  
  registerHandlers(): void {
    if (this.handlersRegistered) {
      Logger.warning('Dictation IPC handlers already registered, skipping');
      return;
    }

    // Legacy dictation handlers (redirect to push-to-talk)
    ipcMain.on('start-dictation', () => {
      Logger.info('Starting push-to-talk recording');
    });
    
    ipcMain.on('stop-dictation', () => {
      Logger.info('Stopping push-to-talk recording');
    });
    
    // Dashboard window
    ipcMain.on('create-dashboard-window', () => {
      if (this.createDashboardWindowFn) {
        this.createDashboardWindowFn();
      }
    });
    
    // Manual dictation (hands-free mode)
    ipcMain.on('start-dictation-manual', async () => {
      if (this.pushToTalkService) {
        (this.pushToTalkService as any).isHandsFreeMode = true;
        await this.pushToTalkService.start();
      }
    });
    
    ipcMain.on('stop-dictation-manual', async () => {
      if (this.pushToTalkService) {
        await this.pushToTalkService.stop();
        (this.pushToTalkService as any).isHandsFreeMode = false;
      }
      this.isHandsFreeModeActiveRef.value = false;
      if (this.setDictationModeFn) {
        this.setDictationModeFn(false);
      }
    });
    
    // Transcript history
    ipcMain.on('get-transcript-history', (event) => {
      event.reply('transcript-history', this.transcripts);
    });
    
    // Paste last transcription
    ipcMain.on('paste-last-transcription', async () => {
      const lastTranscription = (global as any).lastTranscription;
      if (lastTranscription?.trim()) {
        try {
          await AudioProcessor.pasteText(lastTranscription);
        } catch (error) {
          Logger.error('Dashboard paste failed:', error);
        }
      }
    });
    
    // Get last transcription
    ipcMain.handle('get-last-transcription', async () => {
      const lastTranscription = (global as any).lastTranscription;
      return lastTranscription || '';
    });

    // Recent dictation sessions + lifetime stats for the Dictation view.
    // Returns { sessions, stats } in one round-trip.
    ipcMain.handle('dictation:recent', async (_event, limit?: number) => {
      try {
        if (!this.analyticsManager) {
          return { sessions: [], stats: null };
        }
        const max = typeof limit === 'number' && limit > 0 ? Math.min(limit, 500) : 50;
        const stats = await this.analyticsManager.getStats();
        const storage: any = (this.analyticsManager as any).storage;
        const userId: string = this.analyticsManager.getCurrentUserId();
        const sessions = storage?.getUserSessions
          ? await storage.getUserSessions(userId, max)
          : [];
        return { sessions, stats };
      } catch (err) {
        Logger.error('[dictation:recent] failed:', err);
        return { sessions: [], stats: null };
      }
    });

    this.handlersRegistered = true;
    Logger.info('✅ DictationIPCHandlers registered');
  }
}
