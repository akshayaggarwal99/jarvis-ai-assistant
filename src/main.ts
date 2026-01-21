// Import Logger first
import { Logger } from './core/logger';

// Simple error handlers
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception in main process', error);
});

process.on('unhandledRejection', (reason) => {
  Logger.error('Unhandled Promise Rejection in main process', new Error(`${reason}`));
});

import { SecureAPIService } from './services/secure-api-service';
import { UpdateService } from './services/update-service';
import { AppSettingsService } from './services/app-settings-service';
import { PrivacyConsentService } from './services/privacy-consent-service';
import { PowerManagementService } from './services/power-management-service';
import { agentManager } from './core/agent-manager';
import { AuthService, AuthState } from './services/auth-service';
import { WindowManager } from './services/window-manager';
import { AnalysisOverlayService } from './services/analysis-overlay-service';
import { AppState } from './services/app-state';
import { MenuService } from './services/menu-service';
import { ShortcutService } from './services/shortcut-service';
import { TranscriptionService } from './services/transcription-service';
import { AppLifecycleService } from './services/app-lifecycle-service';
import { StartupOptimizer } from './services/startup-optimizer';
import { LocalWhisperTranscriber } from './transcription/local-whisper-transcriber';

// Load environment variables with multiple fallback paths
// Remove hardcoded fallback - keys must come from secure service

try {
  // Try loading from current directory first
  require('dotenv').config();

  // Set auto-paste to true by default (can be overridden in .env)
  if (!process.env.AUTO_PASTE) {
    process.env.AUTO_PASTE = 'true';
    Logger.info('Auto-paste enabled by default (set AUTO_PASTE=false to disable)');
  }

} catch (error) {
  Logger.warning('Error loading .env for configuration:', error);
}

import { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, Menu, nativeImage, shell, nativeTheme, systemPreferences } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Get auth service instance
const authService = AuthService.getInstance();

// Re-export for compatibility
export const loadAuthState = () => authService.loadAuthState();

import { OptimizedAnalyticsManager } from './analytics/optimized-analytics-manager';
import { JarvisCore, SuggestionResult } from './core/jarvis-core';
import { IPCHandlers } from './ipc/ipc-handlers';
import { NudgeIPCHandlers } from './ipc/nudge-ipc-handlers';
import { PermissionIPCHandlers } from './ipc/permission-ipc-handlers';
import { SettingsIPCHandlers } from './ipc/settings-ipc-handlers';
import { OnboardingIPCHandlers } from './ipc/onboarding-ipc-handlers';
import { DictationIPCHandlers } from './ipc/dictation-ipc-handlers';
import { UpdateIPCHandlers } from './ipc/update-ipc-handlers';
import { AuthIPCHandlers } from './ipc/auth-ipc-handlers';
import { ChatIPCHandlers } from './ipc/chat-ipc-handlers';
import { ContextDetector } from './context/context-detector';
import { UniversalKeyService } from './input/universal-key-service';
import { PushToTalkService } from './input/push-to-talk-refactored';
import { AudioProcessor } from './audio/processor';
import { nodeDictionaryService } from './services/node-dictionary';
import { UserNudgeService } from './nudge';
import { SoundPlayer } from './utils/sound-player';

// Get service instances
const windowManager = WindowManager.getInstance();
const analysisOverlayService = AnalysisOverlayService.getInstance();
const appState = AppState.getInstance();
const menuService = MenuService.getInstance();
const shortcutService = ShortcutService.getInstance();
const transcriptionService = TranscriptionService.getInstance();
const appLifecycleService = AppLifecycleService.getInstance();
const startupOptimizer = StartupOptimizer.getInstance();

// Window references - using getters to maintain compatibility
let suggestionWindow: BrowserWindow | null = null;
let waveformWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;
let analysisOverlayWindow: BrowserWindow | null = null;

// Helper functions for window access
const getWaveformWindow = () => waveformWindow || windowManager.getWindow('waveform');
const getDashboardWindow = () => dashboardWindow || windowManager.getWindow('dashboard');
const getSuggestionWindow = () => suggestionWindow || windowManager.getWindow('suggestion');
const getAnalysisOverlayWindow = () => analysisOverlayWindow || windowManager.getWindow('analysisOverlay');

// tray is now managed by MenuService
let contextDetector = new ContextDetector();
let transcripts: Array<{ id: number; text: string; timestamp: string; suggestion?: string }> = [];
let jarvisCore: JarvisCore;
let currentSessionId: string | null = null;
let conversationContext: string[] = [];
let currentAudioFile: string | null = null;
let universalKeyService: UniversalKeyService | null = null;
let pushToTalkService: PushToTalkService | null = null;
let isVoiceTutorialMode = false; // Track if we're in voice tutorial mode
let isEmailTutorialMode = false; // Track if we're in email tutorial mode
let analyticsManager = new OptimizedAnalyticsManager();
let updateService = new UpdateService();
let userNudgeService: UserNudgeService | null = null;
let privacyConsentService = PrivacyConsentService.getInstance();
let isHotkeyMonitoringActive = false;
let lastActiveHotkey: string | null = null;

// Initialize IPC handlers and register them immediately
const ipcHandlers = IPCHandlers.getInstance();
ipcHandlers.setAnalyticsManager(analyticsManager);

// Register analytics IPC handlers if available
if (analyticsManager) {
  ipcHandlers.setAnalyticsManager(analyticsManager);
}
ipcHandlers.registerHandlers();

// Register settings IPC handlers
SettingsIPCHandlers.getInstance().registerHandlers();

// Register dictation IPC handlers
DictationIPCHandlers.getInstance().registerHandlers();

// Register permission IPC handlers
PermissionIPCHandlers.getInstance().registerHandlers();

// Register update IPC handlers
UpdateIPCHandlers.getInstance().setUpdateService(updateService);
UpdateIPCHandlers.getInstance().registerHandlers();

// Register nudge IPC handlers
NudgeIPCHandlers.getInstance().registerHandlers();

Logger.info('📊 [IPC] IPC handlers registered at module initialization');
// Dictation mode is now tracked in AppState service
let soundPlayer = SoundPlayer.getInstance();

// Set updateService in menuService
menuService.setUpdateService(updateService);

// Set the hotkey stop callback for lifecycle service
appLifecycleService.setHotkeyStopCallback(stopHotkeyMonitoring);

// Register hotkey stop callback
appLifecycleService.setHotkeyStopCallback(() => stopHotkeyMonitoring());

// Fn key state tracking
let lastFnKeyTime = 0;
let fnKeyPressed = false;
let spaceKeyPressed = false;
let pendingSingleTapTimeout: NodeJS.Timeout | null = null; // For delaying single-tap processing
let isHandsFreeModeActive = false;
let pendingHandsFreeStop = false; // Prevent multiple stop requests

const DEMO_MODE = process.env.DEMO_MODE === 'true';

// Setup global listeners once
function setupGlobalListeners() {
  // Remove any existing listeners to avoid duplicates
  analyticsManager.removeAllListeners('stats-update');

  // Set up real-time stats updates listener
  analyticsManager.onStatsUpdate((stats) => {
    Logger.info(`📊 [Analytics] Real-time stats update received in main.ts, sessions: ${stats?.totalSessions}`);
    // Get the current dashboard window from windowManager
    const currentDashboard = windowManager.getWindow('dashboard');
    if (currentDashboard && !currentDashboard.isDestroyed()) {
      Logger.info('📊 [Analytics] Sending stats update to dashboard window');
      currentDashboard.webContents.send('stats-update', stats);
      Logger.info('📊 [Analytics] Stats update sent to dashboard');
    }
  });

  Logger.info(`📊 [Analytics] Global stats update listener registered`);
}

