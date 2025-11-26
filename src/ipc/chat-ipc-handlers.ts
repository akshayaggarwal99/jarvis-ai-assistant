/**
 * ChatIPCHandlers - Handles chat-related IPC communication
 */
import { ipcMain } from 'electron';
import { Logger } from '../core/logger';
import { JarvisCore } from '../core/jarvis-core';

export class ChatIPCHandlers {
  private static instance: ChatIPCHandlers;
  
  private jarvisCoreRef: { value: JarvisCore | null } = { value: null };
  
  private constructor() {}
  
  static getInstance(): ChatIPCHandlers {
    if (!ChatIPCHandlers.instance) {
      ChatIPCHandlers.instance = new ChatIPCHandlers();
    }
    return ChatIPCHandlers.instance;
  }
  
  setJarvisCoreRef(ref: { value: JarvisCore | null }): void {
    this.jarvisCoreRef = ref;
  }
  
  registerHandlers(): void {
    // Process chat message for analysis overlay
    ipcMain.handle('process-chat-message', async (_, messageData: {
      message: string;
      screenContext: string;
      chatHistory: Array<{role: string; content: string}>;
    }) => {
      try {
        Logger.info('▶ Processing chat message:', { 
          message: messageData, 
          hasContext: !!messageData.screenContext 
        });
        
        return new Promise((resolve, reject) => {
          let fullResponse = '';
          
          const onToken = (token: string) => {
            fullResponse += token;
          };
          
          const onComplete = (finalText: string) => {
            const response = finalText || fullResponse;
            Logger.info('● Chat response generated:', { responseLength: response.length });
            resolve({ success: true, content: response });
          };
          
          const onError = (error: Error) => {
            Logger.error('✖ Chat LLM error:', error);
            reject({ success: false, error: error.message });
          };
          
          if (this.jarvisCoreRef.value) {
            this.jarvisCoreRef.value.processChat(
              messageData.message, 
              messageData.screenContext, 
              onToken, 
              onComplete, 
              onError
            );
          } else {
            reject({ success: false, error: 'JarvisCore not available' });
          }
        });
      } catch (error) {
        Logger.error('✖ Error processing chat message:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });
    
    // Voice chat recording handlers (use global hotkey)
    ipcMain.handle('start-voice-chat-recording', async () => {
      return { 
        success: true, 
        message: 'Use the global hotkey (Fn key) to record voice messages. The transcription will appear in the chat input.' 
      };
    });
    
    ipcMain.handle('stop-voice-chat-recording', async () => {
      return { 
        success: true, 
        message: 'Voice recording managed by global hotkey' 
      };
    });
    
    Logger.info('✅ ChatIPCHandlers registered');
  }
}
