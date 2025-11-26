import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import DemoVideoScreen from './DemoVideoScreen';
import FnKeyTutorialScreen from './FnKeyTutorialScreen';
import VoiceTranscriptionScreen from './VoiceTranscriptionScreen';
import EmailDictationScreen from './EmailDictationScreen';
import ApiKeySetupScreen from './ApiKeySetupScreen';
import { theme, themeComponents } from '../styles/theme';

interface OnboardingStep {
  id: string;
  component: React.ComponentType<{ 
    onNext: () => void; 
    onPermissionsChange?: (allGranted: boolean) => void;
    onCorePermissionsChange?: (coreGranted: boolean) => void;
    onApiKeysChange?: (hasKeys: boolean) => void;
  }>;
}

const WelcomeScreen: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const { user } = useAuth();
  const userName = user?.displayName?.split(' ')[0] || 'there';
  
  return (
    <div className="w-full max-w-2xl text-center mx-auto px-6">
      {/* Logo using unified theme */}
      <div className={`w-14 h-14 ${theme.glass.primary} ${theme.radius.xl} flex items-center justify-center mx-auto mb-6 ${theme.shadow}`}>
        <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 20 20" height="24px" viewBox="0 0 20 20" width="24px" fill="#ffffff">
          <rect fill="none" height="20" width="20" y="0"/>
          <path d="M15.98,5.82L10,2.5L4.02,5.82l3.8,2.11C8.37,7.36,9.14,7,10,7s1.63,0.36,2.17,0.93L15.98,5.82z M8.5,10 c0-0.83,0.67-1.5,1.5-1.5s1.5,0.67,1.5,1.5s-0.67,1.5-1.5,1.5S8.5,10.83,8.5,10z M9.25,17.08l-6-3.33V7.11L7.1,9.24 C7.03,9.49,7,9.74,7,10c0,1.4,0.96,2.57,2.25,2.91V17.08z M10.75,17.08v-4.18C12.04,12.57,13,11.4,13,10c0-0.26-0.03-0.51-0.1-0.76 l3.85-2.14l0,6.64L10.75,17.08z"/>
        </svg>
      </div>
      
      {/* Voice mode inspired welcome text */}
      <h1 className={`text-2xl font-semibold ${theme.text.primary} mb-3`}>
        Welcome to Jarvis, {userName}!
      </h1>
      <p className={`text-sm ${theme.text.secondary} max-w-sm mx-auto font-normal leading-relaxed`}>
        Voice control for your computer. Dictate 4x faster than typing—no training, no setup required.
      </p>
    </div>
  );
};

interface PermissionsScreenProps {
  onNext: () => void;
  onPermissionsChange?: (allGranted: boolean) => void;
  onCorePermissionsChange?: (coreGranted: boolean) => void;
}

