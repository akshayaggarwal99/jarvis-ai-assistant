import { contextBridge, ipcRenderer } from 'electron';

const SEND_CHANNELS = new Set([
  'close-suggestion',
  'start-dictation-manual',
  'stop-dictation-manual',
  'hide-analysis-overlay'
]);

const INVOKE_CHANNELS = new Set(['process-chat-message']);

const RECEIVE_CHANNELS = new Set([
  'suggestion-data',
  'audio-level',
  'push-to-talk-start',
  'push-to-talk-stop',
  'push-to-talk-cancel',
  'dictation-start',
  'dictation-stop',
  'transcription-start',
  'transcription-complete',
  'audio-feedback-setting',
  'show-network-error',
  'play-stop-sound',
  'recording-status',
  'analysis-result',
  'reset-to-analyzing'
]);

contextBridge.exposeInMainWorld('jarvisOverlay', {
  send(channel: string, ...args: unknown[]) {
    if (!SEND_CHANNELS.has(channel)) {
      throw new Error('IPC channel is not allowed');
    }
    ipcRenderer.send(channel, ...args);
  },
  invoke(channel: string, ...args: unknown[]) {
    if (!INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(new Error('IPC channel is not allowed'));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    if (!RECEIVE_CHANNELS.has(channel)) {
      throw new Error('IPC channel is not allowed');
    }
    ipcRenderer.on(channel, (_event, ...args) => callback(undefined, ...args));
  }
});
