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

  // Load existing keys on mount
  useEffect(() => {
    const loadKeys = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
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
      } catch (error) {
        console.error('Failed to load API keys:', error);
      }
    };
    loadKeys();
  }, []);

  // Notify parent when keys change
  useEffect(() => {
    const hasKeys = openaiKey.trim().length > 0 || deepgramKey.trim().length > 0 || geminiKey.trim().length > 0;
    onApiKeysChange?.(hasKeys);
  }, [openaiKey, deepgramKey, geminiKey, onApiKeysChange]);

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

  const hasAtLeastOneKey = openaiKey.trim().length > 0 || deepgramKey.trim().length > 0 || geminiKey.trim().length > 0;

  return (
    <div className="w-full max-w-2xl mx-auto px-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className={`w-14 h-14 ${theme.glass.primary} ${theme.radius.xl} flex items-center justify-center mx-auto mb-6 ${theme.shadow}`}>
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h1 className={`text-2xl font-semibold ${theme.text.primary} mb-3`}>Set Up API Keys</h1>
        <p className={`text-sm ${theme.text.secondary} max-w-md mx-auto font-normal leading-relaxed`}>
          Jarvis needs API keys to transcribe your voice. Your keys are stored locally and never leave your device.
        </p>
      </div>

      {/* API Key inputs */}
      <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 ${theme.shadow} mb-6`}>
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
              For AI features and Whisper transcription
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
              Faster real-time transcription with Deepgram Nova-3
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
              For Gemini 2.5 Flash AI features
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
      <div className={`${theme.glass.primary} ${theme.radius.lg} p-4 border border-white/10`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-blue-500/20">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className={`text-sm font-medium ${theme.text.primary} mb-1`}>Why do I need API keys?</h4>
            <p className={`text-xs ${theme.text.tertiary} leading-relaxed`}>
              Jarvis is fully open-source and runs locally on your Mac. API keys let you use your own accounts with OpenAI or Deepgram for voice transcription. We recommend Deepgram for the fastest experience.
            </p>
          </div>
        </div>
      </div>

      {/* Status */}
      {hasExistingKeys && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className={`text-sm ${theme.text.primary}`}>API keys configured</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiKeySetupScreen;
