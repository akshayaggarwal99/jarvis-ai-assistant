import { contextBridge, ipcRenderer } from 'electron';

// Preload side-effect import sets up IPC bridge for renderer/main

contextBridge.exposeInMainWorld('electronAPI', {
  getStats: () => ipcRenderer.invoke('get-stats'),
  refreshAnalytics: () => ipcRenderer.invoke('refresh-analytics'),
  onStatsUpdate: (callback: (stats: any) => void) => {
    console.log('📊 [Preload] Setting up onStatsUpdate listener');
    ipcRenderer.on('stats-update', (_event, stats) => {
      console.log('📊 [Preload] Received stats-update event:', stats);
      callback(stats);
    });
  },
  pasteLastTranscription: () => ipcRenderer.send('paste-last-transcription'),
  getLastTranscription: () => ipcRenderer.invoke('get-last-transcription'),
  setVoiceTutorialMode: (enabled: boolean) => ipcRenderer.send('set-voice-tutorial-mode', enabled),
  setEmailTutorialMode: (enabled: boolean) => ipcRenderer.send('set-email-tutorial-mode', enabled),
  onTutorialTranscription: (callback: (text: string) => void) => {
    ipcRenderer.on('tutorial-transcription', (event, text) => callback(text));
  },
  startDictation: () => ipcRenderer.send('start-dictation'),
  closeApp: () => ipcRenderer.send('close-app'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  onOAuthCallback: (callback: (data: { code: string; state: string }) => void) => {
    ipcRenderer.on('oauth-callback', (_event, data) => callback(data));
  },
  completeOnboarding: () => ipcRenderer.invoke('complete-onboarding'),
  checkOnboardingStatus: () => ipcRenderer.invoke('check-onboarding-status'),
  resetOnboarding: () => ipcRenderer.invoke('reset-onboarding'),
  cleanupOnboarding: () => ipcRenderer.invoke('cleanup-onboarding'),
  startFnKeyMonitor: () => ipcRenderer.invoke('start-fn-key-monitor'),
  stopFnKeyMonitor: () => ipcRenderer.invoke('stop-fn-key-monitor'),
  startHotkeyMonitoring: () => ipcRenderer.invoke('start-hotkey-monitoring'),
  stopHotkeyMonitoring: () => ipcRenderer.invoke('stop-hotkey-monitoring'),
  onFnKeyEvent: (event: 'down' | 'up', callback: () => void) => {
    ipcRenderer.on(`fn-key-${event}`, callback);
  },
  onFnKeyStateChange: (callback: (event: any, isPressed: boolean) => void) => {
    console.log('🎯 [Preload] Setting up onFnKeyStateChange listener');
    // Listen for Fn key state changes for tutorial purposes
    ipcRenderer.on('fn-key-state-change', (event, isPressed) => {
      console.log('🎯 [Preload] Received fn-key-state-change event:', { isPressed });
      callback(event, isPressed);
    });
  },

  // Push-to-talk state handlers for tutorial screens
  onPushToTalkStateChange: (callback: (isActive: boolean) => void) => {
    console.log('🎯 [Preload] Setting up onPushToTalkStateChange listener');
    ipcRenderer.on('push-to-talk-state-change', (_event, isActive) => {
      console.log('🎯 [Preload] Received push-to-talk-state-change event:', { isActive });
      callback(isActive);
    });
  },

  onTranscriptionStateChange: (callback: (isTranscribing: boolean) => void) => {
    console.log('🎯 [Preload] Setting up onTranscriptionStateChange listener');
    ipcRenderer.on('transcription-state-change', (_event, isTranscribing) => {
      console.log('🎯 [Preload] Received transcription-state-change event:', { isTranscribing });
      callback(isTranscribing);
    });
  },

  // User authentication
  logout: () => ipcRenderer.invoke('logout'),

  // Auth state persistence
  saveAuthState: (authState: any) => ipcRenderer.invoke('save-auth-state', authState),
  loadAuthState: () => ipcRenderer.invoke('load-auth-state'),
  clearAuthState: () => ipcRenderer.invoke('clear-auth-state'),
  validateAuthState: () => ipcRenderer.invoke('validate-auth-state'),

  // Permission requests
  requestMicrophonePermission: () => ipcRenderer.invoke('request-microphone-permission'),
  requestAccessibilityPermission: () => ipcRenderer.invoke('request-accessibility-permission'),
  requestNotificationPermission: () => ipcRenderer.invoke('request-notification-permission'),
  checkPermissionStatus: (permission: string) => ipcRenderer.invoke('check-permission-status', permission),

  // Permission monitoring
  startPermissionMonitoring: () => ipcRenderer.send('start-permission-monitoring'),
  stopPermissionMonitoring: () => ipcRenderer.send('stop-permission-monitoring'),
  onPermissionStatusChange: (callback: (permission: string, status: string) => void) => {
    ipcRenderer.on('permission-status-changed', (_event, permission, status) => callback(permission, status));
  },

  // Dictionary methods
  getDictionary: () => ipcRenderer.invoke('get-dictionary'),
  addDictionaryEntry: (word: string, pronunciation?: string) => ipcRenderer.invoke('add-dictionary-entry', word, pronunciation),
  removeDictionaryEntry: (id: string) => ipcRenderer.invoke('remove-dictionary-entry', id),

  // Testing methods
  getLogFilePath: () => ipcRenderer.invoke('get-log-file-path'),

  // Nudge service methods
  nudgeRecordTyping: () => ipcRenderer.invoke('nudge:record-typing'),
  nudgeRecordJarvisUsage: () => ipcRenderer.invoke('nudge:record-jarvis-usage'),
  nudgeGetConfig: () => ipcRenderer.invoke('nudge:get-config'),
  nudgeUpdateConfig: (config: any) => ipcRenderer.invoke('nudge:update-config', config),
  nudgeSnooze: () => ipcRenderer.invoke('nudge:snooze'),
  nudgeClose: () => ipcRenderer.invoke('nudge:close'),
  nudgeEnableGlobalTyping: () => ipcRenderer.invoke('nudge:enable-global-typing'),
  nudgeResetDaily: () => ipcRenderer.invoke('nudge:reset-daily'),

  // Nudge settings methods
  nudgeGetSettings: () => ipcRenderer.invoke('nudge:get-settings'),
  nudgeUpdateSettings: (settings: any) => {
    console.log('[Preload] nudgeUpdateSettings called with:', settings);
    if (!settings || typeof settings !== 'object') {
      console.error('[Preload] Invalid settings passed to nudgeUpdateSettings:', settings);
      return Promise.reject(new Error('Invalid settings: must be an object'));
    }
    return ipcRenderer.invoke('nudge:update-settings', settings);
  },

  // App settings methods
  appGetSettings: () => ipcRenderer.invoke('app:get-settings'),
  getUserSettings: () => ipcRenderer.invoke('app:get-settings'), // Alias for getUserSettings
  appUpdateSettings: (settings: any) => ipcRenderer.invoke('app:update-settings', settings),
  setHotkey: (hotkey: string) => ipcRenderer.invoke('app:update-settings', { hotkey }),
  getCurrentSettings: () => ipcRenderer.invoke('app-settings:get'),
  appGetAutoLaunchStatus: () => ipcRenderer.invoke('app-settings:get-auto-launch-status'),
  appSyncAutoLaunch: () => ipcRenderer.invoke('app-settings:sync-auto-launch'),

  // Ollama
  ollamaGetModels: (url: string) => ipcRenderer.invoke('ollama:get-models', url),

  // API Key methods (stored locally, never uploaded)
  getApiKeys: () => ipcRenderer.invoke('api-keys:get'),
  saveApiKeys: (keys: {
    openaiApiKey?: string;
    deepgramApiKey?: string;
    anthropicApiKey?: string;
    geminiApiKey?: string;
    awsAccessKeyId?: string;
    awsSecretAccessKey?: string;
    awsRegion?: string;
  }) =>
    ipcRenderer.invoke('api-keys:save', keys),

  // Whisper model management
  whisperGetDownloadedModels: () => ipcRenderer.invoke('whisper:get-downloaded-models'),
  whisperIsModelDownloaded: (modelId: string) => ipcRenderer.invoke('whisper:is-model-downloaded', modelId),
  whisperDownloadModel: (modelId: string) => ipcRenderer.invoke('whisper:download-model', modelId),
  onWhisperDownloadProgress: (callback: (data: { modelId: string; percent: number; downloadedMB: number; totalMB: number }) => void) => {
    ipcRenderer.on('whisper:download-progress', (_event, data) => callback(data));
  },
  removeWhisperDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners('whisper:download-progress');
  },

  // Sound playback methods
  playSound: (soundType: string) => ipcRenderer.invoke('play-sound', soundType),

  // Shell methods for opening URLs
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell-open-external', url)
  },

  // Update methods
  downloadUpdate: (data: { downloadUrl: string; version: string }) => ipcRenderer.invoke('download-update', data),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  restartApp: () => ipcRenderer.invoke('restart-app'),

  // Expose ipcRenderer for auth callbacks
  ipcRenderer: {
    on: (channel: string, callback: (...args: any[]) => void) => {
      ipcRenderer.on(channel, callback);
    },
    removeListener: (channel: string, callback: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, callback);
    }
  }
});
