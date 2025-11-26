import React, { useState, useEffect } from 'react';
import { theme } from '../styles/theme';

interface FnKeyTutorialScreenProps {
  onNext: () => void;
}

const FnKeyTutorialScreen: React.FC<FnKeyTutorialScreenProps> = ({ onNext }) => {
  const [fnKeyPressed, setFnKeyPressed] = useState(false);
  const [hasPressed, setHasPressed] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showHotkeyOptions, setShowHotkeyOptions] = useState(false);
  const [selectedHotkey, setSelectedHotkey] = useState('fn');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const hotkeyOptions = [
    { label: 'Fn Key', value: 'fn', description: 'Default function key (recommended)' },
    { label: 'Ctrl Key', value: 'ctrl', description: 'Control key (alternative)' },
    { label: 'Option Key', value: 'option', description: 'Option key (alternative)' },
  ];

  // Load current hotkey setting on component mount
  useEffect(() => {
    const loadCurrentHotkey = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI && electronAPI.getCurrentSettings) {
          const settings = await electronAPI.getCurrentSettings();
          console.log('🔧 [Tutorial] Current settings:', settings);
          
          // Map backend values to frontend values
          const frontendHotkeyMap: { [key: string]: string } = {
            'fn': 'fn',
            'control': 'ctrl',  // Map control to ctrl for frontend
            'option': 'option'
          };
          
          const frontendHotkeyValue = frontendHotkeyMap[settings.hotkey] || 'fn';
          console.log(`🔧 [Tutorial] Mapped backend '${settings.hotkey}' to frontend '${frontendHotkeyValue}'`);
          
          setSelectedHotkey(frontendHotkeyValue);
        }
      } catch (error) {
        console.error('Failed to load current hotkey setting:', error);
        // Default to fn if loading fails
        setSelectedHotkey('fn');
      } finally {
        setIsLoadingSettings(false);
      }
    };

    loadCurrentHotkey();
  }, []);

  const handleHotkeyChange = async (hotkeyValue: string) => {
    try {
      // Update the selected hotkey in the UI first
      setSelectedHotkey(hotkeyValue);
      
      // Map frontend values to backend values
      const backendHotkeyMap: { [key: string]: string } = {
        'fn': 'fn',
        'ctrl': 'control',  // Map ctrl to control for backend
        'option': 'option'
      };
      
      const backendHotkeyValue = backendHotkeyMap[hotkeyValue] || hotkeyValue;
      
      // Save the hotkey preference
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.setHotkey) {
        await electronAPI.setHotkey(backendHotkeyValue);
        console.log(`🔧 [Hotkey] Mapped frontend '${hotkeyValue}' to backend '${backendHotkeyValue}'`);
      }
      
      // Restart Fn key monitoring with the new hotkey
      if (electronAPI && electronAPI.stopFnKeyMonitor && electronAPI.startFnKeyMonitor) {
        console.log(`🔧 [Hotkey] Restarting Fn key monitor for new hotkey: ${hotkeyValue}`);
        await electronAPI.stopFnKeyMonitor();
        // Small delay to ensure clean shutdown
        setTimeout(async () => {
          const started = await electronAPI.startFnKeyMonitor();
          if (started) {
            console.log(`✅ [Hotkey] Fn key monitor restarted successfully for ${hotkeyValue}`);
          } else {
            console.warn(`⚠️ [Hotkey] Failed to restart Fn key monitor for ${hotkeyValue}`);
          }
        }, 100);
      }
      
      setShowHotkeyOptions(false);
      
      // Reset the tutorial state so user needs to actually press the new key
      setHasPressed(false);
      setShowSuccess(false);
      setFnKeyPressed(false);
    } catch (error) {
      console.error('Failed to set hotkey:', error);
    }
  };

  const getCurrentHotkeyLabel = () => {
    const option = hotkeyOptions.find(opt => opt.value === selectedHotkey);
    return option ? option.label : 'Fn Key';
  };

  // Start Fn key monitoring when component mounts (KEY DETECTION ONLY - NO AUDIO)
  useEffect(() => {
    const startFnKeyMonitoring = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI && electronAPI.startFnKeyMonitor) {
          console.log('🎯 [Tutorial] Starting Fn key monitor for key detection only (no audio)...');
          const started = await electronAPI.startFnKeyMonitor();
          if (started) {
            console.log('✅ [Tutorial] Fn key monitor started successfully - key detection only');
          } else {
            console.warn('⚠️ [Tutorial] Failed to start Fn key monitor');
          }
        } else {
          console.warn('⚠️ [Tutorial] electronAPI.startFnKeyMonitor not available');
        }
      } catch (error) {
        console.error('❌ [Tutorial] Error starting Fn key monitor:', error);
      }
    };

    startFnKeyMonitoring();

    // Don't cleanup Fn key monitoring when component unmounts
    // Keep it running for the subsequent tutorial screens (Voice and Email tutorials)
    // The monitoring will be cleaned up when onboarding completes
    return () => {
      // Only cleanup IPC listeners, but keep Fn key monitoring active
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.ipcRenderer) {
        try {
          // Remove IPC listeners to prevent memory leaks
          electronAPI.ipcRenderer.removeAllListeners('fn-key-state-change');
        } catch (error) {
          console.error('❌ [Tutorial] Error cleaning up IPC listeners:', error);
        }
      }
    };
  }, []);

  useEffect(() => {
    // Listen for key events from the main process based on selected hotkey
    const handleKeyPress = (event: any, isPressed: boolean) => {
      console.log('🎯 [Tutorial] IPC Key event received:', { selectedHotkey, isPressed });
      
      // For tutorial purposes, respond to any key press (the main process sends events for the currently selected key)
      setFnKeyPressed(isPressed);
      if (isPressed && !hasPressed) {
        setHasPressed(true);
        setTimeout(() => setShowSuccess(true), 300);
      }
    };

    // Register IPC listener for the selected key events
    const electronAPI = (window as any).electronAPI;
    console.log('🎯 [Tutorial] Setting up IPC listener, electronAPI available:', !!electronAPI);
    console.log('🎯 [Tutorial] onFnKeyStateChange method available:', !!electronAPI?.onFnKeyStateChange);
    
    if (electronAPI && electronAPI.onFnKeyStateChange) {
      console.log('🎯 [Tutorial] Registering IPC listener for fn-key-state-change');
      electronAPI.onFnKeyStateChange(handleKeyPress);
    } else {
      console.warn('🎯 [Tutorial] electronAPI.onFnKeyStateChange not available!');
    }

    // Keyboard event listener as fallback for different keys
    const handleKeyDown = (e: KeyboardEvent) => {
      let keyMatches = false;
      
      if (selectedHotkey === 'fn' && (e.key === 'Fn' || e.code === 'Fn' || e.keyCode === 63236)) {
        keyMatches = true;
      } else if (selectedHotkey === 'ctrl' && (e.ctrlKey || e.key === 'Control')) {
        keyMatches = true;
      } else if (selectedHotkey === 'option' && (e.altKey || e.key === 'Alt')) {
        keyMatches = true;
      }
      
      if (keyMatches) {
        console.log('🎯 [Tutorial] Fallback key event:', { selectedHotkey, keyMatches });
        setFnKeyPressed(true);
        if (!hasPressed) {
          setHasPressed(true);
          setTimeout(() => setShowSuccess(true), 300);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      let keyMatches = false;
      
      if (selectedHotkey === 'fn' && (e.key === 'Fn' || e.code === 'Fn' || e.keyCode === 63236)) {
        keyMatches = true;
      } else if (selectedHotkey === 'ctrl' && (e.key === 'Control')) {
        keyMatches = true;
      } else if (selectedHotkey === 'option' && (e.key === 'Alt')) {
        keyMatches = true;
      }
      
      if (keyMatches) {
        console.log('🎯 [Tutorial] Fallback key up:', { selectedHotkey, keyMatches });
        setFnKeyPressed(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      // Also clean up IPC listener if possible
      if (electronAPI && electronAPI.ipcRenderer) {
        electronAPI.ipcRenderer.removeListener('fn-key-state-change', handleKeyPress);
      }
    };
  }, [hasPressed, selectedHotkey]);

  return (
    <div className="w-full max-w-2xl mx-auto px-6">
      {/* Header */}
      <div className="text-center mb-10">
        <div className={`w-14 h-14 ${theme.glass.primary} ${theme.radius.xl} flex items-center justify-center mx-auto mb-6 ${theme.shadow}`}>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={`transition-colors duration-300 ${fnKeyPressed ? 'text-blue-400' : 'text-white'}`}
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
            <path d="M6 7h12v6H6z"/>
          </svg>
        </div>
        <h1 className={`text-2xl font-semibold ${theme.text.primary} mb-3`}>
          Try pressing the {getCurrentHotkeyLabel()}
        </h1>
        <p className={`text-sm ${theme.text.secondary} max-w-sm mx-auto font-normal leading-relaxed`}>
          Press and hold to activate voice input
        </p>
      </div>

      {/* Interactive Key Demo */}
      <div className="text-center mb-8">
        <div className="inline-block">
          <div className={`
            relative inline-flex items-center justify-center w-20 h-20 rounded-xl font-mono text-lg font-medium
            transition-all duration-300 border border-white/20
            ${fnKeyPressed 
              ? 'bg-blue-500/90 border-blue-400/50 text-white shadow-lg shadow-blue-500/20 scale-105' 
              : 'bg-white/8 border-white/20 text-white/90 backdrop-blur-xl hover:bg-white/12'
            }
          `}>
            <span className="tracking-wide">{selectedHotkey === 'fn' ? 'Fn' : selectedHotkey === 'ctrl' ? 'Ctrl' : 'Option'}</span>
            {fnKeyPressed && (
              <div className="absolute inset-0 rounded-xl bg-blue-400/20 animate-pulse"></div>
            )}
          </div>
          <p className={`${theme.text.tertiary} text-xs mt-3 font-normal`}>
            {fnKeyPressed ? `${getCurrentHotkeyLabel()} Key` : `Hold ${getCurrentHotkeyLabel()} to start voice input`}
          </p>
        </div>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="text-center p-4 bg-gradient-to-r from-green-500/5 to-emerald-600/5 backdrop-blur-xl border border-green-500/15 rounded-lg mb-6">
          <div className="flex items-center justify-center space-x-2 text-green-400 mb-1">
            <div className="w-4 h-4 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className={`${theme.text.primary} text-sm font-medium`}>Perfect! Key detected successfully</span>
          </div>
          <p className={`${theme.text.tertiary} text-xs font-normal`}>
            Ready for voice transcription tutorial
          </p>
        </div>
      )}

      {/* Help Section */}
      {!showSuccess && !showHotkeyOptions && (
        <div className="text-center space-y-3">
          <p className={`${theme.text.quaternary} text-xs font-normal`}>
            Hold {getCurrentHotkeyLabel()} key to start voice input
          </p>
          <button
            onClick={() => setShowHotkeyOptions(true)}
            className="text-blue-400 hover:text-blue-300 underline transition-colors text-xs font-normal"
          >
            Not working? Try different key
          </button>
        </div>
      )}

      {/* Hotkey Options Modal */}
      {showHotkeyOptions && !showSuccess && (
        <div className={`${theme.glass.primary} ${theme.radius.lg} p-5 border border-white/10 max-w-sm mx-auto`}>
          <h3 className={`text-lg font-medium ${theme.text.primary} mb-4 text-center`}>Choose Hotkey</h3>
          <div className="space-y-2">
            {hotkeyOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleHotkeyChange(option.value)}
                className="w-full p-3 text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className={`text-sm font-medium ${theme.text.primary}`}>{option.label}</div>
                  <div className="text-blue-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
                <div className={`${theme.text.tertiary} text-xs font-normal mt-1`}>
                  {option.description}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowHotkeyOptions(false)}
              className={`${theme.text.tertiary} hover:${theme.text.secondary} transition-colors text-xs font-normal`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FnKeyTutorialScreen;