async function initializeJarvis() {
  try {
    // Initialize secure API service
    const secureAPI = SecureAPIService.getInstance();

    // OPEN SOURCE: API keys loaded from .env file or local server

    // Get API keys from local environment
    const openaiKey = await secureAPI.getOpenAIKey();
    let geminiKey = '';
    let anthropicKey = '';

    try {
      geminiKey = await secureAPI.getGeminiKey();
    } catch (error) {
      Logger.warning('GEMINI_API_KEY not available - some features may be limited');
    }

    try {
      anthropicKey = await secureAPI.getAnthropicKey();
    } catch (error) {
      Logger.warning('ANTHROPIC_API_KEY not available - some features may be limited');
    }

    // Initialize Jarvis Core with secure keys AND local Ollama settings
    const appSettings = AppSettingsService.getInstance();
    const settings = appSettings.getSettings();

    jarvisCore = new JarvisCore(
      openaiKey,
      geminiKey,
      anthropicKey,
      settings.useOllama,
      settings.ollamaUrl,
      settings.ollamaModel
    );
    await jarvisCore.initialize();
    Logger.success('Jarvis Core initialized successfully');

    // Initialize persistent agent for better performance and live agent experience
    try {
      await agentManager.initialize(openaiKey, geminiKey, {
        useOllama: settings.useOllama,
        ollamaUrl: settings.ollamaUrl,
        ollamaModel: settings.ollamaModel
      });
      Logger.success('★ Jarvis Agent initialized and ready for live interactions');
    } catch (error) {
      Logger.warning('▲ Failed to initialize Jarvis Agent - will fallback to on-demand creation:', error);
    }

    // Initialize user nudge service after core initialization
    if (!userNudgeService) {
      userNudgeService = UserNudgeService.getInstance();
      Logger.info('◉ [Nudge] User nudge service initialized');

      // Set nudge service on already-registered IPC handlers
      NudgeIPCHandlers.getInstance().setNudgeService(userNudgeService);
    }

    // Set up global listeners
    setupGlobalListeners();

    // Preload Whisper model for faster transcription (runs in background)
    const appSettingsForWhisper = AppSettingsService.getInstance();
    const whisperSettings = appSettingsForWhisper.getSettings();
    if (whisperSettings.useLocalWhisper && whisperSettings.localWhisperModel) {
      const whisperTranscriber = new LocalWhisperTranscriber();
      whisperTranscriber.preloadModel(whisperSettings.localWhisperModel).then(success => {
        if (success) {
          Logger.success(`🎤 Whisper model '${whisperSettings.localWhisperModel}' preloaded for fast transcription`);
        } else {
          Logger.info('🎤 Whisper model preload skipped (model not downloaded)');
        }
      }).catch(err => {
        Logger.error('🎤 Failed to preload Whisper model:', err);
      });
    } else {
      Logger.info('🎤 Whisper preload skipped (local transcription disabled or no model selected)');
    }
  } catch (error) {
    Logger.error('Failed to initialize Jarvis Core:', error);
  }
}

function createSuggestionWindow() {
  suggestionWindow = windowManager.createSuggestionWindow();
}

function createWaveformWindow() {
  waveformWindow = windowManager.createWaveformWindow();
  // Pass waveform window reference to SettingsIPCHandlers for show/hide control
  SettingsIPCHandlers.getInstance().setWaveformWindow(waveformWindow);
}

function createDashboardWindow() {
  const dashboardWindow = windowManager.createDashboardWindow();

  // Optimize window loading with proper state management
  dashboardWindow.once('ready-to-show', async () => {
    try {
      updateService.setMainWindow(dashboardWindow!);

      const savedAuthState = loadAuthState();
      if (savedAuthState) {
        Logger.info('⟲ [Startup] Restoring auth state before showing dashboard:', savedAuthState.uid);

        // Set user ID in analytics immediately
        await analyticsManager.setUserId(savedAuthState.uid);
        Logger.info('● [Startup] Restored user ID in analytics manager:', savedAuthState.uid);

        // Send the auth state to the renderer for UI update FIRST
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
          dashboardWindow.webContents.send('auth:restore', savedAuthState);
          Logger.info('📤 [Startup] Sent auth state to renderer for restoration');
        }

        // Show window immediately after auth state is sent
        dashboardWindow?.show();
        dashboardWindow?.focus();

        // Mark app as initialized
        startupOptimizer.markInitialized();

        // Defer heavy operations to prevent blocking the UI
        startupOptimizer.deferTask(async () => {
          try {
            // Pre-load analytics data in background
            Logger.info('▶ [Startup] Pre-loading analytics data...');
            await analyticsManager.getStats();
            Logger.info('● [Startup] Analytics data pre-loaded');

            // Check if onboarding is completed and activate overlays if needed
            const onboardingCompleted = hasCompletedOnboarding();
            if (onboardingCompleted) {
              Logger.info('🚀 [Startup] Auth restored and onboarding completed - activating overlays');
              await activateOverlaysAndShortcuts();
            } else {
              Logger.info('⏳ [Startup] Auth restored but onboarding not completed - preparing for tutorials');
            }
          } catch (error) {
            Logger.error('✖ [Startup] Failed to complete background initialization:', error);
          }
        });

      } else {
        Logger.info('◆ [Startup] No saved auth state found - user will need to sign in');
        // Show window immediately for login flow
        dashboardWindow?.show();
        dashboardWindow?.focus();

        // Mark app as initialized
        startupOptimizer.markInitialized();
      }
    } catch (error) {
      Logger.error('✖ [Startup] Failed to restore auth state:', error);
      // Show window even if auth restoration fails
      dashboardWindow?.show();
      dashboardWindow?.focus();

      // Mark app as initialized
      startupOptimizer.markInitialized();
    }

    // Enable global typing detection for nudge system with delay
    setTimeout(async () => {
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        await dashboardWindow.webContents.executeJavaScript(`
          (function() {
            if (window.nudgeTypingListener) return; // Already added
            
            function recordTyping() {
              console.log('🔔 [Nudge] Recording typing event');
              if (window.electronAPI?.nudgeRecordTyping) {
                window.electronAPI.nudgeRecordTyping();
              } else {
                console.error('🔔 [Nudge] electronAPI.nudgeRecordTyping not available');
              }
            }
            
            // Record typing on any keypress
            document.addEventListener('keydown', recordTyping);
            
            // Also record on input events
            document.addEventListener('input', recordTyping);
            
            window.nudgeTypingListener = true;
            console.log('🔔 [Nudge] Global typing detection enabled');
          })();
        `);
        Logger.info('🔔 [Nudge] Enabled global typing detection in dashboard');
      }
    }, 500); // Reduced delay for better responsiveness
  });
}

function createAnalysisOverlay() {
  analysisOverlayWindow = analysisOverlayService.createOverlayWindow();
}

function showAnalysisOverlay(analysisText: string, isVisionQuery: boolean = false, loadingMessage?: string) {
  analysisOverlayService.showOverlay(analysisText, isVisionQuery, loadingMessage);
}

function sendAnalysisResult(analysisText: string, isConversation: boolean = false) {
  analysisOverlayService.sendAnalysisResult(analysisText, isConversation);
}

function hideAnalysisOverlay() {
  analysisOverlayService.hideOverlay();
}

// Functions to manage dictation mode state
function setDictationMode(isDictation: boolean) {
  appState.setDictationMode(isDictation);
}

function getDictationMode(): boolean {
  return appState.getDictationMode();
}

// updateTrayIcon function moved to MenuService

function createMenuBarTray() {
  menuService.createTray();
}

function createApplicationMenu() {
  menuService.createApplicationMenu();
}

async function startPushToTalk() {
  // Start recording immediately - audio system should already be pre-warmed
  if (pushToTalkService) {
    await pushToTalkService.start();
  }
}

async function stopPushToTalk() {
  // The push-to-talk service handles its own timing and transcription internally
  // Just call stop and let it manage the complete lifecycle
  try {
    Logger.debug('🛑 [StopPushToTalk] Calling service.stop() - service will handle transcription completion');
    if (pushToTalkService) {
      await pushToTalkService.stop();
      Logger.debug('✅ [StopPushToTalk] Service.stop() completed successfully');
    } else {
      Logger.debug('⚠️ [StopPushToTalk] No service available to stop');
    }

    // Stop sound is now played immediately in handleHotkeyUp for minimal latency
  } catch (error) {
    Logger.error('❌ [StopPushToTalk] Error stopping service:', error);
  }
}

