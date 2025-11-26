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

  // Memoized placeholder text with email example - optimized with dynamic user name
  const placeholderText = useMemo(() => {
    const displayName = userName || 'User';
    if (isRecording) return `Hi John,\n\nI'm looking forward to working with you. Are you available to meet at 3 pm on Friday?\n\nRegards,\n${displayName}`;
    if (isProcessing) return "⚡ Processing...";
    if (hasTranscribed) return "Great! Try speaking again to add more content.";
    return `Hi John,\n\nI'm looking forward to working with you. Are you available to meet at 3 pm on Friday?\n\nRegards,\n${displayName}`;
  }, [isRecording, isProcessing, hasTranscribed, userName]);

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
  const handlePushToTalkStateChange = useCallback((isActive: boolean) => {
    console.log(`[EmailDictation] Push-to-talk state: ${isActive}`);
    setIsRecording(isActive);
    if (!isActive) {
      setIsProcessing(true);
    }
  }, []); // Removed dependencies to prevent unnecessary re-renders

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
  }, [focusTextArea]);

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
    
    // Get user auth state to display correct name
    if (electronAPI?.loadAuthState) {
      electronAPI.loadAuthState().then((authState: any) => {
        if (authState?.displayName) {
          // Extract first name from display name for personalization
          const firstName = authState.displayName.split(' ')[0];
          setUserName(firstName);
        }
      }).catch(() => {
        // Silent fail if no auth state
      });
    }

    // Register IPC handlers
    if (electronAPI?.ipcRenderer) {
      electronAPI.ipcRenderer.on('push-to-talk-state', handlePushToTalkStateChange);
      electronAPI.ipcRenderer.on('transcription-state', handleTranscriptionStateChange);
      electronAPI.ipcRenderer.on('tutorial-transcription', handleTutorialTranscription);
      
      cleanupFunctionsRef.current.push(() => {
        electronAPI.ipcRenderer.removeListener('push-to-talk-state', handlePushToTalkStateChange);
        electronAPI.ipcRenderer.removeListener('transcription-state', handleTranscriptionStateChange);
        electronAPI.ipcRenderer.removeListener('tutorial-transcription', handleTutorialTranscription);
      });
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
          Watch as Jarvis <span className="text-blue-400 italic">auto-formats emails for you.</span>
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
          
          {/* Live Recording Pulse Indicator - Repositioned to avoid overlap */}
          {isRecording && (
            <div className={`absolute inset-0 ${theme.radius.lg}`}>
              <div className={`absolute inset-0 bg-blue-400/15 ${theme.radius.lg} animate-pulse`}></div>
              <div className="absolute top-16 left-6 flex items-center space-x-3 z-20">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50"></div>
                <span className="text-red-400 font-medium animate-pulse text-sm">Recording...</span>
              </div>
            </div>
          )}
          
          {/* Processing Indicator - Repositioned to avoid overlap */}
          {isProcessing && !isRecording && (
            <div className={`absolute inset-0 ${theme.radius.lg}`}>
              <div className={`absolute inset-0 bg-blue-400/10 ${theme.radius.lg}`}></div>
              <div className="absolute top-16 left-6 flex items-center space-x-3 z-20">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
                <span className="text-blue-400 font-medium text-sm">Processing & Formatting...</span>
              </div>
            </div>
          )}

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
              paddingTop: isRecording || isProcessing ? '160px' : '108px', // Increased padding for recording state
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
