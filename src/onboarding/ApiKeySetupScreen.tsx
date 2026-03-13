import React, { useState, useEffect } from 'react';
import { theme } from '../styles/theme';

interface ApiKeySetupScreenProps {
  onNext: () => void;
  onApiKeysChange?: (hasKeys: boolean) => void;
}

// Local Whisper model options
const WHISPER_MODELS = [
  { id: 'tiny.en', name: 'Tiny (English)', size: '75 MB', speed: 'Fastest' },
  { id: 'tiny', name: 'Tiny (Multi)', size: '75 MB', speed: 'Fastest' },
  { id: 'base.en', name: 'Base (English)', size: '142 MB', speed: 'Fast' },
  { id: 'base', name: 'Base (Multi)', size: '142 MB', speed: 'Fast' },
  { id: 'small.en', name: 'Small (English)', size: '466 MB', speed: 'Medium' },
  { id: 'small', name: 'Small (Multi)', size: '466 MB', speed: 'Medium' },
];

const ApiKeySetupScreen: React.FC<ApiKeySetupScreenProps> = ({ onNext, onApiKeysChange }) => {
  const [deepgramKey, setDeepgramKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showDeepgramKey, setShowDeepgramKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasExistingKeys, setHasExistingKeys] = useState(false);
  const [useLocalWhisper, setUseLocalWhisper] = useState(false);

  // Ollama state
  const [useOllama, setUseOllama] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<'connected' | 'error' | 'checking' | 'idle'>('idle');

  // Whisper Model state
  const [localWhisperModel, setLocalWhisperModel] = useState('tiny.en');
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);

  // Load existing keys and settings on mount
  useEffect(() => {
    const loadKeysAndSettings = async () => {
      try {
        const electronAPI = (window as any).electronAPI;

        // Load API keys
        if (electronAPI?.getApiKeys) {
          const keys = await electronAPI.getApiKeys();
          if (keys) {
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

        if (electronAPI?.appGetSettings) {
          const settings = await electronAPI.appGetSettings();
          if (settings) {
            if (settings.useLocalWhisper) setUseLocalWhisper(true);
            if (settings.localWhisperModel) setLocalWhisperModel(settings.localWhisperModel);
            if (settings.useOllama) setUseOllama(true);
            if (settings.ollamaUrl) setOllamaUrl(settings.ollamaUrl);
            if (settings.ollamaModel) setOllamaModel(settings.ollamaModel);

            // If enabled, fetch models immediately
            if (settings.useOllama || useOllama) {
              fetchOllamaModels(settings.ollamaUrl || ollamaUrl);
            }
          }
        }

        // Load downloaded whisper models
        if (electronAPI?.whisperGetDownloadedModels) {
          const models = await electronAPI.whisperGetDownloadedModels();
          setDownloadedModels(models || []);
        }
      } catch (error) {
        console.error('Failed to load API keys:', error);
      }
    };
    loadKeysAndSettings();
  }, []);

  // Notify parent when ready to continue
  useEffect(() => {
    // Always allow continuing, keys are optional now
    onApiKeysChange?.(true);
  }, [geminiKey, useLocalWhisper, useOllama, onApiKeysChange]);

  const fetchOllamaModels = async (url: string) => {
    if (!url) return;

    setOllamaStatus('checking');
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.ollamaGetModels) {
        const result = await electronAPI.ollamaGetModels(url);
        if (result.success && result.models) {
          setAvailableOllamaModels(result.models);
          setOllamaStatus('connected');

          // Auto-select first model if none selected or current one invalid
          if (result.models.length > 0 && (!ollamaModel || !result.models.includes(ollamaModel))) {
            // Prefer llama3 or llama2 or mistral if available
            const preferred = result.models.find((m: string) => m.includes('llama3')) ||
              result.models.find((m: string) => m.includes('mistral')) ||
              result.models.find((m: string) => m.includes('llama2')) ||
              result.models[0];
            setOllamaModel(preferred);
          }
        } else {
          setOllamaStatus('error');
          setAvailableOllamaModels([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error);
      setOllamaStatus('error');
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
      // setSaving(true); // Don't block whole UI, just update locally + background save
      if (electronAPI?.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ localWhisperModel: modelId });
        setLocalWhisperModel(modelId);
      }
    } catch (error) {
      console.error('Failed to change whisper model:', error);
      setDownloadingModel(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.saveApiKeys) {
        await electronAPI.saveApiKeys({
          deepgramApiKey: deepgramKey.trim(),
          geminiApiKey: geminiKey.trim(),
        });
      }
      if (electronAPI?.appUpdateSettings) {
        await electronAPI.appUpdateSettings({
          useLocalWhisper,
          localWhisperModel,
          useOllama,
          ollamaUrl,
          ollamaModel
        });
      }
      setSaved(true);
      setHasExistingKeys(true);
      setTimeout(() => setSaved(false), 2000);
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

  const toggleLocalWhisper = async () => {
    const newValue = !useLocalWhisper;
    setUseLocalWhisper(newValue);
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.appUpdateSettings) {
        await electronAPI.appUpdateSettings({ useLocalWhisper: newValue });
      }
    } catch (error) {
      console.error('Failed to toggle local whisper:', error);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className={`w-14 h-14 ${theme.glass.primary} ${theme.radius.xl} flex items-center justify-center mx-auto mb-6 ${theme.shadow}`}>
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h1 className={`text-2xl font-semibold ${theme.text.primary} mb-3`}>Quick Setup</h1>
        <p className={`text-sm ${theme.text.secondary} max-w-md mx-auto font-normal leading-relaxed`}>
          Get started in 30 seconds with free API keys
        </p>
      </div>

      {/* Recommended Setup Box */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-5 ${theme.shadow} mb-4 border border-green-500/20 bg-gradient-to-r from-green-500/5 to-emerald-500/5`}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className={`text-sm font-semibold ${theme.text.primary} mb-1`}>Recommended: Free Forever Setup</h3>
            <p className={`text-xs ${theme.text.tertiary} leading-relaxed`}>
              Local Whisper (free transcription) + Gemini API (1M free tokens/day) = completely free!
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Transcription Choice */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-5 ${theme.shadow} mb-4`}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-xs font-bold text-white">1</div>
          <h3 className={`text-sm font-semibold ${theme.text.primary}`}>Choose Transcription Method</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Local Whisper Option */}
          <button
            onClick={toggleLocalWhisper}
            className={`p-4 rounded-xl text-left transition-all ${useLocalWhisper
              ? 'bg-green-500/10 border-2 border-green-500/40'
              : 'bg-white/5 border-2 border-white/10 hover:border-white/20'
              }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-green-400">FREE</span>
              {useLocalWhisper && (
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <h4 className={`text-sm font-medium ${theme.text.primary} mb-1`}>Local Whisper</h4>
            <p className={`text-xs ${theme.text.tertiary}`}>Runs on your device, 100% offline</p>
          </button>

          {/* Deepgram Option */}
          <button
            onClick={() => setUseLocalWhisper(false)}
            className={`p-4 rounded-xl text-left transition-all ${!useLocalWhisper
              ? 'bg-blue-500/10 border-2 border-blue-500/40'
              : 'bg-white/5 border-2 border-white/10 hover:border-white/20'
              }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-blue-400">$200 FREE</span>
              {!useLocalWhisper && (
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <h4 className={`text-sm font-medium ${theme.text.primary} mb-1`}>Deepgram Cloud</h4>
            <p className={`text-xs ${theme.text.tertiary}`}>Fastest, real-time streaming</p>
          </button>
        </div>



        {/* Local Whisper Model Selector (only show if local selected) */}
        {useLocalWhisper && (
          <div className="mt-4">
            <label className={`text-xs font-medium ${theme.text.secondary} mb-2 block`}>
              Select Whisper Model {downloadingModel && <span className="text-emerald-400 ml-2">Downloading... {Math.round(downloadProgress)}%</span>}
            </label>
            <div className="relative">
              <select
                value={localWhisperModel}
                onChange={(e) => handleLocalWhisperModelChange(e.target.value)}
                disabled={!!downloadingModel}
                className={`w-full bg-black/40 rounded-xl px-4 py-2.5 text-white border border-white/20 focus:border-white/40 focus:outline-none transition-colors text-xs appearance-none ${downloadingModel ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {WHISPER_MODELS.map((model) => {
                  const isDownloaded = downloadedModels.includes(model.id);
                  return (
                    <option key={model.id} value={model.id} className="bg-gray-900 text-white py-2">
                      {model.name} - {model.size} {isDownloaded ? '✓' : '↓'}
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
            <p className={`text-[10px] ${theme.text.tertiary} mt-2`}>
              Smaller models are faster. 'Tiny' is usually sufficient for dictation.
            </p>
          </div>
        )}

        {/* Deepgram Key Input (only show if cloud selected) */}
        {!useLocalWhisper && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className={`text-xs font-medium ${theme.text.secondary}`}>Deepgram API Key</label>
              <button
                onClick={() => openExternalLink('https://console.deepgram.com/')}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Get free key ($200 credits) →
              </button>
            </div>
            <div className="relative">
              <input
                type={showDeepgramKey ? 'text' : 'password'}
                value={deepgramKey}
                onChange={(e) => setDeepgramKey(e.target.value)}
                placeholder="Enter your Deepgram API key"
                className="w-full bg-black/40 rounded-lg px-4 py-2.5 pr-16 text-white placeholder-white/40 border border-white/20 focus:border-blue-500/50 focus:outline-none transition-colors font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowDeepgramKey(!showDeepgramKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs"
              >
                {showDeepgramKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: AI Intelligence */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-5 ${theme.shadow} mb-4`}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-xs font-bold text-white">2</div>
          <h3 className={`text-sm font-semibold ${theme.text.primary}`}>Choose AI Intelligence</h3>
        </div>

        <div className="space-y-4">
          {/* Option A: Gemini */}
          <div className={`p-4 rounded-xl border transition-all ${!useOllama ? 'bg-amber-500/10 border-amber-500/40' : 'bg-white/5 border-white/10'}`}>
            <button className="w-full text-left flex items-center justify-between mb-2" onClick={() => setUseOllama(false)}>
              <div className="flex items-center gap-2">
                <h4 className={`text-sm font-medium ${theme.text.primary}`}>Option A: Cloud AI (Gemini)</h4>
                {!useOllama && <span className="text-xs text-amber-400 font-medium">Selected</span>}
              </div>
            </button>

            <div className={`transition-all duration-300 ${useOllama ? 'opacity-50' : 'opacity-100'}`}>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-xs font-medium ${theme.text.secondary}`}>Gemini API Key (Free)</label>
                <button
                  onClick={() => openExternalLink('https://aistudio.google.com/app/apikey')}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Get free key →
                </button>
              </div>
              <div className="relative">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    if (e.target.value) setUseOllama(false);
                  }}
                  placeholder="AIza..."
                  className={`w-full bg-black/40 rounded-lg px-4 py-2.5 pr-16 text-white placeholder-white/40 border ${geminiKey.trim() ? 'border-green-500/40' : 'border-white/20'
                    } focus:border-white/50 focus:outline-none transition-colors font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs"
                >
                  {showGeminiKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className={`text-xs ${theme.text.tertiary} mt-2`}>
                Highest accuracy. 1M free tokens/day.
              </p>
            </div>
          </div>

          {/* Option B: Ollama */}
          <div className={`p-4 rounded-xl border transition-all ${useOllama ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-white/5 border-white/10'}`}>
            <button className="w-full text-left flex items-center justify-between mb-2" onClick={() => setUseOllama(true)}>
              <div className="flex items-center gap-2">
                <h4 className={`text-sm font-medium ${theme.text.primary}`}>Option B: Local AI (Ollama)</h4>
                {useOllama && <span className="text-xs text-emerald-400 font-medium">Selected</span>}
              </div>
              {useOllama && (
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            {useOllama && (
              <div className="space-y-3 mt-3 animate-fadeIn">
                <div>
                  <label className={`block text-xs font-medium ${theme.text.secondary} mb-1 flex items-center justify-between`}>
                    <span>Ollama URL</span>
                    <span className={`text-[10px] ${ollamaStatus === 'connected' ? 'text-green-400' :
                      ollamaStatus === 'error' ? 'text-red-400' : 'text-gray-500'
                      }`}>
                      {ollamaStatus === 'connected' ? 'Connected' :
                        ollamaStatus === 'error' ? 'Connection Failed' :
                          ollamaStatus === 'checking' ? 'Checking...' : ''}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    onBlur={() => fetchOllamaModels(ollamaUrl)}
                    className={`w-full bg-black/40 rounded-lg px-3 py-2 text-white border focus:outline-none text-xs ${ollamaStatus === 'error' ? 'border-red-500/50' :
                      ollamaStatus === 'connected' ? 'border-green-500/50' : 'border-emerald-500/30'
                      }`}
                    placeholder="http://localhost:11434"
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium ${theme.text.secondary} mb-1`}>Model Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      list="ollama-models-list-onboarding"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      onFocus={() => {
                        if (availableOllamaModels.length === 0) fetchOllamaModels(ollamaUrl);
                      }}
                      className="w-full bg-black/40 rounded-lg px-3 py-2 text-white border border-emerald-500/30 focus:outline-none text-xs"
                      placeholder="Type or select model..."
                    />
                    <datalist id="ollama-models-list-onboarding">
                      {availableOllamaModels.map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                    {availableOllamaModels.length > 0 && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-3 h-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-emerald-400/80 mt-1">
                    {availableOllamaModels.length > 0
                      ? `${availableOllamaModels.length} models found.`
                      : `Must be pulled first: ollama pull ${ollamaModel || 'llama3'}`}
                  </p>
                </div>
              </div>
            )}
            {!useOllama && (
              <p className={`text-xs ${theme.text.tertiary}`}>
                Run entirely locally. Requires [Ollama](https://ollama.com) installed.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full ${theme.glass.secondary} ${theme.text.primary} px-6 py-3 ${theme.radius.lg} font-medium hover:bg-white/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 border border-white/20`}
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
            Saved!
          </>
        ) : (
          'Save Settings'
        )}
      </button>

      {/* Status summary */}
      <div className="mt-4 text-center">
        <p className={`text-xs ${theme.text.tertiary}`}>
          {useLocalWhisper ? '🖥️ Local Whisper' : '☁️ Deepgram Cloud'}
          {' + '}
          {useOllama ? `🦙 Local Ollama (${ollamaModel})` : (geminiKey.trim() ? '✅ Gemini AI' : '⚠️ No AI (Dictation Only)')}
        </p>
      </div>
    </div>
  );
};

export default ApiKeySetupScreen;