function sendStatus(message: string, recording: boolean) {
  // Recording status removed from overlay
}

async function transcribeAndPaste(audioFile: string) {
  // This function is now handled by push-to-talk service
  Logger.info('Transcription and pasting handled by push-to-talk service');
}

// Dictation IPC handlers moved to DictationIPCHandlers class

ipcMain.on('set-voice-tutorial-mode', (event, enabled: boolean) => {
  isVoiceTutorialMode = enabled;
  (global as any).isVoiceTutorialMode = enabled; // Store globally for text-paster access
  Logger.info(`🎯 [Tutorial] Voice tutorial mode ${enabled ? 'ENABLED' : 'DISABLED'} - transcription ${enabled ? 'sent to tutorial screen' : 'auto-pasted normally'}`);
});

ipcMain.on('set-email-tutorial-mode', (event, enabled: boolean) => {
  isEmailTutorialMode = enabled;
  (global as any).isEmailTutorialMode = enabled; // Store globally for push-to-talk access
  Logger.info(`📧 [Tutorial] Email tutorial mode ${enabled ? 'ENABLED' : 'DISABLED'} - context will be forced to email`);
});

ipcMain.on('close-app', () => {
  app.quit();
});

// Note: Analytics and Dictionary IPC handlers have been moved to IPCHandlers class
// to avoid duplicate handlers and ensure centralized management

// Auth IPC handlers moved to AuthIPCHandlers class

// Chat IPC handlers moved to ChatIPCHandlers class

// New function to activate overlays and shortcuts only after auth and onboarding
async function activateOverlaysAndShortcuts() {
  try {
    Logger.info('▶ [Overlays] Starting activation of overlays and shortcuts...');

    // Check privacy consent first - this is required for third-party data processing
    const appSettings = AppSettingsService.getInstance();

    // Privacy consent disabled for now - will be part of onboarding flow
    // TODO: Integrate privacy consent into proper onboarding flow
    /*
    if (!appSettings.hasPrivacyConsent()) {
      Logger.info('⚠️ [Privacy] Privacy consent required before activation');
      const consentGiven = await privacyConsentService.checkAndRequestConsent();
      
      if (!consentGiven) {
        Logger.warning('⚠️ [Privacy] User declined privacy consent - core functionality disabled');
        // Show info dialog about limited functionality
        // Note: Without consent, transcription cannot work as it requires third-party services
        return;
      }
      
      Logger.info('✅ [Privacy] Privacy consent obtained - proceeding with activation');
    }
    */

    // Initialize user nudge service if not already done
    if (!userNudgeService) {
      userNudgeService = UserNudgeService.getInstance();
      Logger.info('◉ [Nudge] User nudge service initialized in overlay activation');
    }

    // Create overlay windows
    const waveformWin = getWaveformWindow();
    if (!waveformWin) {
      Logger.info('♫ [Overlays] Creating waveform window...');
      createWaveformWindow();
    } else {
      Logger.info('♫ [Overlays] Waveform window already exists');
    }

    const suggestionWin = getSuggestionWindow();
    if (!suggestionWin) {
      Logger.info('◆ [Overlays] Creating suggestion window...');
      createSuggestionWindow();
    } else {
      Logger.info('◆ [Overlays] Suggestion window already exists');
    }

    // Show the waveform window only if showWaveform setting is enabled
    const currentSettings = appSettings.getSettings();
    const waveformWindow = getWaveformWindow();
    if (waveformWindow && currentSettings.showWaveform !== false) {
      Logger.info('◉ [Overlays] Showing waveform window...');
      waveformWindow.showInactive();
    } else if (waveformWindow) {
      Logger.info('◉ [Overlays] Waveform window hidden per user settings');
    }

    // Register shortcuts and start monitoring
    Logger.info('⌨ [Overlays] Registering global shortcuts...');
    try {
      shortcutService.registerGlobalShortcuts();
    } catch (error) {
      Logger.error('✖ [Overlays] Failed to register global shortcuts:', error);
    }

    // Initialize user nudge service (always do this, even if shortcuts fail)
    if (!userNudgeService) {
      Logger.info('◉ [Nudge] Initializing user nudge service...');
      userNudgeService = UserNudgeService.getInstance();
      Logger.info('◉ [Nudge] Native typing detection will be handled by the nudge service');
    }

    // Start Fn key monitoring for push-to-talk
    Logger.info('Transcription: GPT-4o-mini-transcribe → Local Whisper (fallback)');
    startHotkeyMonitoring();

    Logger.success('● [Overlays] Overlays and shortcuts activated successfully');

    // Open-source build: All features unlocked - no trial overlay needed
  } catch (error) {
    Logger.error('✖ [Overlays] Failed to activate overlays and shortcuts:', error);
  }
}

async function deactivateOverlaysAndShortcuts() {
  try {
    Logger.info('◼ [Overlays] Starting deactivation of overlays and shortcuts...');

    // Stop Fn key monitoring and push-to-talk functionality
    Logger.info('⌨ [Overlays] Stopping Fn key monitoring and push-to-talk...');
    stopHotkeyMonitoring();

    // Unregister all global shortcuts
    Logger.info('◉ [Overlays] Unregistering global shortcuts...');
    shortcutService.unregisterAllShortcuts();

    // Stop any active push-to-talk recording
    if (pushToTalkService) {
      Logger.info('♪ [Overlays] Stopping push-to-talk service...');
      try {
        await pushToTalkService.stop();
      } catch (error) {
        Logger.error('Error stopping push-to-talk:', error);
      }
    }

    // Hide overlay windows if they exist
    if (waveformWindow && !waveformWindow.isDestroyed()) {
      Logger.info('♫ [Overlays] Hiding waveform window...');
      waveformWindow.hide();
    }

    if (suggestionWindow && !suggestionWindow.isDestroyed()) {
      Logger.info('◆ [Overlays] Hiding suggestion window...');
      suggestionWindow.hide();
    }

    // Cleanup nudge service
    if (userNudgeService) {
      Logger.info('◉ [Nudge] Deactivating user nudge service...');
      userNudgeService.destroy();
      userNudgeService = null;
    }

    Logger.success('● [Overlays] Overlays and shortcuts deactivated successfully');
  } catch (error) {
    Logger.error('✖ [Overlays] Failed to deactivate overlays and shortcuts:', error);
  }
}

// open-external handler moved to IPCHandlers class

// Onboarding IPC handlers moved to OnboardingIPCHandlers class

// Status bar handlers
// Duplicate paste-last-transcription handler removed (already defined above)

ipcMain.on('new-session', () => {
  Logger.info('User requested new session.');
  // Stop any active recordings
  if (pushToTalkService) {
    pushToTalkService.stop().catch(error => Logger.error('Error stopping recording:', error));
  }
  transcripts = []; // Clear existing transcripts
  conversationContext = []; // Clear conversation context

  // Clear correction detector state
  if ((global as any).correctionDetector) {
    (global as any).correctionDetector.stopMonitoring();
  }

  // Clear any cached context in JarvisCore
  if (jarvisCore) {
    jarvisCore.clearTranscript();
  }

  // Generate a new session ID
  currentSessionId = new Date().toISOString().replace(/[:.]/g, '-');
  Logger.info('Session cleared - fresh start initiated with session:', currentSessionId);
});