const PermissionsScreen: React.FC<PermissionsScreenProps> = ({ onNext, onPermissionsChange, onCorePermissionsChange }) => {
  const [permissions, setPermissions] = useState({
    microphone: false,
    accessibility: false
  });

  // Check initial permission status on component mount
  useEffect(() => {
    const checkInitialPermissions = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
        if (!electronAPI) return;

        // Check microphone
        const micStatus = await electronAPI.checkPermissionStatus('microphone');
        const micGranted = micStatus.status === 'granted';

        // Check accessibility
        const accessibilityStatus = await electronAPI.checkPermissionStatus('accessibility');
        const accessibilityGranted = accessibilityStatus.status === 'granted' || accessibilityStatus.status === true;

        const initialPermissions = {
          microphone: micGranted,
          accessibility: accessibilityGranted
        };

        setPermissions(initialPermissions);
        const allGranted = Object.values(initialPermissions).every(Boolean);
        const coreGranted = initialPermissions.microphone && initialPermissions.accessibility;
        onPermissionsChange?.(allGranted);
        onCorePermissionsChange?.(coreGranted);
      } catch (error) {
        console.error('Failed to check initial permissions:', error);
      }
    };

    checkInitialPermissions();
    
    // Set up periodic permission checking to handle permission changes outside the app
    const intervalId = setInterval(checkInitialPermissions, 2000); // Check every 2 seconds
    
    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [onPermissionsChange, onCorePermissionsChange]);

  const requestPermission = async (type: keyof typeof permissions) => {
    try {
      let result;
      
      if (type === 'microphone') {
        result = await (window as any).electronAPI?.requestMicrophonePermission();
      } else if (type === 'accessibility') {
        result = await (window as any).electronAPI?.requestAccessibilityPermission();
      }
      
      if (result) {
        setPermissions(prev => {
          const newPermissions = { ...prev, [type]: result.granted };
          const allGranted = Object.values(newPermissions).every(Boolean);
          const coreGranted = newPermissions.microphone && newPermissions.accessibility;
          onPermissionsChange?.(allGranted);
          onCorePermissionsChange?.(coreGranted);
          return newPermissions;
        });
      }
    } catch (error) {
      console.error(`Failed to request ${String(type)} permission:`, error);
      setPermissions(prev => {
        const newPermissions = { ...prev, [type]: false };
        const allGranted = Object.values(newPermissions).every(Boolean);
        const coreGranted = newPermissions.microphone && newPermissions.accessibility;
        onPermissionsChange?.(allGranted);
        onCorePermissionsChange?.(coreGranted);
        return newPermissions;
      });
    }
  };

  const allPermissionsGranted = Object.values(permissions).every(Boolean);

  return (
    <div className="w-full max-w-2xl mx-auto px-6">
      {/* Header */}
      <div className="text-center mb-10">
        <div className={`w-14 h-14 ${theme.glass.primary} ${theme.radius.xl} flex items-center justify-center mx-auto mb-6 ${theme.shadow}`}>
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className={`text-2xl font-semibold ${theme.text.primary} mb-3`}>Grant Permissions</h1>
        <p className={`text-sm ${theme.text.secondary} max-w-sm mx-auto font-normal leading-relaxed`}>
          Jarvis needs these permissions to work seamlessly
        </p>
      </div>
        
      {/* Permissions list */}
      <div className="space-y-3 mb-8">
        <div className={`${theme.glass.primary} ${theme.radius.lg} p-5 ${theme.shadow} hover:${theme.glass.secondary} transition-all duration-300 border border-white/5`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-4 flex-1">
              <div className="w-9 h-9 bg-gradient-to-br from-green-500/15 to-emerald-600/15 backdrop-blur-xl border border-green-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`${theme.text.primary} text-sm font-medium`}>Microphone Access</h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-400 rounded-md border border-red-500/20">Required</span>
                </div>
                <p className={`${theme.text.tertiary} text-xs font-normal leading-relaxed`}>
                  Required for voice dictation and push-to-talk features
                </p>
              </div>
            </div>
            <button 
              onClick={() => requestPermission('microphone')}
              disabled={permissions.microphone}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 text-xs whitespace-nowrap ${
                permissions.microphone 
                  ? 'bg-green-500/20 border border-green-500/30 text-green-300 cursor-default' 
                  : 'bg-white text-gray-900 hover:bg-gray-50 transform hover:scale-105 active:scale-95 shadow-sm'
              }`}
            >
              {permissions.microphone ? (
                <div className="flex items-center gap-2">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Granted
                </div>
              ) : 'Grant Access'}
            </button>
          </div>
        </div>

        <div className={`${theme.glass.primary} ${theme.radius.lg} p-5 ${theme.shadow} hover:${theme.glass.secondary} transition-all duration-300 border border-white/5`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-4 flex-1">
              <div className="w-9 h-9 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`${theme.text.primary} text-sm font-medium`}>Accessibility</h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-400 rounded-md border border-red-500/20">Required</span>
                </div>
                <p className={`${theme.text.tertiary} text-xs font-normal leading-relaxed`}>
                  Allows Jarvis to type text and monitor Fn key (core feature)
                </p>
              </div>
            </div>
            <button 
              onClick={() => requestPermission('accessibility')}
              disabled={permissions.accessibility}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 text-xs whitespace-nowrap ${
                permissions.accessibility 
                  ? 'bg-green-500/20 border border-green-500/30 text-green-300 cursor-default' 
                  : 'bg-white text-gray-900 hover:bg-gray-50 transform hover:scale-105 active:scale-95 shadow-sm'
              }`}
            >
              {permissions.accessibility ? (
                <div className="flex items-center gap-2">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Granted
                </div>
              ) : 'Grant Access'}
            </button>
          </div>
        </div>
      </div>

      {allPermissionsGranted && (
        <div className="text-center p-4 bg-gradient-to-r from-green-500/5 to-emerald-600/5 backdrop-blur-xl border border-green-500/15 rounded-lg">
          <div className="flex items-center justify-center space-x-2 text-green-400">
            <div className="w-4 h-4 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center">
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className={`${theme.text.primary} text-sm font-medium`}>All permissions granted - you're ready to continue!</span>
          </div>
        </div>
      )}
    </div>
  );
};

