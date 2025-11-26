import { BrowserWindow } from 'electron';
import { Logger } from '../core/logger';
import { WindowManager } from './window-manager';
import { AppState } from './app-state';
import { SecureAPIService } from '../services/secure-api-service';

export interface Transcript {
  id: number;
  text: string;
  timestamp: string;
  suggestion?: string;
}

export class TranscriptionService {
  private static instance: TranscriptionService;
  private windowManager: WindowManager;
  private appState: AppState;
  private transcripts: Transcript[] = [];
  private transcriptIdCounter = 0;
  
  private constructor() {
    this.windowManager = WindowManager.getInstance();
    this.appState = AppState.getInstance();
  }
  
  public static getInstance(): TranscriptionService {
    if (!TranscriptionService.instance) {
      TranscriptionService.instance = new TranscriptionService();
    }
    return TranscriptionService.instance;
  }
  
  public handleTranscriptionReady(transcription: string, shouldPaste: boolean = true, shouldMinimize: boolean = true): void {
    Logger.info(`📝 [Transcription] Ready: "${transcription}" (paste: ${shouldPaste}, minimize: ${shouldMinimize})`);
    
    // Save last transcription globally for menu paste
    (global as any).lastTranscription = transcription;
    
    // Create transcript record
    const transcript: Transcript = {
      id: ++this.transcriptIdCounter,
      text: transcription,
      timestamp: new Date().toISOString()
    };
    
    this.transcripts.push(transcript);
    
    // Keep only last 100 transcripts
    if (this.transcripts.length > 100) {
      this.transcripts.shift();
    }
    
    // Minimize windows
    if (shouldMinimize) {
      this.minimizeWindows();
    }
    
    // Send to dashboard and nudge service
    this.sendTranscriptionToWindows(transcription);
    
    // Paste if required
    if (shouldPaste) {
      this.pasteTranscription(transcription);
    }
  }
  
  private minimizeWindows(): void {
    const waveformWindow = this.windowManager.getWindow('waveform');
    const suggestionWindow = this.windowManager.getWindow('suggestion');
    
    if (waveformWindow && waveformWindow.isVisible()) {
      waveformWindow.hide();
    }
    
    if (suggestionWindow && suggestionWindow.isVisible()) {
      suggestionWindow.hide();
    }
  }
  
  private sendTranscriptionToWindows(transcription: string): void {
    // Send to dashboard
    const dashboardWindow = this.windowManager.getWindow('dashboard');
    if (dashboardWindow) {
      dashboardWindow.webContents.send('new-transcription', transcription);
    }
    
    // Send to nudge service
    this.windowManager.sendToAllWindows('nudge-transcription', transcription);
  }
  
  private async pasteTranscription(transcription: string): Promise<void> {
    try {
      const { AudioProcessor } = require('../audio/processor');
      await AudioProcessor.pasteText(transcription);
      Logger.info('✅ [Transcription] Text pasted successfully');
    } catch (error) {
      Logger.error('❌ [Transcription] Failed to paste text:', error);
    }
  }
  
  public async generateSuggestion(transcriptId: number): Promise<void> {
    const transcript = this.transcripts.find(t => t.id === transcriptId);
    if (!transcript) {
      Logger.warning(`[Suggestion] Transcript not found: ${transcriptId}`);
      return;
    }
    
    if (transcript.suggestion) {
      Logger.info('[Suggestion] Already has suggestion, sending it');
      this.windowManager.sendToAllWindows('suggestion-ready', {
        transcriptId,
        suggestion: transcript.suggestion
      });
      return;
    }
    
    try {
      Logger.info(`[Suggestion] Generating for transcript ${transcriptId}`);
      
      // TODO: Integrate with context detection service
      const context = 'Current screen context';
      const apiKey = await SecureAPIService.getInstance().getOpenAIKey();
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful AI assistant. Provide brief, contextual suggestions based on the user\'s transcribed text and current screen context.'
            },
            {
              role: 'user',
              content: `Context: ${context}\n\nTranscribed text: "${transcript.text}"\n\nProvide a brief suggestion or response.`
            }
          ],
          max_tokens: 150,
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      const suggestion = data.choices[0].message.content.trim();
      
      // Store suggestion
      transcript.suggestion = suggestion;
      
      // Send to windows
      this.windowManager.sendToAllWindows('suggestion-ready', {
        transcriptId,
        suggestion
      });
      
      Logger.success(`[Suggestion] Generated successfully for transcript ${transcriptId}`);
    } catch (error) {
      Logger.error('[Suggestion] Generation failed:', error);
      this.windowManager.sendToAllWindows('suggestion-error', {
        transcriptId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  public getTranscripts(): Transcript[] {
    return this.transcripts;
  }
  
  public getLastTranscription(): string | null {
    return (global as any).lastTranscription || null;
  }
}