// registerGlobalShortcuts function moved to ShortcutService
function registerGlobalShortcuts_REMOVED() {

  // First, unregister any existing shortcuts to avoid conflicts
  globalShortcut.unregisterAll();

  // Register Cmd+Option+J for opening dashboard (J for Jarvis, Option to avoid conflicts)
  // Try different variations for cross-platform compatibility
  let dashboardShortcut = false;
  const shortcutVariations = [
    'CommandOrControl+Option+J',  // macOS native
    'CommandOrControl+Alt+J',     // Cross-platform
    'Cmd+Option+J',               // macOS specific
    'Cmd+Alt+J'                   // Alternative
  ];

  for (const shortcut of shortcutVariations) {
    if (!dashboardShortcut) {
      try {
        dashboardShortcut = globalShortcut.register(shortcut, () => {
          Logger.info(`🎯 ${shortcut} pressed - Opening Jarvis Dashboard`);
          try {
            if (!dashboardWindow) {
              Logger.info('🎯 Creating new dashboard window');
              createDashboardWindow();
            } else {
              Logger.info('🎯 Showing existing dashboard window');
              dashboardWindow.show();
              dashboardWindow.focus();
              // Ensure window is brought to front on macOS
              if (process.platform === 'darwin') {
                app.focus();
              }
            }
          } catch (error) {
            Logger.error('🎯 Error opening dashboard:', error);
          }
        });

        if (dashboardShortcut) {
          Logger.success(`✅ Dashboard shortcut registered successfully: ${shortcut}`);
          break;
        }
      } catch (error) {
        Logger.warning(`▲ Failed to register ${shortcut}:`, error);
      }
    }
  }

  if (!dashboardShortcut) {
    Logger.error('❌ All dashboard shortcut registration attempts failed');
    // Try a simpler fallback shortcut
    try {
      const fallbackShortcut = globalShortcut.register('CommandOrControl+Shift+D', () => {
        Logger.info('🎯 Fallback Command+Shift+D pressed - Opening Jarvis Dashboard');
        if (!dashboardWindow) {
          createDashboardWindow();
        } else {
          dashboardWindow.show();
          dashboardWindow.focus();
        }
      });

      if (fallbackShortcut) {
        Logger.info('✅ Fallback Command+Shift+D dashboard shortcut registered');
      }
    } catch (error) {
      Logger.error('❌ Even fallback shortcut registration failed:', error);
    }
  }

  // Global shortcuts are now handled by Fn key monitoring and push-to-talk system
  // No additional shortcuts needed for dictation as we use push-to-talk with Fn key

  Logger.success('✅ [Overlays] Global shortcuts configured successfully');

  Logger.info('Transcription: GPT-4o-mini-transcribe → Local Whisper (fallback)');

  // Start Fn key monitoring for push-to-talk
  startHotkeyMonitoring();
}

function startHotkeyMonitoring() {
  // Get the current hotkey setting
  const appSettings = AppSettingsService.getInstance();
  const allSettings = appSettings.getSettings();
  const currentHotkey = allSettings.hotkey;

  // Check if monitoring is already active for the same hotkey
  if (isHotkeyMonitoringActive && universalKeyService && currentHotkey === lastActiveHotkey) {
    Logger.info(`⚙ [Hotkey] Monitoring already active for ${currentHotkey}, skipping restart`);
    return;
  }

  // Only stop if we need to change the hotkey or restart
  if (isHotkeyMonitoringActive) {
    stopHotkeyMonitoring();
  }

  Logger.info(`⚙ [Hotkey] Starting monitoring - Full settings:`, allSettings);
  Logger.info(`⚙ [Hotkey] Current hotkey from settings: ${currentHotkey}`);

  // Calculate if streaming should be enabled
  const shouldUseStreaming = allSettings.useDeepgramStreaming && !allSettings.useLocalWhisper;
  Logger.info(`⚙ [Hotkey] Streaming decision: useDeepgramStreaming=${allSettings.useDeepgramStreaming}, useLocalWhisper=${allSettings.useLocalWhisper}, shouldUseStreaming=${shouldUseStreaming}`);

  // Initialize push-to-talk service (same for all keys)
  pushToTalkService = new PushToTalkService(
    analyticsManager,
    (level) => { waveformWindow?.webContents.send('audio-level', level); },
    (isActive) => {
      // State change callback - send to both UI and tutorial screen
      Logger.debug(`Push-to-talk state changed: ${isActive ? 'active' : 'inactive'}`);

      // Send to all browser windows for tutorial mode
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('push-to-talk-state', isActive);
        }
      });
    },
    (isTranscribing) => {
      // Send transcription state to all windows
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('transcription-state', isTranscribing);
        }
      });

      // Legacy events for waveform
      if (isTranscribing) {
        waveformWindow?.webContents.send('transcription-start');
      } else {
        waveformWindow?.webContents.send('transcription-complete');
      }
    },
    (partialText) => {
      Logger.info(`◉ [Partial] Received: "${partialText}"`);
      waveformWindow?.webContents.send('partial-transcript', partialText);
    },
    allSettings.audioFeedback,
    shouldUseStreaming // Use the pre-calculated value
  );

  // Set up DictationIPCHandlers with pushToTalkService and callbacks
  const dictationHandlers = DictationIPCHandlers.getInstance();
  dictationHandlers.setPushToTalkService(pushToTalkService);
  dictationHandlers.setTranscripts(transcripts);
  dictationHandlers.setCallbacks(
    createDashboardWindow,
    setDictationMode,
    { get value() { return isHandsFreeModeActive; }, set value(v) { isHandsFreeModeActive = v; } }
  );

  // Register audio monitoring with power management
  const powerManager = PowerManagementService.getInstance();
  powerManager.registerService('audio-monitoring', pushToTalkService);

  // Use UniversalKeyService for all modifier keys (fn, option, control)
  if (['fn', 'option', 'control'].includes(currentHotkey)) {
    Logger.info(`⚙ [Hotkey] Starting universal key monitoring for: ${currentHotkey}`);

    try {
      // Initialize universal key service with callbacks
      universalKeyService = new UniversalKeyService(
        () => {
          Logger.debug(`⚙ [${currentHotkey}] Key down event`);
          handleHotkeyDown();
        },
        () => {
          Logger.debug(`⚙ [${currentHotkey}] Key up event`);
          handleHotkeyUp();
        }
      );

      const success = universalKeyService.start(currentHotkey);
      if (!success) {
        Logger.error('❌ [Hotkey] Failed to start universal key monitoring:', universalKeyService.getLastError());
        universalKeyService = null;
        return;
      }

      // Register with power management to prevent system hanging
      const powerManager = PowerManagementService.getInstance();
      powerManager.registerService('key-monitoring', universalKeyService);

      // Update tracking variables
      isHotkeyMonitoringActive = true;
      lastActiveHotkey = currentHotkey;

      Logger.success(`✅ [Hotkey] ${currentHotkey.charAt(0).toUpperCase() + currentHotkey.slice(1)} key monitoring active`);

      if (pushToTalkService?.isStreamingEnabled()) {
        Logger.success('◉ [Streaming] Deepgram real-time streaming transcription ENABLED');
        Logger.info('◉ [Streaming] Press and hold your hotkey to start streaming transcription');
        Logger.info('◉ [Streaming] You should see interim results while speaking and final results when you release the key');
      } else {
        Logger.info('◉ [Streaming] Traditional transcription mode (non-streaming)');
      }
    } catch (error) {
      Logger.error('❌ [Hotkey] Error initializing universal key service:', error);
      universalKeyService = null;
    }
  } else if (currentHotkey === 'space') {
    // Space key has been removed - fallback to 'fn'
    Logger.warning(`⚠️ [Hotkey] Space key is no longer supported. Defaulting to 'fn'`);
    appSettings.updateSettings({ hotkey: 'fn' });

    // Restart with corrected hotkey
    setTimeout(() => startHotkeyMonitoring(), 100);
    return;
  } else {
    Logger.warning(`⚠️ [Hotkey] Unsupported key: ${currentHotkey}. Defaulting to 'fn'`);
    appSettings.updateSettings({ hotkey: 'fn' });

    // Restart with corrected hotkey  
    setTimeout(() => startHotkeyMonitoring(), 100);
    return;
  }
}

