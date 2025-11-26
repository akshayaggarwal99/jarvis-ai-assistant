/**
 * DictationIPCHandlers - Handles dictation-related IPC communication
 */
import { ipcMain } from 'electron';
import { Logger } from '../core/logger';
import { AudioProcessor } from '../audio/processor';
import { PushToTalkService } from '../input/push-to-talk-refactored';

export class DictationIPCHandlers {
  private static instance: DictationIPCHandlers;
  
  private pushToTalkService: PushToTalkService | null = null;
  private transcripts: any[] = [];
  private createDashboardWindowFn: (() => void) | null = null;
  private setDictationModeFn: ((mode: boolean) => void) | null = null;
  private isHandsFreeModeActiveRef: { value: boolean } = { value: false };
  
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
  
  registerHandlers(): void {
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
    
    // Push-to-talk recording with timing control
    ipcMain.on('start-push-to-talk-recording', async () => {
      Logger.debug('🔊 [Audio] Starting push-to-talk recording (after sound delay)');
      if (this.pushToTalkService) {
        await this.pushToTalkService.start();
      }
    });
    
    ipcMain.on('stop-push-to-talk-recording', async () => {
      Logger.debug('🔊 [Audio] Stopping push-to-talk recording (before stop sound)');
      if (this.pushToTalkService) {
        await this.pushToTalkService.stop();
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
    
    Logger.info('✅ DictationIPCHandlers registered');
  }
}
