import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { theme } from '../styles/theme';

interface VoiceTranscriptionScreenProps {
  onNext: () => void;
}

const VoiceTranscriptionScreen: React.FC<VoiceTranscriptionScreenProps> = ({ onNext }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState('');
  const [hasTranscribed, setHasTranscribed] = useState(false);
  const [currentHotkey, setCurrentHotkey] = useState('Control');
  
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const lastProcessedTranscriptionRef = useRef('');
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Synthesize the same buduppp/poop tones the waveform window plays —
  // but in THIS renderer's audio context, so it doesn't depend on the
  // hidden waveform window (which Chromium can audio-suspend).
  const ensureAudioCtx = useCallback((): AudioContext | null => {
    try {
      if (!audioCtxRef.current) {
        const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => { /* ignore */ });
      }
      return audioCtxRef.current;
    } catch { return null; }
  }, []);

  // The buduppp / poop tones below are a 1:1 port of the original
  // playStartSound / playStopSound in waveform.html. Don't tweak the
  // frequencies or gains here without updating waveform.html too —
  // they're the canonical Jarvis voice cue.

  const playStartCue = useCallback(() => {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;

    // Tone 1: "bu" — flat 350Hz, 0s → 0.08s
    const osc1 = ctx.createOscillator(); const g1 = ctx.createGain();
    osc1.connect(g1); g1.connect(ctx.destination);
    osc1.frequency.setValueAtTime(350, t0);
    g1.gain.setValueAtTime(0.01, t0);
    g1.gain.exponentialRampToValueAtTime(0.005, t0 + 0.08);
    osc1.start(t0); osc1.stop(t0 + 0.08);

    // Tone 2: "du" — flat 500Hz, 0.05s → 0.13s
    const osc2 = ctx.createOscillator(); const g2 = ctx.createGain();
    osc2.connect(g2); g2.connect(ctx.destination);
    osc2.frequency.setValueAtTime(500, t0 + 0.05);
    g2.gain.setValueAtTime(0.008, t0 + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.005, t0 + 0.13);
    osc2.start(t0 + 0.05); osc2.stop(t0 + 0.13);

    // Tone 3: "ppp" — flat 750Hz, 0.10s → 0.20s
    const osc3 = ctx.createOscillator(); const g3 = ctx.createGain();
    osc3.connect(g3); g3.connect(ctx.destination);
    osc3.frequency.setValueAtTime(750, t0 + 0.10);
    g3.gain.setValueAtTime(0.006, t0 + 0.10);
    g3.gain.exponentialRampToValueAtTime(0.005, t0 + 0.20);
    osc3.start(t0 + 0.10); osc3.stop(t0 + 0.20);
  }, [ensureAudioCtx]);

  const playStopCue = useCallback(() => {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;

    // Tone 1: "po" — ramp 600Hz → 400Hz, 0s → 0.15s
    const osc1 = ctx.createOscillator(); const g1 = ctx.createGain();
    osc1.connect(g1); g1.connect(ctx.destination);
    osc1.frequency.setValueAtTime(600, t0);
    osc1.frequency.exponentialRampToValueAtTime(400, t0 + 0.1);
    g1.gain.setValueAtTime(0.008, t0);
    g1.gain.exponentialRampToValueAtTime(0.005, t0 + 0.15);
    osc1.start(t0); osc1.stop(t0 + 0.15);

    // Tone 2: "op" — ramp 350Hz → 250Hz, 0.08s → 0.25s
    const osc2 = ctx.createOscillator(); const g2 = ctx.createGain();
    osc2.connect(g2); g2.connect(ctx.destination);
    osc2.frequency.setValueAtTime(350, t0 + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(250, t0 + 0.2);
    g2.gain.setValueAtTime(0.006, t0 + 0.08);
    g2.gain.exponentialRampToValueAtTime(0.005, t0 + 0.25);
    osc2.start(t0 + 0.08); osc2.stop(t0 + 0.25);
  }, [ensureAudioCtx]);

  // Placeholder stays static — the textarea is just the destination for
  // dictated text, exactly like Notes / Mail / Slack. Recording and
  // processing status live in the inline waveform overlay, not inside
  // the text field.
  const HINT_TEXT = 'Hey can you wait for me at the restaurant at 4pm?';
  const placeholderText = useMemo(() => HINT_TEXT, []);

  // Focus text area utility
  const focusTextArea = useCallback((text: string) => {
    setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
        textAreaRef.current.setSelectionRange(text.length, text.length);
      }
    }, 100);
  }, []);

  // Handle push-to-talk state changes
  const handlePushToTalkStateChange = useCallback((isActive: boolean) => {
    console.log('🎯 [VoiceTranscription] Push-to-talk state change:', isActive);
    setIsRecording(isActive);
    if (isActive) {
      playStartCue();
    } else {
      playStopCue();
      // When push-to-talk stops, we might be processing
      console.log('🎯 [VoiceTranscription] Setting processing to true');
      setIsProcessing(true);
    }
  }, [playStartCue, playStopCue]);

  // Handle transcription state changes
  const handleTranscriptionStateChange = useCallback((isTranscribing: boolean) => {
    console.log('🎯 [VoiceTranscription] Transcription state change:', isTranscribing);
    setIsProcessing(isTranscribing);
    if (!isTranscribing) {
      console.log('🎯 [VoiceTranscription] Setting recording to false');
      setIsRecording(false);
    }
  }, []);

  // Handle tutorial transcription results
  const handleTutorialTranscription = useCallback((event: any, transcriptText: string) => {
    console.log('🎯 [VoiceTranscription] Tutorial transcription received:', transcriptText);
    console.log('🎯 [VoiceTranscription] Event object:', event);
    console.log('🎯 [VoiceTranscription] Current transcription text:', transcriptionText);
    console.log('🎯 [VoiceTranscription] Last processed:', lastProcessedTranscriptionRef.current);

    // Anonymous: log success/failure of the first tutorial dictation so we
    // can tell "stuck because dictation broke" from "user just navigated away".
    const api = (window as any).electronAPI;
    const hasText = !!(transcriptText && transcriptText.trim());
    if (api?.posthogCapture) {
      api.posthogCapture('onboarding_tutorial_dictation', {
        step_id: 'voice-tutorial',
        success: hasText,
        word_count: hasText ? transcriptText.trim().split(/\s+/).length : 0
      });
    }

    if (transcriptText?.trim() && transcriptText !== lastProcessedTranscriptionRef.current) {
      // The backend already formats the text perfectly - just use it directly
      console.log('🎯 [VoiceTranscription] Setting backend-formatted text:', transcriptText);
      setTranscriptionText(transcriptText);
      lastProcessedTranscriptionRef.current = transcriptText;
      
      // CRITICAL: Force complete state reset with timeout to ensure UI updates
      setTimeout(() => {
        setIsProcessing(false);
        setIsRecording(false);
        setHasTranscribed(true);
        focusTextArea(transcriptText);
      }, 100);
    } else {
      console.log('🎯 [VoiceTranscription] Stopping processing - no new text');
      // CRITICAL: Force complete state reset even with no text
      setTimeout(() => {
        setIsProcessing(false);
        setIsRecording(false);
      }, 100);
    }
  }, [transcriptionText, focusTextArea]);

  // Prime the AudioContext on first user interaction with the document.
  // Chromium's autoplay policy keeps AudioContext suspended until a real
  // user gesture lands; without this, our oscillator-based cues are silent
  // on the very first Fn-press.
  useEffect(() => {
    const prime = () => {
      ensureAudioCtx();
      document.removeEventListener('click', prime);
      document.removeEventListener('keydown', prime);
      document.removeEventListener('mousemove', prime);
    };
    document.addEventListener('click', prime);
    document.addEventListener('keydown', prime);
    document.addEventListener('mousemove', prime, { once: true });
    return () => {
      document.removeEventListener('click', prime);
      document.removeEventListener('keydown', prime);
      document.removeEventListener('mousemove', prime);
    };
  }, [ensureAudioCtx]);

  // Initialize component once on mount
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;

    // Focus text area
    if (textAreaRef.current) {
      textAreaRef.current.focus();
    }
    
    // Enable voice tutorial mode AND start full audio monitoring system
    if (electronAPI?.setVoiceTutorialMode) {
      electronAPI.setVoiceTutorialMode(true);
      console.log('✅ [VoiceTranscription] Voice tutorial mode enabled - real transcription active');
      cleanupFunctionsRef.current.push(() => electronAPI.setVoiceTutorialMode(false));
    }

    // Show the waveform overlay so the user sees and hears the same cue
    // they'll get in normal post-onboarding use.
    if (electronAPI?.showWaveform) {
      electronAPI.showWaveform();
      cleanupFunctionsRef.current.push(() => electronAPI.hideWaveform?.());
    }
    
    // Start the full hotkey monitoring system for audio recording
    if (electronAPI?.startHotkeyMonitoring) {
      console.log('🎯 [VoiceTranscription] Starting full hotkey monitoring for audio recording...');
      electronAPI.startHotkeyMonitoring().then(() => {
        console.log('✅ [VoiceTranscription] Full hotkey monitoring started successfully');
      }).catch((error: any) => {
        console.error('❌ [VoiceTranscription] Failed to start hotkey monitoring:', error);
      });
    } else {
      console.warn('⚠️ [VoiceTranscription] startHotkeyMonitoring not available');
    }
    
    // Fetch hotkey setting
    const fetchHotkey = async () => {
      try {
        if (electronAPI?.appGetSettings) {
          const settings = await electronAPI.appGetSettings();
          if (settings?.hotkey) {
            const hotkeyMap: Record<string, string> = {
              'fn': 'Fn',
              'control': 'Control', 
              'option': 'Option'
            };
            setCurrentHotkey(hotkeyMap[settings.hotkey] || 'Control');
          }
        }
      } catch (error) {
        console.error('🎯 [VoiceTranscription] Failed to fetch hotkey:', error);
      }
    };
    
    fetchHotkey();
    
    // Register for push-to-talk, transcription, and tutorial-result events.
    // The preload exposes wrapper functions (not the raw ipcRenderer) — using
    // the wrappers is what actually subscribes us. The previous
    // electronAPI.ipcRenderer.on(...) calls were no-ops because ipcRenderer
    // isn't exposed by design, which left isRecording stuck on true forever.
    if (electronAPI?.onPushToTalkStateChange) {
      electronAPI.onPushToTalkStateChange(handlePushToTalkStateChange);
    }
    if (electronAPI?.onTranscriptionStateChange) {
      electronAPI.onTranscriptionStateChange(handleTranscriptionStateChange);
    }
    if (electronAPI?.onTutorialTranscription) {
      electronAPI.onTutorialTranscription((text: string) => handleTutorialTranscription(null, text));
    }
    
    return () => {
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];
    };
  }, [handlePushToTalkStateChange, handleTranscriptionStateChange, handleTutorialTranscription]);

  return (
    <div className="w-full max-w-2xl mx-auto px-6">
      {/* Header */}
      <div className="text-center mb-10">
        <div className={`w-14 h-14 ${theme.glass.primary} ${theme.radius.xl} flex items-center justify-center mx-auto mb-6 ${theme.shadow}`}>
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        <h1 className={`text-2xl font-semibold ${theme.text.primary} mb-3`}>
          Try dictating this message into Notes
        </h1>
        <p className={`text-sm ${theme.text.secondary} max-w-sm mx-auto font-normal leading-relaxed mb-2`}>
          Press and hold <span className={`${theme.text.primary} font-medium`}>({currentHotkey})</span> to start dictating. Release when done speaking.
        </p>
        <p className={`text-xs ${theme.text.tertiary} font-normal`}>
          Speak naturally — Jarvis transcribes locally and pastes at your cursor.
        </p>
      </div>

      {/* Voice Input Demo Area */}
      <div className="w-full">
        <div className={`
          ${theme.glass.primary} border ${theme.radius.lg} relative h-80
          transition-all duration-300 ${
            isRecording ? 'border-blue-400/60 bg-blue-500/8 shadow-lg shadow-blue-500/15' : 
            isProcessing ? 'border-blue-300/50 bg-blue-500/5 shadow-md shadow-blue-500/8' :
            hasTranscribed ? 'border-green-400/50 bg-green-500/5 shadow-md shadow-green-500/8' :
            'border-white/20 hover:border-white/30'
          }
        `}>
          
          {/* Inline waveform overlay — replaces the floating waveform
              window for the tutorial, so the user sees recording/processing
              feedback right where they're looking. Mirrors the real
              post-onboarding experience (visual cue on the waveform,
              text lands in the destination field). */}
          {(isRecording || isProcessing) && (
            <div className="absolute top-3 left-4 z-20 flex items-center gap-3 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
              {isRecording ? (
                <>
                  <div className="flex items-end gap-[3px] h-4">
                    {[0, 1, 2, 3, 4, 5, 6].map(i => (
                      <span
                        key={i}
                        className="inline-block w-[3px] rounded-sm bg-red-400"
                        style={{
                          height: '100%',
                          animation: `jarvisWave 0.9s ease-in-out ${i * 0.08}s infinite alternate`
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-red-300 text-xs font-medium">Listening…</span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-[3px]">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400"
                        style={{ animation: `jarvisDot 1s ease-in-out ${i * 0.15}s infinite` }}
                      />
                    ))}
                  </div>
                  <span className="text-blue-300 text-xs font-medium">Transcribing…</span>
                </>
              )}
            </div>
          )}
          <style>{`
            @keyframes jarvisWave {
              0% { transform: scaleY(0.25); }
              100% { transform: scaleY(1); }
            }
            @keyframes jarvisDot {
              0%, 100% { opacity: 0.3; transform: scale(0.8); }
              50% { opacity: 1; transform: scale(1.2); }
            }
          `}</style>
          
          {/* Microphone Icon */}
          <div className="absolute top-4 right-4 z-10">
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center
              transition-all duration-300 shadow-sm ${
                isRecording ? 'bg-blue-500/90 scale-105 shadow-blue-500/30' : 
                isProcessing ? 'bg-blue-400/80 animate-pulse' :
                'bg-white/20 hover:bg-white/30'
              }
            `}>
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                className={`text-white transition-transform duration-200 ${
                  isRecording ? 'scale-110' : ''
                }`}
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </div>
          </div>

          {/* Text Input Area */}
          <textarea
            ref={textAreaRef}
            value={transcriptionText}
            onChange={(e) => setTranscriptionText(e.target.value)}
            placeholder={placeholderText}
            className={`
              w-full h-full p-5 bg-transparent border-0 
              text-white placeholder-white/40 text-base leading-relaxed
              resize-none focus:outline-none font-normal tracking-normal
              font-inter antialiased
            `}
            style={{ 
              paddingRight: '60px', // Space for microphone
              paddingTop: isRecording || isProcessing ? '50px' : '24px',
              paddingLeft: '20px',
              paddingBottom: '60px' // Space for bottom toolbar
            }}
            disabled={isRecording || isProcessing}
          />

          {/* Bottom Toolbar */}
          <div className={`absolute bottom-0 left-0 right-0 flex items-center p-3 border-t border-white/8 bg-black/10 backdrop-blur-sm ${theme.radius.lg} rounded-t-none`}>
            <div className="flex items-center space-x-3 text-white/40">
              <button className="p-1.5 hover:bg-white/10 rounded-md transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                  <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                </svg>
              </button>
              <button className="p-1.5 hover:bg-white/10 rounded-md transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="19" y1="4" x2="10" y2="4"/>
                  <line x1="14" y1="20" x2="5" y2="20"/>
                  <line x1="15" y1="4" x2="9" y2="20"/>
                </svg>
              </button>
              <button className="p-1.5 hover:bg-white/10 rounded-md transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"/>
                  <line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/>
                  <line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </button>
              <button className="p-1.5 hover:bg-white/10 rounded-md transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4,7 10,11 4,15"/>
                  <line x1="12" y1="11" x2="20" y2="11"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceTranscriptionScreen;