function stopHotkeyMonitoring() {
  Logger.info('⚙ [Lifecycle] Stopping hotkey monitoring...');

  // Stop universal key service if running
  if (universalKeyService) {
    try {
      universalKeyService.stop();
      Logger.info('⚙ [Lifecycle] Universal key service stopped');
    } catch (error) {
      Logger.error('⚙ [Lifecycle] Error stopping universal key service:', error);
    } finally {
      universalKeyService = null;
    }
  }

  // Unregister any global shortcuts
  try {
    shortcutService.unregisterAllShortcuts();
    Logger.info('⚙ [Lifecycle] Global shortcuts unregistered');
  } catch (error) {
    Logger.error('⚙ [Lifecycle] Error unregistering global shortcuts:', error);
  }

  // Stop push-to-talk service if active
  if (pushToTalkService?.active) {
    try {
      pushToTalkService.stop();
      Logger.info('⚙ [Lifecycle] Push-to-talk service stopped');
    } catch (error) {
      Logger.error('⚙ [Lifecycle] Error stopping push-to-talk service:', error);
    }
  }

  // Clean up push-to-talk service
  pushToTalkService = null;

  Logger.info('⚙ [Lifecycle] Hotkey monitoring cleanup complete');
}

// Set up hotkey callbacks for SettingsIPCHandlers
SettingsIPCHandlers.getInstance().setHotkeyCallbacks(
  stopHotkeyMonitoring,
  startHotkeyMonitoring
);

// Open-source build: Subscription always returns 'pro' status
// These functions are kept for backwards compatibility but are simplified
async function checkSubscriptionStatusFromMain(_userId: string): Promise<any> {
  // Open-source build: All features unlocked
  return { status: 'pro' };
}

function clearSubscriptionCache() {
  // No-op in open-source build
}

