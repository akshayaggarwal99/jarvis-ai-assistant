import React, { useState, useEffect } from 'react';
import { theme } from '../styles/theme';

interface ApiKeySetupScreenProps {
  onNext: () => void;
  onApiKeysChange?: (hasKeys: boolean) => void;
}

const ApiKeySetupScreen: React.FC<ApiKeySetupScreenProps> = ({ onNext, onApiKeysChange }) => {
  const [openaiKey, setOpenaiKey] = useState('');
  const [deepgramKey, setDeepgramKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showDeepgramKey, setShowDeepgramKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasExistingKeys, setHasExistingKeys] = useState(false);
  const [useLocalModel, setUseLocalModel] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [modelDownloaded, setModelDownloaded] = useState(false);

  // Load existing keys and settings on mount
  useEffect(() => {
    const loadKeysAndSettings = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
        
        // Load API keys
        if (electronAPI?.getApiKeys) {
          const keys = await electronAPI.getApiKeys();
          if (keys) {
            if (keys.openaiApiKey) {
              setOpenaiKey(keys.openaiApiKey);
              setHasExistingKeys(true);
            }
            if (keys.deepgramApiKey) {
              setDeepgramKey(keys.deepgramApiKey);
              setHasExistingKeys(true);
            }
            if (keys.geminiApiKey) {
              setGeminiKey(keys.geminiApiKey);
              setHasExistingKeys(true);
            }
          }
        }
        
        // Load app settings to check if local whisper is enabled
        if (electronAPI?.appGetSettings) {
          const settings = await electronAPI.appGetSettings();
          if (settings?.useLocalWhisper) {
            setUseLocalModel(true);
          }
        }
        
        // Check if default model is already downloaded
        if (electronAPI?.whisperIsModelDownloaded) {
          const isDownloaded = await electronAPI.whisperIsModelDownloaded('tiny.en');
          setModelDownloaded(isDownloaded);
        }
      } catch (error) {
        console.error('Failed to load API keys:', error);
      }
    };
    loadKeysAndSettings();
  }, []);

  // Notify parent when keys or local model changes
  useEffect(() => {
    const hasKeys = openaiKey.trim().length > 0 || deepgramKey.trim().length > 0 || geminiKey.trim().length > 0;
    // Allow continuing if either local model is enabled OR at least one API key is present
    onApiKeysChange?.(useLocalModel || hasKeys);
  }, [openaiKey, deepgramKey, geminiKey, useLocalModel, onApiKeysChange]);

  const handleSave = async () => {
    if (!openaiKey.trim() && !deepgramKey.trim() && !geminiKey.trim()) return;
    
    setSaving(true);
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.saveApiKeys) {
        await electronAPI.saveApiKeys({
          openaiApiKey: openaiKey.trim(),
          deepgramApiKey: deepgramKey.trim(),
          geminiApiKey: geminiKey.trim(),
        });
        setSaved(true);
        setHasExistingKeys(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error('Failed to save API keys:', error);
    } finally {
      setSaving(false);
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

  const getStatusMessage = (): string => {
    if (useLocalModel && hasExistingKeys) {
      return 'Local Whisper enabled + API keys configured';
    }
    if (useLocalModel) {
      return modelDownloaded 
        ? 'Ready! Local Whisper is set up' 
        : 'Local Whisper enabled - model will download on first use';
    }
    return 'API keys configured';
  };

  const hasAtLeastOneKey = openaiKey.trim().length > 0 || deepgramKey.trim().length > 0 || geminiKey.trim().length > 0;

  const handleToggleLocalModel = async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.appUpdateSettings) {
        const newValue = !useLocalModel;
        await electronAPI.appUpdateSettings({ useLocalWhisper: newValue });
        setUseLocalModel(newValue);
        
        // If enabling local model and model not downloaded, start download
        if (newValue && !modelDownloaded && !downloadingModel) {
          await handleDownloadModel();
        }
        
        // Allow continuing if either local model is enabled OR at least one API key is present
        onApiKeysChange?.(newValue || hasAtLeastOneKey);
      }
    } catch (error) {
      console.error('Failed to toggle local model:', error);
    }
  };

  const handleDownloadModel = async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.whisperDownloadModel) {
        console.error('whisperDownloadModel not available');
        return;
      }

      setDownloadingModel(true);
      setDownloadProgress(0);

      // Set up progress listener
      if (electronAPI?.onWhisperDownloadProgress) {
        electronAPI.onWhisperDownloadProgress((data: { modelId: string; percent: number; downloadedMB: number; totalMB: number }) => {
          setDownloadProgress(data.percent);
        });
      }

      // Download the model (tiny.en - fastest, English only)
      const result = await electronAPI.whisperDownloadModel('tiny.en');

      // Clean up listener
      if (electronAPI?.removeWhisperDownloadProgressListener) {
        electronAPI.removeWhisperDownloadProgressListener();
      }

      if (result?.success) {
        setModelDownloaded(true);
      } else {
        console.error('Model download failed');
      }
    } catch (error) {
      console.error('Failed to download model:', error);
    } finally {
      setDownloadingModel(false);
      setDownloadProgress(0);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className={`w-14 h-14 ${theme.glass.primary} ${theme.radius.xl} flex items-center justify-center mx-auto mb-6 ${theme.shadow}`}>
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h1 className={`text-2xl font-semibold ${theme.text.primary} mb-3`}>Set Up Transcription</h1>
        <p className={`text-sm ${theme.text.secondary} max-w-md mx-auto font-normal leading-relaxed`}>
          Choose how Jarvis transcribes your voice. <strong className={theme.text.primary}>We recommend starting with Local Whisper</strong> - it's 100% private, works offline, and requires no API keys.
        </p>
      </div>

      {/* Local Model Option - Recommended */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-5 ${theme.shadow} mb-4 border ${useLocalModel ? 'border-green-500/30 bg-green-500/5' : 'border-purple-500/30 bg-purple-500/5'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-xl flex items-center justify-center border border-purple-500/20 flex-shrink-0">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`text-sm font-semibold ${theme.text.primary}`}>Local Whisper Model</h3>
                <span className="px-2 py-0.5 text-xs font-medium bg-purple-500/15 text-purple-300 rounded-md border border-purple-500/25">
                  Recommended
                </span>
              </div>
              <p className={`text-xs ${theme.text.tertiary} mb-2 leading-relaxed`}>
                <strong className={theme.text.primary}>Perfect for getting started!</strong> Works 100% offline with no API keys required. Your voice never leaves your Mac. Download a small model (75MB) and you're ready to go.
              </p>
              <p className={`text-xs ${theme.text.quaternary} italic`}>
                You can always add cloud APIs later for faster transcription.
              </p>
              
              {/* Download progress */}
              {downloadingModel && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${theme.text.primary}`}>Downloading model...</span>
                    <span className={`text-xs ${theme.text.tertiary}`}>{downloadProgress}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div 
                      className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
              
              {/* Model status */}
              {useLocalModel && modelDownloaded && !downloadingModel && (
                <div className="mt-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className={`text-xs text-green-400`}>Model ready (Tiny English - 75MB)</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleToggleLocalModel}
            disabled={downloadingModel}
            className={`px-4 py-2 rounded-lg font-medium transition-all text-xs whitespace-nowrap flex-shrink-0 ${
              downloadingModel 
                ? 'bg-white/10 border border-white/20 text-white/50 cursor-wait'
                : useLocalModel
                ? 'bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/25'
                : 'bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25'
            }`}
          >
            {downloadingModel ? 'Downloading...' : useLocalModel ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Enabled
              </span>
            ) : 'Enable'}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 h-px bg-white/10"></div>
        <span className={`text-xs ${theme.text.tertiary}`}>or use cloud APIs (optional, for faster transcription)</span>
        <div className="flex-1 h-px bg-white/10"></div>
      </div>

      {/* API Key inputs */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow} mb-6 ${useLocalModel ? 'opacity-60' : ''}`}>
        {useLocalModel && (
          <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <p className={`text-xs ${theme.text.primary} text-center`}>
              <strong>Local Whisper is enabled</strong> - these API keys are optional. You can skip this section and continue.
            </p>
          </div>
        )}
        <div className="space-y-5">
          {/* OpenAI Key */}
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
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-black/40 rounded-xl px-4 py-3 pr-20 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-colors font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs transition-colors"
              >
                {showOpenaiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className={`text-xs ${theme.text.tertiary} mt-1.5`}>
              Optional - For OpenAI Whisper API or AI text processing features
            </p>
          </div>

          {/* Deepgram Key */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${theme.text.primary}`}>
                  Deepgram API Key
                </label>
                <span className="px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-400 rounded-md border border-green-500/20">
                  Recommended
                </span>
              </div>
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
                value={deepgramKey}
                onChange={(e) => setDeepgramKey(e.target.value)}
                placeholder="Enter your Deepgram API key"
                className="w-full bg-black/40 rounded-xl px-4 py-3 pr-20 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-colors font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowDeepgramKey(!showDeepgramKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs transition-colors"
              >
                {showDeepgramKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className={`text-xs ${theme.text.tertiary} mt-1.5`}>
              Optional - Fast real-time transcription ($200 free credits available)
            </p>
          </div>

          {/* Gemini Key */}
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
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="Enter your Gemini API key"
                className="w-full bg-black/40 rounded-xl px-4 py-3 pr-20 text-white placeholder-white/40 border border-white/20 focus:border-white/40 focus:outline-none transition-colors font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs transition-colors"
              >
                {showGeminiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className={`text-xs ${theme.text.tertiary} mt-1.5`}>
              Optional - For Gemini 2.5 Flash AI features (1M tokens/day free)
            </p>
          </div>

          {/* Save button */}
          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !hasAtLeastOneKey}
              className={`w-full ${theme.glass.secondary} ${theme.text.primary} px-6 py-3 ${theme.radius.lg} font-medium hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-white/20`}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : saved ? (
                <>
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Keys Saved!
                </>
              ) : (
                'Save API Keys'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className={`${theme.glass.primary} ${theme.radius.lg} p-4 border border-blue-500/20 bg-blue-500/5`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-blue-500/20">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className={`text-sm font-medium ${theme.text.primary} mb-1`}>Which option should I choose?</h4>
            <div className={`text-xs ${theme.text.tertiary} leading-relaxed space-y-1.5`}>
              <p>
                <strong className={theme.text.primary}>New users:</strong> Start with <strong>Local Whisper</strong>. It's completely free, private, and works great. You can always add cloud APIs later in Settings.
              </p>
              <p>
                <strong className={theme.text.primary}>Cloud APIs:</strong> Optional speed boost. <strong>Deepgram</strong> offers $200 free credits (recommended), or use <strong>OpenAI Whisper</strong>. Add <strong>Gemini</strong> for AI features (1M tokens/day free).
              </p>
              <p className="text-xs opacity-80">
                💡 All API keys are stored locally on your Mac and never shared.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Status */}
      {(hasExistingKeys || useLocalModel) && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className={`text-sm ${theme.text.primary}`}>
              {getStatusMessage()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiKeySetupScreen;