const FeatureTourScreen: React.FC<{ onNext: () => void }> = ({ onNext }) => (
  <div className="w-full max-w-2xl mx-auto px-6">
    {/* Header */}
    <div className="text-center mb-10">
      <div className={`w-14 h-14 ${theme.glass.primary} ${theme.radius.xl} flex items-center justify-center mx-auto mb-6 ${theme.shadow}`}>
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      <h1 className={`text-2xl font-semibold ${theme.text.primary} mb-3`}>Quick Tutorial</h1>
      <p className={`text-sm ${theme.text.secondary} max-w-sm mx-auto font-normal leading-relaxed`}>
        Master these shortcuts to boost your productivity with Jarvis
      </p>
    </div>
    
    {/* Feature tour */}
    <div className="space-y-3 mb-8">
      <div className={`${theme.glass.primary} ${theme.radius.lg} p-5 ${theme.shadow} hover:${theme.glass.secondary} transition-all duration-300 border border-white/5`}>
        <div className="flex items-center space-x-4">
          <div className="flex items-center justify-center bg-white/8 px-4 py-2.5 rounded-lg backdrop-blur-xl border border-white/10">
            <kbd className="bg-white/15 border border-white/20 rounded-md px-2 py-1 text-xs font-mono text-white">fn</kbd>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-medium ${theme.text.primary} mb-1`}>Voice Dictation</h3>
            <p className={`${theme.text.tertiary} text-xs font-normal leading-relaxed`}>
              Hold Fn key and speak to convert your voice to text instantly
            </p>
          </div>
        </div>
      </div>

      <div className={`${theme.glass.primary} ${theme.radius.lg} p-5 ${theme.shadow} hover:${theme.glass.secondary} transition-all duration-300 border border-white/5`}>
        <div className="flex items-center space-x-4">
          <div className="flex items-center justify-center bg-white/8 px-4 py-2.5 rounded-lg backdrop-blur-xl border border-white/10">
            <span className={`${theme.text.secondary} font-medium text-xs`}>Double-tap</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-medium ${theme.text.primary} mb-1`}>Hands-free Mode</h3>
            <p className={`${theme.text.tertiary} text-xs font-normal leading-relaxed mb-1`}>
              Double-tap your hotkey quickly to activate continuous voice recognition
            </p>
            <p className={`${theme.text.quaternary} font-light text-xs`}>
              Configure your hotkey in Settings → Voice Dictation
            </p>
          </div>
        </div>
      </div>
    </div>

    {/* Success message */}
    <div className={`text-center p-4 ${theme.glass.primary} ${theme.radius.lg} ${theme.shadow} border border-white/5`}>
      <div className="flex items-center justify-center space-x-2 text-white mb-1">
        <div className={`w-4 h-4 ${theme.glass.secondary} ${theme.radius.sm} flex items-center justify-center border border-white/10`}>
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <span className={`${theme.text.primary} text-sm font-medium`}>You're all set!</span>
      </div>
      <p className={`${theme.text.tertiary} text-xs font-normal`}>
        Try holding the Fn key and speaking to see Jarvis in action
      </p>
    </div>
  </div>
);