async function handleHotkeyDown() {
  const keyDownStartTime = performance.now();
  Logger.debug(`⚡ [TIMING] Key down event received at ${keyDownStartTime.toFixed(2)}ms`);

  const currentTime = Date.now();
  const timeSinceLastPress = currentTime - lastFnKeyTime;

  Logger.debug(`🎯 [DoubleTap] Timing analysis: lastPress=${lastFnKeyTime}, current=${currentTime}, diff=${timeSinceLastPress}ms, handsFreeModeActive=${isHandsFreeModeActive}`);

  // Early check: if we're already handling a hands-free stop, ignore this press
  if (pendingHandsFreeStop) {
    Logger.debug('🚫 [HandsFree] Ignoring key press - hands-free stop in progress');
    return;
  }

  const afterChecksTime = performance.now();
  Logger.debug(`⚡ [TIMING] After initial checks: ${(afterChecksTime - keyDownStartTime).toFixed(2)}ms`);

  // ⚡ IMMEDIATE UI FEEDBACK - Start UI immediately without ANY delays
  const beforeUITime = performance.now();
  Logger.debug(`⚡ [TIMING] Before UI feedback: ${(beforeUITime - keyDownStartTime).toFixed(2)}ms`);

  // ⚡ INSTANT UI UPDATE - Multiple channels for immediate feedback
  // Check if waveform should be shown based on user settings
  const currentAppSettings = AppSettingsService.getInstance().getSettings();
  const shouldShowWaveform = currentAppSettings.showWaveform !== false;

  if (waveformWindow && !waveformWindow.isDestroyed()) {
    // Only show waveform if setting allows it
    if (shouldShowWaveform) {
      waveformWindow.showInactive();
    }

    // Send to waveform window first (primary UI) - even if hidden, for audio feedback
    waveformWindow.webContents.send('push-to-talk-start');

    // ⚡ INSTANT MICROPHONE STATUS - Send recording status immediately
    waveformWindow.webContents.send('recording-status', { recording: true, active: true });

    // Also update any other windows that might show status
    const currentDashboard = getDashboardWindow();
    if (currentDashboard && !currentDashboard.isDestroyed()) {
      currentDashboard.webContents.send('fn-key-state-change', true);
      // Also send recording status to dashboard
      currentDashboard.webContents.send('recording-status', { recording: true, active: true });
    }
  } else {
    Logger.warning('⚠️ [UI] Waveform window not available for immediate feedback');
  }

  const afterUITime = performance.now();
  Logger.debug(`⚡ [TIMING] After UI feedback: ${(afterUITime - keyDownStartTime).toFixed(2)}ms (UI took ${(afterUITime - beforeUITime).toFixed(2)}ms)`);

  // ⚡ OPTIMIZATION: Skip all processing if we're already handling hands-free
  if (isHandsFreeModeActive) {
    if (pendingHandsFreeStop) return; // Prevent multiple stop requests
    pendingHandsFreeStop = true;

    Logger.info('✋ [HandsFree] Single key press in hands-free mode - stopping recording gracefully');
    isHandsFreeModeActive = false;

    // If there's an active recording, stop it gracefully (not cancel)
    if (pushToTalkService && (pushToTalkService.active || pushToTalkService.transcribing)) {
      Logger.info('🛑 [HandsFree] Stopping active recording/transcription gracefully');

      // Stop the recording gracefully - this will trigger transcription
      await pushToTalkService.stop();

      // Clear hands-free mode flag after stopping
      (pushToTalkService as any).isHandsFreeMode = false;
    } else {
      Logger.info('💬 [HandsFree] No active recording - just exiting hands-free mode');
      // Clear hands-free mode flag
      if (pushToTalkService) {
        (pushToTalkService as any).isHandsFreeMode = false;
      }
    }

    // Update UI to show hands-free mode has ended
    waveformWindow?.webContents.send('dictation-stop');

    // Reset dictation mode when exiting hands-free
    setDictationMode(false);
    Logger.info('💬 [HandsFree] Dictation mode disabled - returning to normal mode');

    // Record Jarvis usage for nudge system
    if (userNudgeService) {
      userNudgeService.recordJarvisUsage();
      Logger.debug('🔔 [Nudge] Recorded Jarvis usage (exit hands-free)');
    }

    // Reset timing and flags
    lastFnKeyTime = 0;
    pendingHandsFreeStop = false;
    return;
  }

  // Clear any pending single-tap processing
  if (pendingSingleTapTimeout) {
    clearTimeout(pendingSingleTapTimeout);
    pendingSingleTapTimeout = null;
    Logger.debug('🚫 [DoubleTap] Cleared pending single-tap timeout');
  }

  const afterTimeoutClearTime = performance.now();
  Logger.debug(`⚡ [TIMING] After timeout clear: ${(afterTimeoutClearTime - keyDownStartTime).toFixed(2)}ms`);

  // Check for double-tap (quick second press) - adjusted timing for optimized debounce
  console.log(`🎯 [DoubleTap] Evaluating: last=${lastFnKeyTime}, current=${currentTime}, diff=${timeSinceLastPress}ms`);
  if (lastFnKeyTime > 0 && timeSinceLastPress < 1000 && timeSinceLastPress > 5) {
    const doubleTapDetectedTime = performance.now();
    console.log(`⚡ [TIMING] Double-tap detected at: ${(doubleTapDetectedTime - keyDownStartTime).toFixed(2)}ms`);

    console.log('🎯 Double Fn key detected - entering hands-free dictation');
    console.log(`🎯 [DoubleTap] Double-tap confirmed: ${timeSinceLastPress}ms between presses`);

    // Cancel any active operation first (including the one we might have just started)
    if (pushToTalkService?.active || pushToTalkService?.transcribing || (pushToTalkService as any)?.startedFromSingleTap) {
      console.log('🚫 [Cancel] Cancelling active operation BEFORE hands-free mode');
      if (pushToTalkService) {
        // MUST BE SYNCHRONOUS to avoid race condition
        pushToTalkService.hardStop();
        pushToTalkService.active = false;
        (pushToTalkService as any).startedFromSingleTap = false;
        console.log('✅ [Cancel] Synchronous hardStop completed');
      }
      waveformWindow?.webContents.send('push-to-talk-cancel');
      waveformWindow?.webContents.send('transcription-complete');

      // 🔧 MINIMAL DELAY: State is now reset, 10ms is plenty for audio cleanup
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Record Jarvis usage for nudge system
    if (userNudgeService) {
      userNudgeService.recordJarvisUsage();
      Logger.debug('🔔 [Nudge] Recorded Jarvis usage (double Fn key)');
    }

    // ⚡ FAST RESPONSE: Enter hands-free mode immediately - subscription check happens in background
    Logger.info('🎤 Starting hands-free dictation');
    isHandsFreeModeActive = true;

    // Set hands-free mode flag in push-to-talk service to enable streaming
    if (pushToTalkService) {
      (pushToTalkService as any).isHandsFreeMode = true;
    }

    // Show waveform if setting allows
    const handsFreeSettings = AppSettingsService.getInstance().getSettings();
    if (handsFreeSettings.showWaveform !== false && waveformWindow && !waveformWindow.isDestroyed()) {
      waveformWindow.showInactive();
    }
    // 🔴 CRITICAL: Always cancel push-to-talk state first to reset waveform's isPushToTalk
    waveformWindow?.webContents.send('push-to-talk-cancel');
    // Now send dictation-start to show the recording bar with stop button
    waveformWindow?.webContents.send('dictation-start');
    lastFnKeyTime = 0; // Reset to prevent triple-tap issues

    // ⚡ HANDS-FREE MODE: Start recording immediately for hands-free dictation
    try {
      if (pushToTalkService) {
        console.log('🎤 [HandsFree] Calling pushToTalkService.start()');
        await pushToTalkService.start();
        console.log('✅ [HandsFree] Hands-free recording started successfully');
      }
    } catch (error) {
      console.error('❌ [HandsFree] Failed to start hands-free recording:', error);
      // Reset hands-free mode on error
      isHandsFreeModeActive = false;
      if (pushToTalkService) {
        (pushToTalkService as any).isHandsFreeMode = false;
      }
      waveformWindow?.webContents.send('dictation-stop');
    }

    // Set dictation mode to true for hands-free mode
    setDictationMode(true);
    Logger.info('💬 [HandsFree] Dictation mode enabled - all input will be treated as dictation');
    return;
  }

  // Update timing for this press
  lastFnKeyTime = currentTime;
  fnKeyPressed = true;

  // Send state change event for tutorial purposes - send to all windows
  getDashboardWindow()?.webContents.send('fn-key-state-change', true);
  // Also send to onboarding window if it exists
  BrowserWindow.getAllWindows().forEach(window => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('fn-key-state-change', true);
    }
  });

  // ⚡ PERFORMANCE OPTIMIZATION: Run authentication checks in parallel without blocking
  const authCheckStartTime = performance.now();

  // Use setImmediate to defer slow authentication check to next tick
  setImmediate(async () => {
    const isOnboardingComplete = hasCompletedOnboarding();
    const currentUserId = analyticsManager.getCurrentUserId();
    const isAuthenticated = currentUserId !== null && currentUserId !== 'default-user';

    Logger.debug(`🔍 [Auth] UserID: ${currentUserId}`);
    Logger.debug(`🔍 [Auth] Onboarding Complete: ${isOnboardingComplete}`);
    Logger.debug(`🔍 [Auth] Is Authenticated: ${isAuthenticated}`);

    // Allow recording if onboarding is complete (no auth gate in open-source build)
    const shouldAllowRecording = isOnboardingComplete;

    Logger.info(`🔧 [Auth] Final decision - Allow Recording: ${shouldAllowRecording}`);

    const authCheckEndTime = performance.now();
    Logger.debug(`⚡ [TIMING] Auth check completed in: ${(authCheckEndTime - authCheckStartTime).toFixed(2)}ms`);

    // PRIORITY: If voice tutorial mode is active, always allow real transcription
    if (isVoiceTutorialMode) {
      Logger.info('🎯 [Tutorial] Voice tutorial mode active - enabling REAL transcription for demo');
    } else if (!shouldAllowRecording) {
      // During normal onboarding tutorials (non-voice), only send state events for visual feedback
      Logger.info('🎯 [Tutorial] Fn key pressed during onboarding - sending visual feedback only (no recording)');
      // Still send waveform events for visual feedback in tutorials
      waveformWindow?.webContents.send('push-to-talk-start');
      return; // Exit early to prevent actual recording during tutorials
    }
  });

  // ⚡ START RECORDING IMMEDIATELY - Don't wait for auth check
  Logger.debug('🔧 fn key pressed - Push-to-talk activated immediately');
  Logger.debug('🔧 ⚙ [fn] Key down event - no delay');

  // 🔧 SMART DEBOUNCING: Delay single-tap processing to allow for double-tap
  // Start push-to-talk immediately if not already active
  if (!pushToTalkService?.active && !pushToTalkService?.transcribing) {
    // Start normal push-to-talk IMMEDIATELY
    Logger.debug('🔧 fn key pressed - Push-to-talk activated immediately');
    Logger.debug('🔧 ⚙ [fn] Key down event - no delay');

    // ⚡ INSTANT VISUAL FEEDBACK - Start UI immediately without waiting for audio
    const beforeUITime = performance.now();
    Logger.debug(`⚡ [TIMING] Before UI feedback: ${(beforeUITime - keyDownStartTime).toFixed(2)}ms`);

    // Show waveform if setting allows
    const singleTapSettings = AppSettingsService.getInstance().getSettings();
    if (singleTapSettings.showWaveform !== false && waveformWindow && !waveformWindow.isDestroyed()) {
      waveformWindow.showInactive();
    }
    waveformWindow?.webContents.send('push-to-talk-start');

    const afterUITime = performance.now();
    Logger.debug(`⚡ [TIMING] After UI feedback: ${(afterUITime - keyDownStartTime).toFixed(2)}ms (UI took ${(afterUITime - beforeUITime).toFixed(2)}ms)`);

    if (pushToTalkService) {
      try {
        // Mark that we started from a potential single tap
        (pushToTalkService as any).startedFromSingleTap = true;

        // 🚀 INSTANT MICROPHONE ACCESS - Start immediately, no deferral at all
        Logger.debug('🎤 [Immediate] Starting push-to-talk audio recording...');
        pushToTalkService.start().then(() => {
          Logger.debug('✅ [Immediate] Push-to-talk audio started successfully');
        }).catch(error => {
          Logger.error('❌ [Immediate] Failed to start push-to-talk:', error);
          // Cancel UI if audio fails
          waveformWindow?.webContents.send('push-to-talk-cancel');
        });
      } catch (error) {
        Logger.error('❌ [Immediate] Failed to setup push-to-talk:', error);
        // Cancel UI if audio setup fails
        waveformWindow?.webContents.send('push-to-talk-cancel');
      }
    }
  } else {
    // If already active, handle as cancel ONLY if we're in active recording/transcription state
    // Don't cancel if we're just in hands-free mode idle state
    if (pushToTalkService?.active || pushToTalkService?.transcribing) {
      Logger.info('🚫 [Cancel] Function key pressed during active operation - cancelling current flow');

      // Cancel the current operation immediately
      if (pushToTalkService) {
        pushToTalkService.hardStop();
        pushToTalkService.active = false;
      }
      waveformWindow?.webContents.send('push-to-talk-cancel');
      waveformWindow?.webContents.send('transcription-complete');
      Logger.info('🛑 [Stop] Hard stop requested - cancelling all operations');
      Logger.info('✅ [Stop] Hard stop completed');
      Logger.info('🚫 [Cancel] Current operation cancelled - ready for new recording');
    }
  }

  // Still set timeout to detect double-tap, but it won't delay single-tap
  pendingSingleTapTimeout = setTimeout(() => {
    pendingSingleTapTimeout = null;
    Logger.debug('⏱️ [DoubleTap] Single-tap timeout reached, no double-tap detected');
  }, 250); // Reduced timeout for faster double-tap detection
}

