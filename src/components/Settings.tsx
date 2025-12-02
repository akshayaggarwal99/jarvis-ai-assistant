import React, { useState, useEffect } from 'react';
import { theme, themeComponents } from '../styles/theme';

// Local Whisper model options
const WHISPER_MODELS = [
  { id: 'tiny.en', name: 'Tiny (English)', size: '75 MB', speed: 'Fastest' },
  { id: 'tiny', name: 'Tiny (Multi)', size: '75 MB', speed: 'Fastest' },
  { id: 'base.en', name: 'Base (English)', size: '142 MB', speed: 'Fast' },
  { id: 'base', name: 'Base (Multi)', size: '142 MB', speed: 'Fast' },
  { id: 'small.en', name: 'Small (English)', size: '466 MB', speed: 'Medium' },
  { id: 'small', name: 'Small (Multi)', size: '466 MB', speed: 'Medium' },
];

const Settings: React.FC = () => {
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
  
  // API Keys state
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [deepgramApiKey, setDeepgramApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showDeepgramKey, setShowDeepgramKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [apiKeysSaving, setApiKeysSaving] = useState(false);
  const [apiKeysSaved, setApiKeysSaved] = useState(false);
  
  // UI state
  const [isCustomizingHotkey, setIsCustomizingHotkey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Whisper model download state
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);

  // Pre-defined hotkey options (single keys for push-to-talk)
  const presetHotkeys = [
    { key: 'fn', label: 'Function (fn)', description: 'Push-to-talk - behavior varies by keyboard/settings' },
    { key: 'option', label: 'Option (⌥)', description: 'Push-to-talk - left or right side' },
    { key: 'control', label: 'Control (⌃)', description: 'Push-to-talk - bottom left corner' },
    { key: 'command', label: 'Command (⌘)', description: 'Push-to-talk - left or right Command key' },
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

  const handleSaveApiKeys = async () => {
    try {
      setApiKeysSaving(true);
      setApiKeysSaved(false);
      const electronAPI = (window as any).electronAPI;
      
      if (electronAPI && electronAPI.saveApiKeys) {
        await electronAPI.saveApiKeys({
          openaiApiKey: openaiApiKey.trim(),
          deepgramApiKey: deepgramApiKey.trim(),
          geminiApiKey: geminiApiKey.trim(),
        });
        setApiKeysSaved(true);
        setTimeout(() => setApiKeysSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save API keys:', error);
    } finally {
      setApiKeysSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6 font-inter">
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-white/30 border-t-transparent rounded-full animate-spin mr-3"></div>
          <p className="text-white/60">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8 font-inter">
      {/* Header */}
      <div className="mb-8">
        <h1 className={`text-2xl font-medium ${theme.text.primary} mb-2`}>Settings</h1>
        <p className={theme.text.secondary}>Configure your Jarvis experience</p>
      </div>

      {/* User Profile */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-6`}>User Profile</h3>
        
        <div className="space-y-4">
          {/* User Name */}
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
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
            />
            <p className={`text-xs ${theme.text.tertiary} mt-2`}>
              This name will be used for email signatures when you dictate emails
            </p>
          </div>
        </div>
      </div>

      {/* Voice & Hotkeys */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-6`}>Voice & Hotkeys</h3>
        
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
            <button
              onClick={handleAudioFeedbackToggle}
              className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
                audioFeedback 
                  ? `${theme.glass.secondary} border border-white/20` 
                  : `${theme.glass.secondary} border border-white/10`
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                audioFeedback ? 'translate-x-6' : 'translate-x-0.5'
              } ${theme.shadow.lg}`} />
            </button>
          </div>

          {/* Show Waveform */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>Show Waveform</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Display visual waveform window while recording</p>
            </div>
            <button
              onClick={handleShowWaveformToggle}
              className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
                showWaveform 
                  ? `${theme.glass.secondary} border border-white/20` 
                  : `${theme.glass.secondary} border border-white/10`
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                showWaveform ? 'translate-x-6' : 'translate-x-0.5'
              } ${theme.shadow.lg}`} />
            </button>
          </div>

          {/* AI Post-Processing */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>AI Post-Processing</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Clean up filler words and improve grammar after transcription</p>
            </div>
            <button
              onClick={handleAiPostProcessingToggle}
              className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
                aiPostProcessing 
                  ? `${theme.glass.secondary} border border-white/20` 
                  : `${theme.glass.secondary} border border-white/10`
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                aiPostProcessing ? 'translate-x-6' : 'translate-x-0.5'
              } ${theme.shadow.lg}`} />
            </button>
          </div>

          {/* Local Whisper (Offline Mode) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium ${theme.text.primary} mb-1`}>
                  Local Whisper 
                  <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-purple-500/10 text-purple-400 rounded-md border border-purple-500/20">
                    Offline
                  </span>
                </h4>
                <p className={`text-sm ${theme.text.tertiary}`}>Use Whisper model locally. No API key needed, works offline</p>
              </div>
              <button
                onClick={handleLocalWhisperToggle}
                className={`relative w-12 h-6 rounded-full transition-all duration-200 ${
                  useLocalWhisper 
                    ? `${theme.glass.secondary} border border-white/20` 
                    : `${theme.glass.secondary} border border-white/10`
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                  useLocalWhisper ? 'translate-x-6' : 'translate-x-0.5'
                } ${theme.shadow.lg}`} />
              </button>
            </div>
            
            {/* Model Selection - Only show when Local Whisper is enabled */}
            {useLocalWhisper && (
              <div className={`${theme.glass.secondary} rounded-lg p-4 border border-white/5 mt-3`}>
                <label className={`block text-sm font-medium ${theme.text.primary} mb-2`}>
                  Whisper Model
                </label>
                
                {/* Download Progress Bar */}
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
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
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
                  {/* Custom dropdown arrow */}
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
      </div>

      {/* API Keys */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow.lg}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-2`}>API Keys</h3>
        <p className={`text-sm ${theme.text.tertiary} mb-6`}>
          Your API keys are stored locally and never uploaded. Get keys from{' '}
          <button 
            className="text-blue-400 hover:text-blue-300 underline"
            onClick={() => {
              const electronAPI = (window as any).electronAPI;
              if (electronAPI?.openExternal) {
                electronAPI.openExternal('https://platform.openai.com/api-keys');
              } else {
                window.open('https://platform.openai.com/api-keys', '_blank');
              }
            }}
          >
            OpenAI
          </button>,{' '}
          <button 
            className="text-blue-400 hover:text-blue-300 underline"
            onClick={() => {
              const electronAPI = (window as any).electronAPI;
              if (electronAPI?.openExternal) {
                electronAPI.openExternal('https://console.deepgram.com/');
              } else {
                window.open('https://console.deepgram.com/', '_blank');
              }
            }}
          >
            Deepgram
          </button>, or{' '}
          <button 
            className="text-blue-400 hover:text-blue-300 underline"
            onClick={() => {
              const electronAPI = (window as any).electronAPI;
              if (electronAPI?.openExternal) {
                electronAPI.openExternal('https://aistudio.google.com/app/apikey');
              } else {
                window.open('https://aistudio.google.com/app/apikey', '_blank');
              }
            }}
          >
            Google AI Studio
          </button>.
        </p>
        
        <div className="space-y-4">
          {/* OpenAI API Key */}
          <div>
            <label className={`block text-sm font-medium ${theme.text.primary} mb-2`}>
              OpenAI API Key
            </label>
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
            <p className={`text-xs ${theme.text.tertiary} mt-1`}>Required for AI features and Whisper transcription</p>
          </div>
          
          {/* Deepgram API Key */}
          <div>
            <label className={`block text-sm font-medium ${theme.text.primary} mb-2`}>
              Deepgram API Key <span className={theme.text.tertiary}>(Recommended)</span>
            </label>
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
            <p className={`text-xs ${theme.text.tertiary} mt-1`}>Faster transcription with Deepgram Nova-3</p>
          </div>
          
          {/* Gemini API Key */}
          <div>
            <label className={`block text-sm font-medium ${theme.text.primary} mb-2`}>
              Gemini API Key
            </label>
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
            <p className={`text-xs ${theme.text.tertiary} mt-1`}>For Gemini 2.5 Flash AI features</p>
          </div>
          
          {/* Save Button */}
          <div className="pt-2">
            <button
              onClick={handleSaveApiKeys}
              disabled={apiKeysSaving}
              className={`${theme.glass.secondary} ${theme.text.primary} px-6 py-2.5 ${theme.radius.lg} font-medium hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center border border-white/20`}
            >
              {apiKeysSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Saving...
                </>
              ) : apiKeysSaved ? (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved!
                </>
              ) : (
                'Save API Keys'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Visual Experience */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow.lg}`}>
        <h3 className={`font-medium ${theme.text.primary} mb-6`}>Visual Experience</h3>
        
        <div className="space-y-6">
          {/* Show Nudges */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>Show Voice Nudges</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Display helpful voice reminders while typing</p>
            </div>
            <button 
              onClick={handleNudgeToggle}
              disabled={isSaving}
              className={`w-12 h-6 rounded-full transition-all duration-200 relative ${
                showNudges 
                  ? `${theme.glass.secondary} border border-white/20` 
                  : `${theme.glass.secondary} border border-white/10`
              } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                showNudges ? 'translate-x-6' : 'translate-x-0.5'
              } ${theme.shadow.lg}`} />
            </button>
          </div>

          {/* Launch on Startup */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium ${theme.text.primary} mb-1`}>Launch on Mac Startup</h4>
              <p className={`text-sm ${theme.text.tertiary}`}>Automatically start Jarvis when you log in to your Mac</p>
            </div>
            <button 
              onClick={handleShowOnStartupToggle}
              disabled={isSaving}
              className={`w-12 h-6 rounded-full transition-all duration-200 relative ${
                showOnStartup 
                  ? `${theme.glass.secondary} border border-white/20` 
                  : `${theme.glass.secondary} border border-white/10`
              } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                showOnStartup ? 'translate-x-6' : 'translate-x-0.5'
              } ${theme.shadow.lg}`} />
            </button>
          </div>
        </div>
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
                <label key={preset.key} className={`flex items-center space-x-3 p-3 ${theme.radius.xl} ${theme.glass.secondary} transition-all duration-200 cursor-pointer border ${
                  hotkey === preset.key 
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
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                      hotkey === preset.key 
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
                  // Revert to original hotkey if cancelled
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
