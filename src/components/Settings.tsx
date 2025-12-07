import React, { useState, useEffect } from 'react';
import { theme, themeComponents } from '../styles/theme';

// Tab types
type SettingsTab = 'general' | 'transcription' | 'ai-models' | 'system';

// Local Whisper model options
const WHISPER_MODELS = [
  { id: 'tiny.en', name: 'Tiny (English)', size: '75 MB', speed: 'Fastest' },
  { id: 'tiny', name: 'Tiny (Multi)', size: '75 MB', speed: 'Fastest' },
  { id: 'base.en', name: 'Base (English)', size: '142 MB', speed: 'Fast' },
  { id: 'base', name: 'Base (Multi)', size: '142 MB', speed: 'Fast' },
  { id: 'small.en', name: 'Small (English)', size: '466 MB', speed: 'Medium' },
  { id: 'small', name: 'Small (Multi)', size: '466 MB', speed: 'Medium' },
];

// AWS Regions for Bedrock
const AWS_REGIONS = [
  { id: 'us-east-1', name: 'US East (N. Virginia)' },
  { id: 'us-west-2', name: 'US West (Oregon)' },
  { id: 'eu-west-1', name: 'Europe (Ireland)' },
  { id: 'eu-central-1', name: 'Europe (Frankfurt)' },
  { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
  { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
  { id: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
];

const Settings: React.FC = () => {
  // Active tab
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // Settings state
  const [showNudges, setShowNudges] = useState(true);
  const [hotkey, setHotkey] = useState('fn');
  const [audioFeedback, setAudioFeedback] = useState(true);
  const [showOnStartup, setShowOnStartup] = useState(false);
  const [aiPostProcessing, setAiPostProcessing] = useState(true);
  const [useLocalWhisper, setUseLocalWhisper] = useState(false);
  const [localWhisperModel, setLocalWhisperModel] = useState('tiny.en');
  const [userName, setUserName] = useState('');
  const [showWaveform, setShowWaveform] = useState(true);

  // Transcription API Keys
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [deepgramApiKey, setDeepgramApiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showDeepgramKey, setShowDeepgramKey] = useState(false);

  // AI Model API Keys
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('');
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showAwsAccessKey, setShowAwsAccessKey] = useState(false);
  const [showAwsSecretKey, setShowAwsSecretKey] = useState(false);

  // Ollama Settings
  const [useOllama, setUseOllama] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<'connected' | 'error' | 'checking' | 'idle'>('idle');

  // Saving states
  const [transcriptionKeysSaving, setTranscriptionKeysSaving] = useState(false);
  const [transcriptionKeysSaved, setTranscriptionKeysSaved] = useState(false);
  const [aiKeysSaving, setAiKeysSaving] = useState(false);
  const [aiKeysSaved, setAiKeysSaved] = useState(false);

  // UI state
  const [isCustomizingHotkey, setIsCustomizingHotkey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Whisper model download state
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);

  // App version
  const [appVersion, setAppVersion] = useState('1.1.3');

  // Pre-defined hotkey options (single keys for push-to-talk)
  const presetHotkeys = [
    { key: 'fn', label: 'Function (fn)', description: 'Push-to-talk - behavior varies by keyboard/settings' },
    { key: 'option', label: 'Option (⌥)', description: 'Push-to-talk - left or right side' },
    { key: 'control', label: 'Control (⌃)', description: 'Push-to-talk - bottom left corner' },
    { key: 'command', label: 'Command (⌘)', description: 'Push-to-talk - left or right Command key' },
  ];

  // Tab configuration
  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'general',
      label: 'General',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    },
    {
      id: 'transcription',
      label: 'Transcription',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      )
    },
    {
      id: 'ai-models',
      label: 'AI Models',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      id: 'system',
      label: 'System',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
      )
    },
  ];

  // Get display label for hotkey
  const getHotkeyLabel = (key: string) => {
    const preset = presetHotkeys.find(p => p.key === key);
    return preset ? preset.label : key.toUpperCase();
  };

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await window.electronAPI.getAppVersion();
        setAppVersion(version);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    };
    fetchVersion();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const electronAPI = (window as any).electronAPI;

      if (electronAPI) {
        // Load app settings
        const appSettings = await electronAPI.appGetSettings();
        if (appSettings) {
          setHotkey(appSettings.hotkey);
          setAudioFeedback(appSettings.audioFeedback);
          setShowOnStartup(appSettings.showOnStartup);
          setAiPostProcessing(appSettings.aiPostProcessing);
          setUseLocalWhisper(appSettings.useLocalWhisper ?? false);
          setLocalWhisperModel(appSettings.localWhisperModel ?? 'tiny.en');
          setUserName(appSettings.userName ?? '');
          setShowWaveform(appSettings.showWaveform ?? true);
        }

        // Load API keys
        if (electronAPI.getApiKeys) {
          const apiKeys = await electronAPI.getApiKeys();
          if (apiKeys) {
            setOpenaiApiKey(apiKeys.openaiApiKey || '');
            setDeepgramApiKey(apiKeys.deepgramApiKey || '');
            setGeminiApiKey(apiKeys.geminiApiKey || '');
            setAnthropicApiKey(apiKeys.anthropicApiKey || '');
            setAwsAccessKeyId(apiKeys.awsAccessKeyId || '');
            setAwsSecretAccessKey(apiKeys.awsSecretAccessKey || '');
            setAwsRegion(apiKeys.awsRegion || 'us-east-1');

            // Allow appSettings to override API key service if needed, or just load from app settings
            if (appSettings) {
              setUseOllama(appSettings.useOllama || false);
              setOllamaUrl(appSettings.ollamaUrl || 'http://localhost:11434');
              setOllamaModel(appSettings.ollamaModel || 'llama3');

              // If enabled, try to fetch models immediately to check status
              if (appSettings.useOllama) {
                fetchOllamaModels(appSettings.ollamaUrl || 'http://localhost:11434');
              }
            }
          }
        }

        // Load nudge settings
        const nudgeSettings = await electronAPI.nudgeGetSettings();
        if (nudgeSettings) {
          setShowNudges(nudgeSettings.enabled);
        }

        // Load downloaded whisper models
        if (electronAPI.whisperGetDownloadedModels) {
          const models = await electronAPI.whisperGetDownloadedModels();
          setDownloadedModels(models || []);
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNudgeToggle = async () => {
    try {
      setIsSaving(true);
      const newValue = !showNudges;
      const electronAPI = (window as any).electronAPI;

      if (electronAPI && electronAPI.nudgeUpdateSettings) {
        await electronAPI.nudgeUpdateSettings({ enabled: newValue });
        setShowNudges(newValue);
      }
    } catch (error) {
      console.error('Failed to update nudge settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleShowOnStartupToggle = async () => {
    try {
      setIsSaving(true);
      const newValue = !showOnStartup;
      const electronAPI = (window as any).electronAPI;

      if (electronAPI && electronAPI.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ showOnStartup: newValue });
        setShowOnStartup(newValue);
      }
    } catch (error) {
      console.error('Failed to update startup settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleHotkeyChange = async (newHotkey: string) => {
    try {
      console.log(`🔧 [Settings] Hotkey change requested: ${hotkey} -> ${newHotkey}`);
      setIsSaving(true);

      // Update UI immediately for responsiveness
      setHotkey(newHotkey);

      // Send to main process to update settings and restart monitoring
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ hotkey: newHotkey });
        console.log(`✅ [Settings] Hotkey successfully changed to: ${newHotkey}`);
      }

    } catch (error) {
      console.error('❌ [Settings] Failed to change hotkey:', error);
      // Revert UI state on error
      setHotkey(hotkey);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAudioFeedbackToggle = async () => {
    try {
      setIsSaving(true);
      const newValue = !audioFeedback;
      const electronAPI = (window as any).electronAPI;

      if (electronAPI && electronAPI.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ audioFeedback: newValue });
        setAudioFeedback(newValue);
      }
    } catch (error) {
      console.error('Failed to update audio feedback settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiPostProcessingToggle = async () => {
    try {
      setIsSaving(true);
      const newValue = !aiPostProcessing;
      const electronAPI = (window as any).electronAPI;

      if (electronAPI && electronAPI.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ aiPostProcessing: newValue });
        setAiPostProcessing(newValue);
      }
    } catch (error) {
      console.error('Failed to update AI post-processing settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLocalWhisperToggle = async () => {
    try {
      setIsSaving(true);
      const newValue = !useLocalWhisper;
      const electronAPI = (window as any).electronAPI;

      if (electronAPI && electronAPI.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ useLocalWhisper: newValue });
        setUseLocalWhisper(newValue);
      }
    } catch (error) {
      console.error('Failed to update local Whisper settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLocalWhisperModelChange = async (modelId: string) => {
    try {
      const electronAPI = (window as any).electronAPI;

      // Check if model is already downloaded
      const isDownloaded = downloadedModels.includes(modelId);

      if (!isDownloaded && electronAPI?.whisperDownloadModel) {
        // Start downloading
        setDownloadingModel(modelId);
        setDownloadProgress(0);

        // Set up progress listener
        electronAPI.onWhisperDownloadProgress?.((data: { modelId: string; percent: number }) => {
          if (data.modelId === modelId) {
            setDownloadProgress(data.percent);
          }
        });

        // Download the model
        const result = await electronAPI.whisperDownloadModel(modelId);

        // Clean up listener
        electronAPI.removeWhisperDownloadProgressListener?.();

        if (!result?.success) {
          console.error('Failed to download model');
          setDownloadingModel(null);
          return;
        }

        // Update downloaded models list
        setDownloadedModels(prev => [...prev, modelId]);
        setDownloadingModel(null);
      }

      // Save the model selection
      setIsSaving(true);
      if (electronAPI?.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ localWhisperModel: modelId });
        setLocalWhisperModel(modelId);
      }
    } catch (error) {
      console.error('Failed to update local Whisper model:', error);
      setDownloadingModel(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUserNameChange = async (newName: string) => {
    try {
      const electronAPI = (window as any).electronAPI;
      setUserName(newName);

      if (electronAPI && electronAPI.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ userName: newName });
      }
    } catch (error) {
      console.error('Failed to update user name:', error);
    }
  };

  const handleShowWaveformToggle = async () => {
    try {
      setIsSaving(true);
      const newValue = !showWaveform;
      const electronAPI = (window as any).electronAPI;

      if (electronAPI && electronAPI.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ showWaveform: newValue });
        setShowWaveform(newValue);
      }
    } catch (error) {
      console.error('Failed to update waveform settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTranscriptionKeys = async () => {
    try {
      setTranscriptionKeysSaving(true);
      setTranscriptionKeysSaved(false);
      const electronAPI = (window as any).electronAPI;

      if (electronAPI && electronAPI.saveApiKeys) {
        await electronAPI.saveApiKeys({
          openaiApiKey: openaiApiKey.trim(),
          deepgramApiKey: deepgramApiKey.trim(),
        });
        setTranscriptionKeysSaved(true);
        setTimeout(() => setTranscriptionKeysSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save transcription keys:', error);
    } finally {
      setTranscriptionKeysSaving(false);
    }
  };

  const handleSaveAiKeys = async () => {
    try {
      setAiKeysSaving(true);
      setAiKeysSaved(false);
      const electronAPI = (window as any).electronAPI;

      if (electronAPI && electronAPI.saveApiKeys) {
        await electronAPI.saveApiKeys({
          geminiApiKey: geminiApiKey.trim(),
          anthropicApiKey: anthropicApiKey.trim(),
          awsAccessKeyId: awsAccessKeyId.trim(),
          awsSecretAccessKey: awsSecretAccessKey.trim(),
          awsRegion: awsRegion,
        });
        setAiKeysSaved(true);
        setTimeout(() => setAiKeysSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save AI keys:', error);
    } finally {
      setAiKeysSaving(false);
    }
  };

  const handleOllamaToggle = async () => {
    try {
      setIsSaving(true);
      const newValue = !useOllama;
      const electronAPI = (window as any).electronAPI;

      if (electronAPI && electronAPI.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ useOllama: newValue });
        setUseOllama(newValue);
      }
    } catch (error) {
      console.error('Failed to update Ollama settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOllamaUrlChange = async (url: string) => {
    setOllamaUrl(url); // Update UI immediately
    // Debounce saving in real app, but here we just update state and save on blur or separate effect if needed
    // For now, let's just save it
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ ollamaUrl: url });
      }
    } catch (e) { console.error(e); }
  };

  const handleOllamaModelChange = async (model: string) => {
    setOllamaModel(model);
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ ollamaModel: model });
      }
    } catch (e) { console.error(e); }
  };

  const fetchOllamaModels = async (url: string) => {
    setOllamaStatus('checking');
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.ollamaGetModels) {
        const result = await electronAPI.ollamaGetModels(url);
        if (result.success) {
          setAvailableOllamaModels(result.models);
          setOllamaStatus('connected');
        } else {
          setOllamaStatus('error');
          // Keep previous models if any, or clear? Better to keep just in case of transient error, 
          // but status error warns user.
        }
      }
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error);
      setOllamaStatus('error');
    }
  };

  const handleOllamaUrlBlur = () => {
    if (useOllama) {
      fetchOllamaModels(ollamaUrl);
    }
  };

  const openExternalLink = (url: string) => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.openExternal) {
      electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  // Toggle component for reuse
  const Toggle = ({ enabled, onToggle, disabled = false }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) => (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`relative w-12 h-6 rounded-full transition-all duration-200 ${enabled
        ? `${theme.glass.secondary} border border-white/20`
        : `${theme.glass.secondary} border border-white/10`
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'
        } ${theme.shadow.lg}`} />
    </button>
  );

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6 font-inter">
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-white/30 border-t-transparent rounded-full animate-spin mr-3"></div>
          <p className="text-white/60">Loading settings...</p>
        </div>
      </div>
    );
  }

  // Render General Tab
  const renderGeneralTab = () => (
    <div className="space-y-6">
      {/* User Profile */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-6 flex items-center gap-2`}>
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          User Profile
        </h3>

        <div>
          <label className={`block text-sm font-medium ${theme.text.primary} mb-2`}>
            Your Name
          </label>
          <input
            type="text"
            value={userName}
            onChange={(e) => handleUserNameChange(e.target.value)}
            placeholder="Enter your name for email signatures"
            className={`w-full bg-black/40 rounded-xl px-4 py-3 ${theme.text.primary} border border-white/20 focus:border-white/40 focus:outline-none transition-colors text-sm placeholder-white/30`}
          />
          <p className={`text-xs ${theme.text.tertiary} mt-2`}>
            This name will be used for email signatures when you dictate emails
          </p>
        </div>
      </div>

      {/* Voice & Hotkeys */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-6 flex items-center gap-2`}>
          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 0112.728 0" />
          </svg>
          Voice & Hotkeys
        </h3>

        <div className="space-y-6">
          {/* Hotkey Selection */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>Dictation Hotkey</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Press and hold to start dictation</p>
            </div>
            <div className="flex items-center space-x-2">
              <kbd className={`${theme.glass.secondary} ${theme.radius.md} px-3 py-2 text-sm font-mono ${theme.text.primary} ${theme.shadow}`}>
                {getHotkeyLabel(hotkey)}
              </kbd>
              <button
                onClick={() => setIsCustomizingHotkey(true)}
                className={`${theme.text.secondary} hover:${theme.text.primary} text-sm font-medium transition-colors`}
              >
                Change
              </button>
            </div>
          </div>

          {/* Audio Feedback */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>Audio Feedback</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Play sounds during dictation</p>
            </div>
            <Toggle enabled={audioFeedback} onToggle={handleAudioFeedbackToggle} />
          </div>

          {/* Show Waveform */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>Show Waveform</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Display visual waveform window while recording</p>
            </div>
            <Toggle enabled={showWaveform} onToggle={handleShowWaveformToggle} />
          </div>

          {/* AI Post-Processing */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>AI Post-Processing</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Clean up filler words and improve grammar</p>
            </div>
            <Toggle enabled={aiPostProcessing} onToggle={handleAiPostProcessingToggle} />
          </div>
        </div>
      </div>
    </div>
  );

  // Render Transcription Tab
  const renderTranscriptionTab = () => (
    <div className="space-y-6">
      {/* Local Whisper */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-6 flex items-center gap-2`}>
          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Local Whisper
          <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-purple-500/10 text-purple-400 rounded-md border border-purple-500/20">
            Offline
          </span>
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>Use Local Whisper</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>100% private, works offline. No API key needed.</p>
            </div>
            <Toggle enabled={useLocalWhisper} onToggle={handleLocalWhisperToggle} />
          </div>

          {useLocalWhisper && (
            <div className={`${theme.glass.secondary} rounded-lg p-4 border border-white/5 mt-3`}>
              <label className={`block text-sm font-medium ${theme.text.primary} mb-2`}>
                Whisper Model
              </label>

              {downloadingModel && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-white/60 mb-1">
                    <span>Downloading {WHISPER_MODELS.find(m => m.id === downloadingModel)?.name}...</span>
                    <span>{downloadProgress}%</span>
                  </div>
                  <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="relative">
                <select
                  value={localWhisperModel}
                  onChange={(e) => handleLocalWhisperModelChange(e.target.value)}
                  disabled={!!downloadingModel}
                  className={`w-full bg-black/40 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-white/40 focus:outline-none transition-colors text-sm appearance-none ${downloadingModel ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {WHISPER_MODELS.map((model) => {
                    const isDownloaded = downloadedModels.includes(model.id);
                    return (
                      <option key={model.id} value={model.id} className="bg-gray-900 text-white py-2">
                        {model.name} - {model.size} ({model.speed}) {isDownloaded ? '✓' : '↓'}
                      </option>
                    );
                  })}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <p className={`text-xs ${theme.text.tertiary} mt-2`}>
                ✓ = downloaded, ↓ = needs download. Smaller models are faster but less accurate.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cloud Transcription APIs */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-2 flex items-center gap-2`}>
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          Cloud Transcription APIs
        </h3>
        <p className={`text-sm ${theme.text.tertiary} mb-6`}>
          For faster, more accurate transcription. Keys are stored locally.
        </p>

        <div className="space-y-4">
          {/* Deepgram API Key */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-sm font-medium ${theme.text.primary} flex items-center gap-2`}>
                Deepgram API Key
                <span className="px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-400 rounded-md border border-green-500/20">
                  Recommended
                </span>
              </label>
              <button
                onClick={() => openExternalLink('https://console.deepgram.com/')}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Get a key →
              </button>
            </div>
            <div className="relative">
              <input
                type={showDeepgramKey ? 'text' : 'password'}
                value={deepgramApiKey}
                onChange={(e) => setDeepgramApiKey(e.target.value)}
                placeholder="Enter your Deepgram API key"
                className="w-full bg-black/40 rounded-xl px-4 py-3 pr-20 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-colors font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowDeepgramKey(!showDeepgramKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-sm transition-colors"
              >
                {showDeepgramKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className={`text-xs ${theme.text.tertiary} mt-1`}>Fastest real-time transcription with Nova-3 ($200 free credits)</p>
          </div>

          {/* OpenAI API Key */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-sm font-medium ${theme.text.primary}`}>
                OpenAI API Key
              </label>
              <button
                onClick={() => openExternalLink('https://platform.openai.com/api-keys')}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Get a key →
              </button>
            </div>
            <div className="relative">
              <input
                type={showOpenaiKey ? 'text' : 'password'}
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-black/40 rounded-xl px-4 py-3 pr-20 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-colors font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-sm transition-colors"
              >
                {showOpenaiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className={`text-xs ${theme.text.tertiary} mt-1`}>For OpenAI Whisper API transcription</p>
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <button
              onClick={handleSaveTranscriptionKeys}
              disabled={transcriptionKeysSaving}
              className={`${theme.glass.secondary} ${theme.text.primary} px-6 py-2.5 ${theme.radius.lg} font-medium hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center border border-white/20`}
            >
              {transcriptionKeysSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Saving...
                </>
              ) : transcriptionKeysSaved ? (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved!
                </>
              ) : (
                'Save Transcription Keys'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Render AI Models Tab
  const renderAiModelsTab = () => (
    <div className="space-y-6">
      {/* Ollama (Local) */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-2 flex items-center gap-2`}>
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          Ollama (Local LLM)
          <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20">
            Local & Private
          </span>
        </h3>
        <p className={`text-sm ${theme.text.tertiary} mb-4`}>
          Run any model locally via Ollama. Requires Ollama to be running.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>Use Ollama</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Prioritize local Ollama model over cloud APIs</p>
            </div>
            <Toggle enabled={useOllama} onToggle={handleOllamaToggle} />
          </div>

          {useOllama && (
            <div className={`${theme.glass.secondary} rounded-lg p-4 border border-white/5 space-y-4`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`block text-sm font-medium ${theme.text.primary}`}>
                    Ollama URL
                  </label>
                  <div className="flex items-center gap-2">
                    {ollamaStatus === 'checking' && <span className="text-xs text-yellow-400">Checking...</span>}
                    {ollamaStatus === 'connected' && <span className="text-xs text-emerald-400 flex items-center gap-1">● Connected</span>}
                    {ollamaStatus === 'error' && <span className="text-xs text-red-400 flex items-center gap-1">● Connection Failed</span>}
                    <button
                      onClick={() => fetchOllamaModels(ollamaUrl)}
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      Check Connection
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => handleOllamaUrlChange(e.target.value)}
                  onBlur={handleOllamaUrlBlur}
                  className={`w-full bg-black/40 rounded-xl px-4 py-3 text-white border focus:outline-none transition-colors text-sm ${ollamaStatus === 'error' ? 'border-red-500/50 focus:border-red-500' : 'border-white/20 focus:border-white/40'
                    }`}
                  placeholder="http://localhost:11434"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${theme.text.primary} mb-2`}>
                  Model Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={(e) => handleOllamaModelChange(e.target.value)}
                    className="w-full bg-black/40 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-white/40 focus:outline-none transition-colors text-sm"
                    placeholder="llama3"
                    list="ollama-models"
                  />
                  <datalist id="ollama-models">
                    {availableOllamaModels.length > 0 ? (
                      availableOllamaModels.map(model => (
                        <option key={model} value={model} />
                      ))
                    ) : (
                      <>
                        <option value="llama3" />
                        <option value="mistral" />
                        <option value="sam860/LFM2:1.2b" />
                        <option value="gemma" />
                        <option value="qwen2" />
                      </>
                    )}
                  </datalist>
                </div>
                <p className={`text-xs ${theme.text.tertiary} mt-2`}>
                  {availableOllamaModels.length > 0
                    ? `Found ${availableOllamaModels.length} local models. Select one or type manually.`
                    : "Type the exact model name from the Ollama library. e.g. sam860/LFM2:1.2b"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Google Gemini */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-2 flex items-center gap-2`}>
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Google Gemini
          <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-400 rounded-md border border-blue-500/20">
            Primary
          </span>
        </h3>
        <p className={`text-sm ${theme.text.tertiary} mb-4`}>
          Powers AI post-processing, grammar correction, and smart formatting.
        </p>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={`text-sm font-medium ${theme.text.primary}`}>
              Gemini API Key
            </label>
            <button
              onClick={() => openExternalLink('https://aistudio.google.com/app/apikey')}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Get a key →
            </button>
          </div>
          <div className="relative">
            <input
              type={showGeminiKey ? 'text' : 'password'}
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="Enter your Gemini API key"
              className="w-full bg-black/40 rounded-xl px-4 py-3 pr-20 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-colors font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowGeminiKey(!showGeminiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-sm transition-colors"
            >
              {showGeminiKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className={`text-xs ${theme.text.tertiary} mt-1`}>Free tier: 1 million tokens/day with Gemini 2.5 Flash</p>
        </div>
      </div>

      {/* Anthropic Claude */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-2 flex items-center gap-2`}>
          <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Anthropic Claude
          <span className="px-2 py-0.5 text-xs font-medium bg-white/10 text-white/60 rounded-md border border-white/10">
            Optional
          </span>
        </h3>
        <p className={`text-sm ${theme.text.tertiary} mb-4`}>
          Alternative AI model for processing.
        </p>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={`text-sm font-medium ${theme.text.primary}`}>
              Anthropic API Key
            </label>
            <button
              onClick={() => openExternalLink('https://console.anthropic.com/')}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Get a key →
            </button>
          </div>
          <div className="relative">
            <input
              type={showAnthropicKey ? 'text' : 'password'}
              value={anthropicApiKey}
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full bg-black/40 rounded-xl px-4 py-3 pr-20 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-colors font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowAnthropicKey(!showAnthropicKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-sm transition-colors"
            >
              {showAnthropicKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      </div>

      {/* AWS Bedrock */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-2 flex items-center gap-2`}>
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          AWS Bedrock
          <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400 rounded-md border border-amber-500/20">
            Enterprise
          </span>
        </h3>
        <p className={`text-sm ${theme.text.tertiary} mb-4`}>
          Access Claude, Titan, and other models through AWS infrastructure.
        </p>

        <div className="space-y-4">
          {/* AWS Access Key ID */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-sm font-medium ${theme.text.primary}`}>
                AWS Access Key ID
              </label>
              <button
                onClick={() => openExternalLink('https://console.aws.amazon.com/iam/home#/security_credentials')}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Get credentials →
              </button>
            </div>
            <div className="relative">
              <input
                type={showAwsAccessKey ? 'text' : 'password'}
                value={awsAccessKeyId}
                onChange={(e) => setAwsAccessKeyId(e.target.value)}
                placeholder="AKIA..."
                className="w-full bg-black/40 rounded-xl px-4 py-3 pr-20 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-colors font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowAwsAccessKey(!showAwsAccessKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-sm transition-colors"
              >
                {showAwsAccessKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* AWS Secret Access Key */}
          <div>
            <label className={`block text-sm font-medium ${theme.text.primary} mb-2`}>
              AWS Secret Access Key
            </label>
            <div className="relative">
              <input
                type={showAwsSecretKey ? 'text' : 'password'}
                value={awsSecretAccessKey}
                onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                placeholder="Enter your secret access key"
                className="w-full bg-black/40 rounded-xl px-4 py-3 pr-20 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-colors font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowAwsSecretKey(!showAwsSecretKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-sm transition-colors"
              >
                {showAwsSecretKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* AWS Region */}
          <div>
            <label className={`block text-sm font-medium ${theme.text.primary} mb-2`}>
              AWS Region
            </label>
            <div className="relative">
              <select
                value={awsRegion}
                onChange={(e) => setAwsRegion(e.target.value)}
                className="w-full bg-black/40 rounded-xl px-4 py-3 text-white border border-white/20 focus:border-white/40 focus:outline-none transition-colors text-sm appearance-none cursor-pointer"
              >
                {AWS_REGIONS.map((region) => (
                  <option key={region.id} value={region.id} className="bg-gray-900 text-white">
                    {region.name} ({region.id})
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <p className={`text-xs ${theme.text.tertiary} mt-1`}>Select the region where Bedrock is enabled</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-2">
        <button
          onClick={handleSaveAiKeys}
          disabled={aiKeysSaving}
          className={`${theme.glass.secondary} ${theme.text.primary} px-6 py-2.5 ${theme.radius.lg} font-medium hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center border border-white/20`}
        >
          {aiKeysSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin mr-2"></div>
              Saving...
            </>
          ) : aiKeysSaved ? (
            <>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved!
            </>
          ) : (
            'Save AI Model Keys'
          )}
        </button>
      </div>
    </div>
  );

  // Render System Tab
  const renderSystemTab = () => (
    <div className="space-y-6">
      {/* Startup & Behavior */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-6 flex items-center gap-2`}>
          <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          Startup & Behavior
        </h3>

        <div className="space-y-6">
          {/* Launch on Startup */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>Launch on Mac Startup</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Automatically start Jarvis when you log in</p>
            </div>
            <Toggle enabled={showOnStartup} onToggle={handleShowOnStartupToggle} disabled={isSaving} />
          </div>

          {/* Show Nudges */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>Show Voice Nudges</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Display helpful voice reminders while typing</p>
            </div>
            <Toggle enabled={showNudges} onToggle={handleNudgeToggle} disabled={isSaving} />
          </div>
        </div>
      </div>

      {/* About */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-4 flex items-center gap-2`}>
          <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          About
        </h3>

        <div className={`${theme.glass.secondary} rounded-lg p-5 border border-white/5`}>
          {/* Logo and App Info */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-white/20 to-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/20 shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 20 20" height="32px" viewBox="0 0 20 20" width="32px" fill="#ffffff">
                <rect fill="none" height="20" width="20" y="0" />
                <path d="M15.98,5.82L10,2.5L4.02,5.82l3.8,2.11C8.37,7.36,9.14,7,10,7s1.63,0.36,2.17,0.93L15.98,5.82z M8.5,10 c0-0.83,0.67-1.5,1.5-1.5s1.5,0.67,1.5,1.5s-0.67,1.5-1.5,1.5S8.5,10.83,8.5,10z M9.25,17.08l-6-3.33V7.11L7.1,9.24 C7.03,9.49,7,9.74,7,10c0,1.4,0.96,2.57,2.25,2.91V17.08z M10.75,17.08v-4.18C12.04,12.57,13,11.4,13,10c0-0.26-0.03-0.51-0.1-0.76 l3.85-2.14l0,6.64L10.75,17.08z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className={`text-lg font-semibold ${theme.text.primary}`}>Jarvis AI Assistant</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Version {appVersion}</p>
              <p className={`text-xs ${theme.text.tertiary} mt-1`}>
                Your intelligent voice companion for macOS
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/5 my-4"></div>

          {/* Credits */}
          <div className="mb-4">
            <p className={`text-sm ${theme.text.secondary}`}>
              Built with ❤️ (and a lot of coffee) by <span className="text-blue-400 font-medium">Akshay</span>
            </p>
            <p className={`text-xs ${theme.text.tertiary} mt-2`}>
              100% open-source • 100% free forever • 100% local privacy
            </p>
            <p className={`text-xs ${theme.text.tertiary} mt-3 italic`}>
              Made this because I got tired of paying for voice apps.<br />
              Hope it saves you the same headache.
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-white/5 my-4"></div>

          {/* Share Request */}
          <p className={`text-xs ${theme.text.tertiary} mb-4`}>
            If it's useful → star on GitHub or tell one friend.<br />
            That's literally all the "payment" I want 😂
          </p>

          {/* Links */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => openExternalLink('https://github.com/akshayaggarwal99/jarvis-ai-assistant')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-all"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </button>
            <button
              onClick={() => openExternalLink('https://x.com/hiakshayy')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-all"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Twitter
            </button>
            <button
              onClick={() => openExternalLink('https://jarvis.ceo')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c-1.657 0-3-4.03-3-9s1.343-9 3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Website
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-6 font-inter">
      {/* Header */}
      <div className="mb-6">
        <h1 className={`text-2xl font-medium ${theme.text.primary} mb-2`}>Settings</h1>
        <p className={theme.text.secondary}>Configure your Jarvis experience</p>
      </div>

      {/* Tab Navigation */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-1.5 mb-6 flex gap-1`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 ${theme.radius.lg} text-sm font-medium transition-all duration-200 ${activeTab === tab.id
              ? `${theme.glass.active} ${theme.text.primary} border border-white/20 ${theme.shadow}`
              : `${theme.text.tertiary} hover:${theme.text.secondary} hover:bg-white/5`
              }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'general' && renderGeneralTab()}
        {activeTab === 'transcription' && renderTranscriptionTab()}
        {activeTab === 'ai-models' && renderAiModelsTab()}
        {activeTab === 'system' && renderSystemTab()}
      </div>

      {/* Customization Modal */}
      {isCustomizingHotkey && (
        <div className={`fixed inset-0 ${theme.background.modal} flex items-center justify-center z-50`}>
          <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 w-full max-w-lg ${theme.shadow["2xl"]}`}>
            <h3 className={`text-lg font-semibold ${theme.text.primary} mb-4`}>Choose Dictation Key</h3>
            <p className={`text-sm ${theme.text.tertiary} mb-6`}>
              Select a key to use for push-to-talk dictation. Hold the key down to start recording, release to stop.
            </p>

            <div className="space-y-3">
              {presetHotkeys.map((preset) => (
                <label key={preset.key} className={`flex items-center space-x-3 p-3 ${theme.radius.xl} ${theme.glass.secondary} transition-all duration-200 cursor-pointer border ${hotkey === preset.key
                  ? `${theme.glass.active} border-white/30 ${theme.shadow.lg}`
                  : `border-white/10 hover:${theme.glass.hover}`
                  }`}>
                  <div className="relative">
                    <input
                      type="radio"
                      name="hotkey"
                      value={preset.key}
                      checked={hotkey === preset.key}
                      onChange={(e) => setHotkey(e.target.value)}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${hotkey === preset.key
                      ? 'border-white bg-white'
                      : 'border-white/40'
                      }`}>
                      {hotkey === preset.key && (
                        <div className="w-2 h-2 rounded-full bg-gray-900"></div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium ${theme.text.primary}`}>{preset.label}</div>
                    <div className={`text-xs ${theme.text.tertiary}`}>{preset.description}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setIsCustomizingHotkey(false);
                  loadSettings();
                }}
                className={`flex-1 ${theme.text.secondary} px-4 py-2 ${theme.radius.lg} hover:${theme.glass.secondary} transition-colors`}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleHotkeyChange(hotkey);
                  setIsCustomizingHotkey(false);
                }}
                disabled={isSaving}
                className={`flex-1 ${theme.glass.secondary} ${theme.text.primary} px-4 py-2 ${theme.radius.lg} font-medium hover:${theme.glass.hover} transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center border border-white/20`}
              >
                {isSaving ? (
                  <>
                                       <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin mr-2"></div>
                    Saving...
                  </>
                ) : (
                  'Done'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