async function handleHotkeyUp() {
  fnKeyPressed = false;

  // 🔴 CRITICAL: Check hands-free mode FIRST before sending any stop signals!
  // In hands-free mode, releasing the key should NOT stop recording.
  if (isHandsFreeModeActive || pendingHandsFreeStop) {
    console.log('🎯 [HandsFree] Key released while hands-free active - NOT stopping recording');
    // Clear the pending stop flag after a delay to ensure proper cleanup
    if (pendingHandsFreeStop) {
      setTimeout(() => {
        pendingHandsFreeStop = false;
      }, 100);
    }
    return;
  }

  // ⚡ INSTANT UI UPDATE - Only send stop signals if NOT in hands-free mode
  if (waveformWindow && !waveformWindow.isDestroyed()) {
    waveformWindow.webContents.send('push-to-talk-stop');
    // ⚡ INSTANT MICROPHONE STATUS - Send recording stop immediately
    waveformWindow.webContents.send('recording-status', { recording: false, active: false });
  }

  // Send state change event for tutorial purposes - send to all windows
  getDashboardWindow()?.webContents.send('fn-key-state-change', false);
  // Also send to onboarding window if it exists
  BrowserWindow.getAllWindows().forEach(window => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('fn-key-state-change', false);
      // Also send recording status to all windows
      window.webContents.send('recording-status', { recording: false, active: false });
    }
  });

  // ⚡ PERFORMANCE OPTIMIZATION: Run authentication checks in parallel without blocking
  setImmediate(async () => {
    const isOnboardingComplete = hasCompletedOnboarding();
    const currentUserId = analyticsManager.getCurrentUserId();
    const isAuthenticated = currentUserId !== null && currentUserId !== 'default-user';

    // PRIORITY: If voice tutorial mode is active, always allow real transcription
    if (isVoiceTutorialMode) {
      Logger.info('🎯 [Tutorial] Voice tutorial mode active - enabling REAL transcription processing');
    } else if (!isOnboardingComplete && !isAuthenticated) {
      // During normal onboarding tutorials (non-voice), only send visual feedback
      Logger.info('🎯 [Tutorial] Fn key released during onboarding - sending visual feedback only');
      return; // Exit early to prevent actual recording operations during tutorials
    }
  });

  // ⚡ CONTINUE IMMEDIATELY - Don't wait for auth check

  // Clear the single-tap flag
  if (pushToTalkService) {
    (pushToTalkService as any).startedFromSingleTap = false;
  }

  // DON'T clear pending timeout immediately - let it execute for single-tap
  // The timeout will check if the service is active and handle accordingly

  Logger.debug('Fn key released');

  // Handle push-to-talk release - check for BOTH active state AND recording start time
  // This ensures we only stop if we actually started recording
  if (pushToTalkService && pushToTalkService.active && pushToTalkService.recordingStartTime) {
    Logger.debug('Fn key released - stopping push-to-talk...');
    const duration = Date.now() - pushToTalkService.recordingStartTime;
    Logger.performance('Push-to-talk duration', duration);

    // 🕒 START END-TO-END TIMING MEASUREMENT
    const keyReleaseTime = Date.now();
    (global as any).keyReleaseTime = keyReleaseTime;
    console.log('\x1b[45m\x1b[37m⏱️  [TIMING] Function key released - starting end-to-end measurement\x1b[0m');

    // ⚡ IMMEDIATE UI FEEDBACK - Stop animation and play synthesized sound
    waveformWindow?.webContents.send('push-to-talk-stop');

    // Let the service handle its own lifecycle and transcription completion
    // Don't interfere with the service state here

    // ⏱️ IMPROVED TIMING: Stop recording and let service complete transcription
    stopPushToTalk();
  } else if (pushToTalkService) {
    Logger.debug(`Fn key released - service state: active=${pushToTalkService.active}, hasRecordingTime=${!!pushToTalkService.recordingStartTime}`);
  } else {
    Logger.debug('Fn key released - no push-to-talk service available');
  }
}

// Protocol handler registration - must be done before app ready
if (!app.isDefaultProtocolClient('jarvis')) {
  app.setAsDefaultProtocolClient('jarvis');
  Logger.info('Registered jarvis:// protocol handler');
} else {
  Logger.info('jarvis:// protocol handler already registered');
}

// Handle OAuth callback protocol
app.on('open-url', async (event, url) => {
  event.preventDefault();

  Logger.info('Protocol URL received:', url);
  console.log('Protocol URL received:', url);

  if (url.startsWith('jarvis://auth/callback')) {
    // Parse OAuth callback parameters (matching electron-app pattern)
    const urlObj = new URL(url);
    const sessionId = urlObj.searchParams.get('session');
    const accessToken = urlObj.searchParams.get('access_token');
    const refreshToken = urlObj.searchParams.get('refresh_token');
    const userEmail = urlObj.searchParams.get('user_email');
    const userName = urlObj.searchParams.get('user_name');
    const userId = urlObj.searchParams.get('user_id');

    Logger.info('OAuth callback received', {
      sessionId: sessionId ? 'Present' : 'Missing',
      accessToken: accessToken ? 'Present' : 'Missing',
      refreshToken: refreshToken ? 'Present' : 'Missing',
      userEmail: userEmail || 'Not provided',
      userName: userName || 'Not provided',
      userId: userId || 'Not provided'
    });

    // Send OAuth callback to renderer process with all parameters
    const currentDashboardWindow = getDashboardWindow();
    if (currentDashboardWindow && !currentDashboardWindow.isDestroyed()) {
      currentDashboardWindow.webContents.send('auth:callback', {
        session: sessionId,
        access_token: accessToken,
        refresh_token: refreshToken,
        user_email: userEmail,
        user_name: userName,
        user_id: userId
      });

      Logger.info('Sent OAuth callback to renderer');

      // Set user ID in analytics manager immediately after auth
      if (userId) {
        Logger.info('🔥 [Main] Setting user ID in analytics manager immediately:', userId);
        try {
          await analyticsManager.setUserId(userId);
          Logger.info('✅ [Main] Successfully set user ID in analytics manager:', userId);

          // Save auth state to main process storage AND set SecureAPI token
          if (userEmail && userName && accessToken) {
            const authState: AuthState = {
              uid: userId,
              email: userEmail,
              displayName: userName,
              idToken: accessToken, // Use the access token as ID token for API authentication
              timestamp: Date.now()
            };
            authService.saveAuthState(authState);
            Logger.info('💾 [Main] Saved OAuth auth state to main process storage');

            // Initialize Jarvis Core if not already initialized
            if (!jarvisCore) {
              Logger.info('▶ [Auth] User authenticated via OAuth - initializing Jarvis Core...');
              await initializeJarvis();
            }

            // Check if onboarding is completed and activate overlays if so
            const onboardingCompleted = hasCompletedOnboarding();
            Logger.info('🔍 [Main] Checking onboarding status after OAuth:', { onboardingCompleted });

            if (onboardingCompleted) {
              Logger.info('🚀 [Main] User authenticated via OAuth and onboarding completed - activating overlays');
              activateOverlaysAndShortcuts();
            } else {
              Logger.info('⏳ [Main] User authenticated via OAuth but onboarding not completed - waiting for onboarding');
            }
          }
        } catch (error) {
          Logger.error('❌ [Main] Failed to set user ID in analytics manager:', error);
        }
      } else {
        Logger.warning('❌ [Main] No userId available for analytics');
      }

      // Focus the main window
      currentDashboardWindow.focus();
    } else {
      Logger.warning('Dashboard window not available for OAuth callback - attempting to create one');

      // Try to create/get dashboard window if it doesn't exist
      try {
        const newDashboardWindow = windowManager.createDashboardWindow();
        if (newDashboardWindow && !newDashboardWindow.isDestroyed()) {
          // Set authentication in main process immediately
          if (userId && userEmail && userName && accessToken) {
            const authState: AuthState = {
              uid: userId,
              email: userEmail,
              displayName: userName,
              idToken: accessToken,
              timestamp: Date.now()
            };
            authService.saveAuthState(authState);

            // Set analytics user ID
            await analyticsManager.setUserId(userId);

            // Initialize Jarvis Core if needed
            if (!jarvisCore) {
              await initializeJarvis();
            }
          }

          // Wait a moment for the window to be ready
          setTimeout(() => {
            if (!newDashboardWindow.isDestroyed()) {
              newDashboardWindow.webContents.send('auth:callback', {
                session: sessionId,
                access_token: accessToken,
                refresh_token: refreshToken,
                user_email: userEmail,
                user_name: userName,
                user_id: userId
              });
              newDashboardWindow.focus();
              Logger.info('✅ Created new dashboard window and sent OAuth callback');
            }
          }, 1000);
        }
      } catch (error) {
        Logger.error('❌ Failed to create dashboard window for OAuth callback:', error);
      }
    }
  }
});

