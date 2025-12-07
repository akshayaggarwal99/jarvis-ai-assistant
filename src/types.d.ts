declare module 'node-record-lpcm16' {
  export function record(options: any): any;
}

interface ElectronAPI {
  getStats: () => Promise<any>;
  onStatsUpdate: (callback: (stats: any) => void) => void;
  pasteLastTranscription: () => void;
  startDictation: () => void;
  closeApp: () => void;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<boolean>;
  onOAuthCallback: (callback: (data: { code?: string; state?: string; token?: string }) => void) => void;
  completeOnboarding: () => Promise<boolean>;
  checkOnboardingStatus: () => Promise<boolean>;
  resetOnboarding: () => Promise<boolean>;
  cleanupOnboarding: () => Promise<boolean>;
  startFnKeyMonitor: () => Promise<boolean>;
  stopFnKeyMonitor: () => Promise<void>;
  onFnKeyEvent: (event: 'down' | 'up', callback: () => void) => void;
  
  // Key monitoring methods
  onFnKeyStateChange: (callback: (event: any, isPressed: boolean) => void) => void;
  setHotkey: (key: string) => Promise<void>;
  
  // Sound playback methods
  playSound: (soundType: string) => Promise<boolean>;
  
  // Tutorial mode methods
  setVoiceTutorialMode?: (enabled: boolean) => void;
  setEmailTutorialMode?: (enabled: boolean) => void;
  
  // IPC renderer for auth callbacks
  ipcRenderer: {
    on: (channel: string, callback: (...args: any[]) => void) => void;
    removeListener: (channel: string, callback: (...args: any[]) => void) => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