const OnboardingFlow: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [allPermissionsGranted, setAllPermissionsGranted] = useState(false);
  const [corePermissionsGranted, setCorePermissionsGranted] = useState(false);
  const [hasApiKeys, setHasApiKeys] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { user, loading } = useAuth();

  const steps: OnboardingStep[] = [
    { id: 'welcome', component: WelcomeScreen },
    { id: 'api-keys', component: ApiKeySetupScreen },
    { id: 'demo', component: DemoVideoScreen },
    { id: 'permissions', component: PermissionsScreen },
    { id: 'fn-key-tutorial', component: FnKeyTutorialScreen },
    { id: 'voice-tutorial', component: VoiceTranscriptionScreen },
    { id: 'email-tutorial', component: EmailDictationScreen },
    { id: 'tour', component: FeatureTourScreen },
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        setIsTransitioning(false);
      }, 150);
    } else {
      onComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep(currentStep - 1);
        setIsTransitioning(false);
      }, 150);
    }
  };

  const canContinue = () => {
    if (currentStep === 1) { // API Keys step (index 1)
      return hasApiKeys;
    }
    if (currentStep === 3) { // Permissions step (index 3)
      // Only require microphone and accessibility - notifications are optional
      return corePermissionsGranted;
    }
    return true;
  };

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className={`min-h-screen ${themeComponents.container} font-['Inter',-apple-system,BlinkMacSystemFont,'SF_Pro_Display','SF_Pro_Text',system-ui,sans-serif] -webkit-font-smoothing-antialiased`}>
      {/* Progress bar header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-b border-white/10" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="px-8 py-4">
          <div className="flex items-center justify-center mb-3">
            <div className="text-white/80 text-sm font-medium">
              Step {currentStep + 1} of {steps.length}
            </div>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1">
            <div 
              className="bg-white h-1 rounded-full transition-all duration-500"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="h-screen pt-20 pb-24 overflow-y-auto">
        <div className={`min-h-full flex items-center justify-center py-4 transition-all duration-300 ${isTransitioning ? 'opacity-0 transform translate-x-4' : 'opacity-100 transform translate-x-0'}`}>
          <CurrentStepComponent 
            onNext={nextStep} 
            onPermissionsChange={setAllPermissionsGranted}
            onCorePermissionsChange={setCorePermissionsGranted}
            onApiKeysChange={setHasApiKeys}
          />
        </div>
      </div>

      {/* Footer navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-xl border-t border-white/10" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            {currentStep > 0 ? (
              <button 
                onClick={prevStep}
                className="text-white/70 hover:text-white transition-all duration-200 transform hover:scale-105 active:scale-95 flex items-center space-x-2 font-medium text-sm"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <span className="material-icons-outlined text-lg">arrow_back</span>
                <span>Back</span>
              </button>
            ) : (
              <div></div>
            )}
            
            <button 
              onClick={nextStep} 
              disabled={!canContinue() || loading}
              className="bg-white text-black px-6 py-2.5 rounded-lg font-medium hover:bg-white/90 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center space-x-2 shadow-lg text-sm"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <span>
                {loading ? 'Please sign in first...' : 
                 currentStep === steps.length - 1 ? 'Get Started' : 'Continue'}
              </span>
              {!loading && (
                <span className="material-icons-outlined text-base">arrow_forward</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingFlow;