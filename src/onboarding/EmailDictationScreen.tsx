import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { theme } from '../styles/theme';

interface EmailDictationScreenProps {
  onNext: () => void;
}

const EmailDictationScreen: React.FC<EmailDictationScreenProps> = ({ onNext }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState('');
  const [hasTranscribed, setHasTranscribed] = useState(false);
  const [currentHotkey, setCurrentHotkey] = useState('Control');
  const [userName, setUserName] = useState('');
  
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const lastProcessedTranscriptionRef = useRef('');
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Placeholder stays static — the textarea is the destination only.
  // Recording/processing status lives in the inline waveform overlay
  // rendered alongside, matching the real post-onboarding experience.
  const EMAIL_HINT = "Hi John, I'm looking forward to working with you. Are you available to meet at 3 pm on Friday?";
  const placeholderText = useMemo(() => EMAIL_HINT, []);

  // Optimized focus utility with cleanup
  const focusTextArea = useCallback((text: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (textAreaRef.current) {
        textAreaRef.current.focus();
        textAreaRef.current.setSelectionRange(text.length, text.length);
      }
    }, 50); // Reduced timeout for snappier UX
  }, []);

  // Optimized state reset function
  const resetStates = useCallback((withTranscription = false) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsProcessing(false);
      setIsRecording(false);
      if (withTranscription) {
        setHasTranscribed(true);
      }
    }, 50); // Reduced timeout for snappier UX
  }, []);

  // Handle push-to-talk state changes - optimized with debug logging
  // Inline buduppp/poop cues — same shape as VoiceTranscriptionScreen.
  // Played from this renderer so they don't depend on the (often hidden)
  // waveform window's audio context.
  const audioCtxRef = useRef<AudioContext | null>(null);
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
  // 1:1 port of waveform.html's playStartSound / playStopSound. Don't
  // tweak frequencies or gains in isolation — they're the canonical
  // Jarvis voice cue and must match the floating-window synth.
  const playCue = useCallback((kind: 'start' | 'stop') => {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;

    if (kind === 'start') {
      // Tone 1: "bu" — 350Hz flat
      const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
      o1.connect(g1); g1.connect(ctx.destination);
      o1.frequency.setValueAtTime(350, t0);
      g1.gain.setValueAtTime(0.01, t0);
      g1.gain.exponentialRampToValueAtTime(0.005, t0 + 0.08);
      o1.start(t0); o1.stop(t0 + 0.08);
      // Tone 2: "du" — 500Hz flat
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination);
      o2.frequency.setValueAtTime(500, t0 + 0.05);
      g2.gain.setValueAtTime(0.008, t0 + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.005, t0 + 0.13);
      o2.start(t0 + 0.05); o2.stop(t0 + 0.13);
      // Tone 3: "ppp" — 750Hz flat
      const o3 = ctx.createOscillator(); const g3 = ctx.createGain();
      o3.connect(g3); g3.connect(ctx.destination);
      o3.frequency.setValueAtTime(750, t0 + 0.10);
      g3.gain.setValueAtTime(0.006, t0 + 0.10);
      g3.gain.exponentialRampToValueAtTime(0.005, t0 + 0.20);
      o3.start(t0 + 0.10); o3.stop(t0 + 0.20);
    } else {
      // Tone 1: "po" — 600 → 400 Hz ramp
      const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
      o1.connect(g1); g1.connect(ctx.destination);
      o1.frequency.setValueAtTime(600, t0);
      o1.frequency.exponentialRampToValueAtTime(400, t0 + 0.1);
      g1.gain.setValueAtTime(0.008, t0);
      g1.gain.exponentialRampToValueAtTime(0.005, t0 + 0.15);
      o1.start(t0); o1.stop(t0 + 0.15);
      // Tone 2: "op" — 350 → 250 Hz ramp
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination);
      o2.frequency.setValueAtTime(350, t0 + 0.08);
      o2.frequency.exponentialRampToValueAtTime(250, t0 + 0.2);
      g2.gain.setValueAtTime(0.006, t0 + 0.08);
      g2.gain.exponentialRampToValueAtTime(0.005, t0 + 0.25);
      o2.start(t0 + 0.08); o2.stop(t0 + 0.25);
    }
  }, [ensureAudioCtx]);

  // Prime AudioContext on first user gesture (Chromium autoplay policy).
  useEffect(() => {
    const prime = () => { ensureAudioCtx(); };
    document.addEventListener('click', prime, { once: true });
    document.addEventListener('keydown', prime, { once: true });
    document.addEventListener('mousemove', prime, { once: true });
    return () => {
      document.removeEventListener('click', prime);
      document.removeEventListener('keydown', prime);
      document.removeEventListener('mousemove', prime);
    };
  }, [ensureAudioCtx]);

  const handlePushToTalkStateChange = useCallback((isActive: boolean) => {
    console.log(`[EmailDictation] Push-to-talk state: ${isActive}`);
    setIsRecording(isActive);
    if (isActive) {
      playCue('start');
    } else {
      playCue('stop');
      setIsProcessing(true);
    }
  }, [playCue]);

  // Anonymous funnel: log success/failure of the email-tutorial dictation.
  const logEmailDictationResult = useCallback((text: string) => {
    const api = (window as any).electronAPI;
    if (!api?.posthogCapture) return;
    const hasText = !!(text && text.trim());
    api.posthogCapture('onboarding_tutorial_dictation', {
      step_id: 'email-tutorial',
      success: hasText,
      word_count: hasText ? text.trim().split(/\s+/).length : 0
    });
  }, []);

  // Handle transcription state changes - optimized with debug logging and immediate state reset
  const handleTranscriptionStateChange = useCallback((isTranscribing: boolean) => {
    console.log(`[EmailDictation] Transcription state: ${isTranscribing}`);
    setIsProcessing(isTranscribing);
    if (!isTranscribing) {
      // Immediately clear both recording and processing states when transcription ends
      setIsRecording(false);
      setIsProcessing(false);
    }
  }, []); // Removed dependencies to prevent unnecessary re-renders

  // Handle tutorial transcription results - optimized with proper state reset and debug logging
  const handleTutorialTranscription = useCallback((event: any, transcriptText: string) => {
    console.log(`[EmailDictation] Tutorial transcription received: "${transcriptText}"`);
    logEmailDictationResult(transcriptText);
    if (transcriptText?.trim() && transcriptText !== lastProcessedTranscriptionRef.current) {
      setTranscriptionText(transcriptText);
      lastProcessedTranscriptionRef.current = transcriptText;
      // Immediately stop recording and processing indicators
      console.log(`[EmailDictation] Setting states to false after transcription`);
      setIsRecording(false);
      setIsProcessing(false);
      setHasTranscribed(true);
      focusTextArea(transcriptText);
      
      // Force clear recording state with a timeout to ensure UI updates
      setTimeout(() => {
        setIsRecording(false);
        setIsProcessing(false);
      }, 100);
    } else {
      // Reset all states if no valid transcription
      console.log(`[EmailDictation] No valid transcription, resetting states`);
      setIsRecording(false);
      setIsProcessing(false);
    }
  }, [focusTextArea, logEmailDictationResult]);

  // Initialize component once on mount - optimized
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    
    // Focus text area
    if (textAreaRef.current) {
      textAreaRef.current.focus();
    }
    
    // Pre-warm the audio system to reduce first-time microphone delay
    const preWarmAudio = async () => {
      try {
        if (electronAPI?.requestMicrophonePermission) {
          await electronAPI.requestMicrophonePermission();
        }
      } catch (error) {
        // Silent fail - just for pre-warming
      }
    };
    
    preWarmAudio();
    
    // Enable tutorial mode - this connects to the push-to-talk service
    if (electronAPI?.setVoiceTutorialMode) {
      electronAPI.setVoiceTutorialMode(true);
      cleanupFunctionsRef.current.push(() => {
        electronAPI.setVoiceTutorialMode(false);
      });
    }
    
    // Enable email tutorial mode - this forces email context for formatting
    if (electronAPI?.setEmailTutorialMode) {
      electronAPI.setEmailTutorialMode(true);
      cleanupFunctionsRef.current.push(() => {
        electronAPI.setEmailTutorialMode(false);
      });
    }

    // Show the waveform overlay so the user gets the same visual + sound
    // they'll see in normal post-onboarding use.
    if (electronAPI?.showWaveform) {
      electronAPI.showWaveform();
      cleanupFunctionsRef.current.push(() => electronAPI.hideWaveform?.());
    }
    
    // Get user settings to display correct hotkey and user name
    if (electronAPI?.getUserSettings) {
      electronAPI.getUserSettings().then((settings: any) => {
        if (settings?.hotkey) {
          const hotkeyMap: Record<string, string> = {
            'fn': 'Fn',
            'ctrl': 'Control',
            'cmd': 'Command',
            'alt': 'Option',
            'shift': 'Shift'
          };
          
          if (hotkeyMap[settings.hotkey]) {
            setCurrentHotkey(hotkeyMap[settings.hotkey] || 'Control');
          }
        }
      }).catch(() => {
        // Silent fail for better performance
      });
    }
    
    // Get user name from app settings first (set during onboarding)
    if (electronAPI?.appGetSettings) {
      electronAPI.appGetSettings().then((settings: any) => {
        if (settings?.userName) {
          setUserName(settings.userName);
        }
      }).catch(() => {
        // Silent fail
      });
    }
    
    // Fallback: Get user auth state to display correct name
    if (electronAPI?.loadAuthState) {
      electronAPI.loadAuthState().then((authState: any) => {
        if (authState?.displayName) {
          // Extract first name from display name for personalization
          const firstName = authState.displayName.split(' ')[0];
          // Only set if not already set from app settings
          setUserName(prev => prev || firstName);
        }
      }).catch(() => {
        // Silent fail if no auth state
      });
    }

    // Register IPC handlers via the preload-exposed wrappers. The raw
    // electronAPI.ipcRenderer is deliberately not exposed, so the previous
    // ipcRenderer.on calls were no-ops — recording state never flipped back
    // to false and the screen got stuck on "Recording...".
    if (electronAPI?.onPushToTalkStateChange) {
      electronAPI.onPushToTalkStateChange(handlePushToTalkStateChange);
    }
    if (electronAPI?.onTranscriptionStateChange) {
      electronAPI.onTranscriptionStateChange(handleTranscriptionStateChange);
    }
    if (electronAPI?.onTutorialTranscription) {
      electronAPI.onTutorialTranscription((text: string) => handleTutorialTranscription(null, text));
    }

    // Cleanup function
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      cleanupFunctionsRef.current.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          // Silent fail for better performance
        }
      });
    };
  }, [handlePushToTalkStateChange, handleTranscriptionStateChange, handleTutorialTranscription]);

  return (
    <div className="w-full max-w-6xl mx-auto px-6 text-center">
      {/* Header - Enhanced Typography */}
      <div className="text-center mb-6">
        <h1 className={`${theme.text.primary} mb-3`}>
          Try dictating this message into Email
        </h1>
        <p className={`${theme.text.secondary} mb-2`}>
          Press and hold <span className={`${theme.text.primary} font-semibold`}>({currentHotkey})</span> to start dictating. Release when done speaking.
        </p>
        <p className={`${theme.text.tertiary}`}>
          Speak naturally — Jarvis transcribes locally and pastes at your cursor.
        </p>
      </div>

      {/* Ultra Wide and Tall Rectangular Text Box - Like Grocery List */}
      <div className="w-full">
        <div className={`
          ${theme.glass.primary} border-2 ${theme.radius.lg} relative h-[500px]
          transition-all duration-300 ${
            isRecording ? 'border-blue-400/80 bg-blue-500/12 shadow-lg shadow-blue-500/20' : 
            isProcessing ? 'border-blue-300/60 bg-blue-500/8 shadow-md shadow-blue-500/10' :
            hasTranscribed ? 'border-green-400/60 bg-green-500/8 shadow-md shadow-green-500/10' :
            'border-white/25 hover:border-white/35'
          }
        `}>
          
          {/* Enhanced Microphone Icon with Better Feedback */}
          <div className="absolute top-4 right-4 z-10">
            <div className={`
              w-12 h-12 rounded-full flex items-center justify-center
              transition-all duration-300 shadow-lg ${
                isRecording ? 'bg-blue-500 scale-110 shadow-blue-500/50' : 
                isProcessing ? 'bg-blue-400 animate-pulse' :
                'bg-white/30 hover:bg-white/40'
              }
            `}>
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
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

          {/* Email Header - Repositioned to avoid overlap */}
          <div className="absolute top-4 left-6 right-20 z-10">
            <div className="space-y-1">
              <div className={`${theme.text.tertiary} text-sm`}>To: John Liu</div>
              <div className={`${theme.text.tertiary} text-sm`}>Subject: My First Jarvis Message!</div>
            </div>
          </div>

          {/* Text Input - Enhanced Typography with Better Spacing */}
          <textarea
            ref={textAreaRef}
            value={transcriptionText}
            onChange={(e) => setTranscriptionText(e.target.value)}
            placeholder={placeholderText}
            className={`
              w-full h-full p-8 bg-transparent border-0 
              text-white placeholder-white/45 text-lg leading-relaxed
              resize-none focus:outline-none font-normal tracking-wide
              font-inter antialiased
            `}
            style={{ 
              paddingRight: '140px', // Increased space for microphone
              paddingTop: '108px', // Was bumped to 160 when an inline Listening pill lived here; pill removed, padding restored
              paddingLeft: '32px', // Increased left padding
              paddingBottom: '100px' // Increased space for bottom toolbar
            }}
            disabled={isRecording || isProcessing}
          />

          {/* Bottom Toolbar - Simplified Email Footer */}
          <div className={`absolute bottom-0 left-0 right-0 flex items-center p-4 border-t border-white/10 bg-black/20 backdrop-blur-sm ${theme.radius.lg} rounded-t-none`}>
            <div className="flex items-center space-x-4 text-white/50">
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                  <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                </svg>
              </button>
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="19" y1="4" x2="10" y2="4"/>
                  <line x1="14" y1="20" x2="5" y2="20"/>
                  <line x1="15" y1="4" x2="9" y2="20"/>
                </svg>
              </button>
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"/>
                  <line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/>
                  <line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailDictationScreen;