// Check if user has completed onboarding
function hasCompletedOnboarding(): boolean {
  try {
    const configPath = path.join(os.homedir(), '.jarvis', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.onboardingCompleted === true) {
        return true;
      }
    }

    // Onboarding not completed yet
    Logger.info('📋 [Onboarding] Not completed - showing onboarding flow');
    return false;
  } catch (error) {
    Logger.error('Error checking onboarding status:', error);
    return false;
  }
}

// Mark onboarding as completed
function markOnboardingCompleted(): void {
  try {
    const configDir = path.join(os.homedir(), '.jarvis');
    const configPath = path.join(configDir, 'config.json');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const config = { onboardingCompleted: true };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    Logger.info('Onboarding marked as completed');
  } catch (error) {
    Logger.error('Failed to save onboarding status:', error);
  }
}

// Set up OnboardingIPCHandlers with callbacks
const onboardingIPC = OnboardingIPCHandlers.getInstance();
onboardingIPC.setAnalyticsManager(analyticsManager);
onboardingIPC.setOnboardingCallbacks(hasCompletedOnboarding, markOnboardingCompleted);
onboardingIPC.setActivateOverlaysCallback(activateOverlaysAndShortcuts);
onboardingIPC.setDeactivateOverlaysCallback(deactivateOverlaysAndShortcuts);
onboardingIPC.setHotkeyCallbacks(startHotkeyMonitoring, stopHotkeyMonitoring);
onboardingIPC.registerHandlers();

// Set up AuthIPCHandlers with callbacks
const authIPC = AuthIPCHandlers.getInstance();
authIPC.setAnalyticsManager(analyticsManager);
authIPC.setCallbacks(
  hasCompletedOnboarding,
  activateOverlaysAndShortcuts,
  initializeJarvis,
  { get value() { return jarvisCore; }, set value(v) { jarvisCore = v; } }
);
authIPC.registerHandlers();

// Set up ChatIPCHandlers with jarvisCore reference
const chatIPC = ChatIPCHandlers.getInstance();
chatIPC.setJarvisCoreRef({ get value() { return jarvisCore; } });
chatIPC.registerHandlers();

app.whenReady().then(async () => {
  // Force create log directory
  const logDir = path.join(os.homedir(), 'Library', 'Logs', 'Jarvis');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  Logger.info('🚀 [Startup] Jarvis starting up');

  // Initialize Power Management Service FIRST to prevent system hanging
  const powerManager = PowerManagementService.getInstance();
  powerManager.registerService('app-lifecycle');
  Logger.info('🔋 [Startup] Power management initialized');

  // IPC handlers already registered at module initialization

  // Initialize AppSettingsService early to ensure settings are loaded
  const appSettings = AppSettingsService.getInstance();
  const initialSettings = appSettings.getSettings();
  Logger.info('⚙️ [Startup] App settings initialized:', {
    hotkey: initialSettings.hotkey,
    settingsPath: require('path').join(require('electron').app.getPath('userData'), 'app-settings.json')
  });

  // Always create dashboard window to show React app (login/onboarding/dashboard)
  createDashboardWindow();

  // Set up application menu with "Check for Updates" option
  createApplicationMenu();

  // Create menu bar tray
  createMenuBarTray();

  // EARLY WHISPER PRELOAD: Start loading the Metal library and model ASAP
  // This runs in background so first transcription is fast
  (async () => {
    try {
      const whisperSettings = AppSettingsService.getInstance().getSettings();
      if (whisperSettings.useLocalWhisper && whisperSettings.localWhisperModel) {
        Logger.info('🎤 [Startup] Early preload: Starting whisper model warmup...');
        const whisperTranscriber = new LocalWhisperTranscriber();
        const success = await whisperTranscriber.preloadModel(whisperSettings.localWhisperModel);
        if (success) {
          Logger.success(`🎤 [Startup] Early preload: Whisper model '${whisperSettings.localWhisperModel}' ready!`);
        } else {
          Logger.info('🎤 [Startup] Early preload: Model not downloaded, skipping');
        }
      }
    } catch (e) {
      Logger.error('🎤 [Startup] Early preload failed:', e);
    }
  })();

  // Don't create overlay windows or register shortcuts at startup
  // They will only be activated after BOTH authentication AND onboarding are completed
  Logger.info('App ready - dashboard created, waiting for authentication and onboarding completion');

  // Defer heavy operations to prevent blocking startup
  startupOptimizer.deferTask(async () => {
    // Check for updates after a delay (force in dev mode for testing)
    updateService.forceCheckForUpdates();

    // Only initialize Jarvis if we have saved auth state, otherwise wait for user login
    const savedAuthState = loadAuthState();
    if (savedAuthState) {
      Logger.info('🔄 [Startup] Found saved auth state, initializing Jarvis Core...');
      await initializeJarvis();
    } else {
      Logger.info('⏳ [Startup] No valid auth state - Jarvis Core will initialize after user login');
    }
  });

  // Set up periodic permission refresh to handle long uptime issues
  setInterval(() => {
    try {
      AudioProcessor.forcePermissionRefresh();
      Logger.debug('Periodic permission cache refresh completed');
    } catch (error) {
      Logger.warning('Failed to refresh permission cache:', error);
    }
  }, 30 * 60 * 1000); // Every 30 minutes
});

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());

app.on('before-quit', async () => {
  // Unregister global shortcuts
  shortcutService.unregisterAllShortcuts();

  // Stop hotkey monitoring
  stopHotkeyMonitoring();

  // Stop any active push-to-talk recordings
  if (pushToTalkService) {
    pushToTalkService.stop().catch(error => Logger.error('Error stopping recording:', error));
  }

  // Flush any pending analytics updates
  if (analyticsManager) {
    Logger.info('📊 [Analytics] Flushing pending updates before quit');
    await analyticsManager.flush().catch(error => Logger.error('Error flushing analytics:', error));
  }

  if (jarvisCore) {
    await jarvisCore.shutdown();
  }
});

app.on('will-quit', () => {
  // Ensure shortcuts are unregistered and monitors stopped
  shortcutService.unregisterAllShortcuts();
  stopHotkeyMonitoring();
});

// Onboarding, Fn key, hotkey, and logout handlers moved to OnboardingIPCHandlers class

// Permission handlers moved to PermissionIPCHandlers class

// Update handlers moved to UpdateIPCHandlers class

// App settings and API keys IPC handlers moved to SettingsIPCHandlers class

/**
 * Clear global context for fresh assistant conversations
 */
async function clearGlobalContext(): Promise<void> {
  try {
    Logger.debug('🧹 [Global] Clearing global context');

    // Clear agent memory through push-to-talk service
    if (pushToTalkService) {
      await pushToTalkService.clearAgentMemory();
    }

    Logger.debug('✅ [Global] Global context cleared successfully');
  } catch (error) {
    Logger.error('❌ [Global] Failed to clear global context:', error);
  }
}

// Export functions for use by other modules
(global as any).clearGlobalContext = clearGlobalContext;
export { showAnalysisOverlay, sendAnalysisResult, setDictationMode, getDictationMode };

// Streaming handlers moved to SettingsIPCHandlers class