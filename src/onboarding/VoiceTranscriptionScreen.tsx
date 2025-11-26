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

  // Memoized placeholder text with enhanced examples
  const placeholderText = useMemo(() => {
    if (isRecording) return "I want to grab 3 things at the grocery store\n1. Milk for the cake\n2. Eggs for breakfast\n3. White bread";
    if (isProcessing) return "⚡ Processing...";
    if (hasTranscribed) return "Great! Try speaking again to add more content.";
    return "I want to grab 3 things at the grocery store\n1. Milk for the cake\n2. Eggs for breakfast\n3. White bread";
  }, [isRecording, isProcessing, hasTranscribed, currentHotkey]);

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
    if (!isActive) {
      // When push-to-talk stops, we might be processing
      console.log('🎯 [VoiceTranscription] Setting processing to true');
      setIsProcessing(true);
    }
  }, []);

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
    
    // Register for push-to-talk state changes
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
          Watch as Jarvis <span className="text-blue-400 italic">auto-formats lists for you.</span>
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
          
          {/* Live Recording Indicator */}
          {isRecording && (
            <div className={`absolute inset-0 ${theme.radius.lg}`}>
              <div className={`absolute inset-0 bg-blue-400/8 ${theme.radius.lg} animate-pulse`}></div>
              <div className="absolute top-3 left-4 flex items-center space-x-2 z-20">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-sm shadow-red-500/50"></div>
                <span className="text-red-400 font-medium animate-pulse text-xs">Recording...</span>
              </div>
            </div>
          )}
          
          {/* Processing Indicator */}
          {isProcessing && !isRecording && (
            <div className={`absolute inset-0 ${theme.radius.lg}`}>
              <div className={`absolute inset-0 bg-blue-400/5 ${theme.radius.lg}`}></div>
              <div className="absolute top-3 left-4 flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                <span className="text-blue-400 font-medium text-xs">Processing & Formatting...</span>
              </div>
            </div>
          )}
          
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
