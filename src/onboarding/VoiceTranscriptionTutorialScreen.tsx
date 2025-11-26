import React, { useState, useEffect } from 'react';
import { theme } from '../styles/theme';

interface VoiceTranscriptionTutorialScreenProps {
  onNext: () => void;
}

const VoiceTranscriptionTutorialScreen: React.FC<VoiceTranscriptionTutorialScreenProps> = ({ onNext }) => {
  const [fnKeyPressed, setFnKeyPressed] = useState(false);
  const [hasSpoken, setHasSpoken] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // Demo text to show during transcription
  const demoText = "Hello, this is a demo of Jarvis voice transcription. It works amazingly well!";

  // Enable voice tutorial mode and start full audio monitoring when component mounts
  useEffect(() => {
    const enableVoiceTutorialMode = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI) {
          // Enable voice tutorial mode for real transcription
          if (electronAPI.setVoiceTutorialMode) {
            electronAPI.setVoiceTutorialMode(true);
            console.log('✅ [Voice Tutorial] Voice tutorial mode enabled - real transcription active');
          }
          
          // Start the full hotkey monitoring system for audio recording
          if (electronAPI.startHotkeyMonitoring) {
            console.log('🎯 [Voice Tutorial] Starting full hotkey monitoring for audio recording...');
            await electronAPI.startHotkeyMonitoring();
            console.log('✅ [Voice Tutorial] Full hotkey monitoring started');
          } else {
            console.warn('⚠️ [Voice Tutorial] startHotkeyMonitoring not available');
          }
        }
      } catch (error) {
        console.error('❌ [Voice Tutorial] Error enabling voice tutorial mode:', error);
      }
    };

    enableVoiceTutorialMode();

    // Cleanup when component unmounts
    return () => {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.setVoiceTutorialMode) {
        electronAPI.setVoiceTutorialMode(false);
        console.log('🔄 [Voice Tutorial] Voice tutorial mode disabled on unmount');
      }
    };
  }, []);

  useEffect(() => {
    const handleFnKeyPress = (event: any, isPressed: boolean) => {
      setFnKeyPressed(isPressed);
      
      if (isPressed && !hasSpoken) {
        // Start recording - clear any existing text
        setTranscriptText('');
        setShowSuccess(false);
        setIsTyping(false);
      } else if (!isPressed && !hasSpoken) {
        // End recording and show demo transcript with typing effect
        setIsTyping(true);
        
        // Simulate typing effect
        let currentText = '';
        let charIndex = 0;
        const typingInterval = setInterval(() => {
          if (charIndex < demoText.length) {
            currentText += demoText[charIndex];
            setTranscriptText(currentText);
            charIndex++;
          } else {
            clearInterval(typingInterval);
            setIsTyping(false);
            setHasSpoken(true);
            setTimeout(() => setShowSuccess(true), 500);
          }
        }, 50); // 50ms per character for realistic typing
      }
    };

    // Register IPC listener for Fn key events from the full audio system
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && electronAPI.onFnKeyStateChange) {
      electronAPI.onFnKeyStateChange(handleFnKeyPress);
    }

    // Keyboard event listener as fallback
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Fn' || e.code === 'Fn') {
        handleFnKeyPress(null, true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Fn' || e.code === 'Fn') {
        handleFnKeyPress(null, false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [hasSpoken, demoText]);

  const handleTryAgain = () => {
    setHasSpoken(false);
    setShowSuccess(false);
    setTranscriptText('');
    setFnKeyPressed(false);
    setIsTyping(false);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-8">
      {/* Header */}
      <div className="text-center mb-10">
        <div className={`w-20 h-20 ${theme.glass.primary} ${theme.radius.lg} flex items-center justify-center mx-auto mb-6 ${theme.shadow}`}>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="32" 
            height="32" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={`transition-colors duration-300 ${fnKeyPressed ? 'text-white' : 'text-white/70'}`}
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <h1 className="text-3xl font-medium text-white mb-3 tracking-tight">
          Try dictating this message
        </h1>
        <p className="text-white/70 text-lg font-light max-w-xl mx-auto">
          Press and hold (Fn) to start dictating. Release when done speaking.
        </p>
        <div className="mt-3 px-3 py-1 bg-white/10 border border-white/20 rounded-lg text-white/80 text-xs font-medium inline-block backdrop-blur-sm">
          ✨ Demo Mode - Shows how transcription works
        </div>
      </div>

      {/* Interactive Demo Area */}
      <div className={`${theme.glass.primary} ${theme.radius.lg} p-6 ${theme.shadow} transition-all duration-300 mb-8 ${
        fnKeyPressed ? 'border border-white/30 bg-white/5' : 'border border-white/10'
      }`}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium text-base">Voice Message</h3>
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all duration-300 ${
              fnKeyPressed ? 'bg-white/10 border border-white/30' : 'bg-white/5 border border-white/10'
            }`}>
              <div className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                fnKeyPressed ? 'bg-white animate-pulse' : 'bg-white/30'
              }`}></div>
              <span className={`text-xs font-medium transition-colors duration-300 ${
                fnKeyPressed ? 'text-white' : 'text-white/60'
              }`}>
                {fnKeyPressed ? 'Listening...' : 'Hold Fn to record'}
              </span>
            </div>
          </div>

          {/* Text Display Area */}
          <div className={`min-h-[120px] ${theme.glass.secondary} ${theme.radius.md} p-4 transition-all duration-300 border ${
            fnKeyPressed ? 'border-white/30 bg-white/5' : 'border-white/10'
          }`}>
            {transcriptText ? (
              <div className="space-y-3">
                <p className="text-white text-base leading-relaxed">
                  {transcriptText}
                  {isTyping && <span className="animate-pulse">|</span>}
                </p>
                {showSuccess && (
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <div className="flex items-center space-x-2 text-emerald-400">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                      <span className="text-sm font-medium">Demo complete!</span>
                    </div>
                    <button 
                      onClick={handleTryAgain}
                      className="text-white hover:text-white/80 text-sm font-medium transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  {fnKeyPressed ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center space-x-1">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className="w-1 bg-white rounded-full animate-pulse"
                            style={{
                              height: `${Math.random() * 20 + 8}px`,
                              animationDelay: `${i * 0.1}s`,
                              animationDuration: '0.8s'
                            }}
                          />
                        ))}
                      </div>
                      <p className="text-white text-sm font-medium">Listening for your voice...</p>
                      <p className="text-white/50 text-xs">Try saying: "Hello, this is a test"</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-10 h-10 mx-auto opacity-30">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-white/50">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                          <line x1="12" y1="19" x2="12" y2="23"/>
                          <line x1="8" y1="23" x2="16" y2="23"/>
                        </svg>
                      </div>
                      <p className="text-white/40 text-sm">Your transcription will appear here</p>
                      <p className="text-white/30 text-xs">Hold Fn key and speak to start</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className={`
          text-center p-6 ${theme.glass.primary} ${theme.radius.lg} ${theme.shadow}
          transform transition-all duration-500 ease-out
          border border-emerald-400/30 bg-emerald-500/10 mb-6
        `}>
          <div className="flex items-center justify-center space-x-3 text-emerald-400 mb-2">
            <div className={`w-8 h-8 ${theme.glass.secondary} ${theme.radius.sm} flex items-center justify-center`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <span className="font-medium text-lg">Excellent!</span>
          </div>
          <p className="text-white/70 text-sm font-light">
            You've seen how voice transcription works. After signing in, you'll have access to this feature everywhere.
          </p>
        </div>
      )}

      {/* Instructions */}
      {!showSuccess && (
        <div className="text-center">
          <p className="text-white/50 text-sm font-light italic">
            This demo shows how transcription will work after you sign in
          </p>
        </div>
      )}
    </div>
  );
};

export default VoiceTranscriptionTutorialScreen;
