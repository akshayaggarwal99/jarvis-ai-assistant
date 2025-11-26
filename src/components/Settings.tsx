import React, { useState, useEffect } from 'react';
import { theme, themeComponents } from '../styles/theme';

const Settings: React.FC = () => {
  // Settings state
  const [showNudges, setShowNudges] = useState(true);
  const [hotkey, setHotkey] = useState('fn');
  const [audioFeedback, setAudioFeedback] = useState(true);
  const [showOnStartup, setShowOnStartup] = useState(false);
  const [aiPostProcessing, setAiPostProcessing] = useState(true);
  
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

  // Pre-defined hotkey options (single keys for push-to-talk)
  const presetHotkeys = [
    { key: 'fn', label: 'Function (fn)', description: 'Push-to-talk - behavior varies by keyboard/settings' },
    { key: 'option', label: 'Option (⌥)', description: 'Push-to-talk - left or right side' },
    { key: 'control', label: 'Control (⌃)', description: 'Push-to-talk - bottom left corner' },
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
