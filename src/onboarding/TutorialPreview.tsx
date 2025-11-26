import React, { useState } from 'react';
import FnKeyTutorialScreen from './FnKeyTutorialScreen';
import VoiceTranscriptionTutorialScreen from './VoiceTranscriptionTutorialScreen';
import EmailDictationScreen from './EmailDictationScreen';
import { theme, themeComponents } from '../styles/theme';

/**
 * Preview component for testing the new tutorial screens
 * To use: temporarily import and render this in App.tsx or Dashboard
 * 
 * Example usage in App.tsx:
 * import TutorialPreview from './onboarding/TutorialPreview';
 * // Then render <TutorialPreview /> instead of the normal content
 */

const TutorialPreview: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<'fn-key' | 'voice' | 'email'>('fn-key');

  return (
    <div className={`min-h-screen ${themeComponents.container} font-['Inter',-apple-system,BlinkMacSystemFont,'SF_Pro_Display','SF_Pro_Text',system-ui,sans-serif] -webkit-font-smoothing-antialiased overflow-hidden`}>
      {/* Header with screen switcher */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-b border-white/10">
        <div className="px-8 py-4">
          <div className="flex items-center justify-center space-x-4">
            <h1 className="text-white text-lg font-medium">Tutorial Screen Preview</h1>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentScreen('fn-key')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  currentScreen === 'fn-key'
                    ? 'bg-white text-black'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                Fn Key Tutorial
              </button>
              <button
                onClick={() => setCurrentScreen('voice')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  currentScreen === 'voice'
                    ? 'bg-white text-black'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                Voice Tutorial
              </button>
              <button
                onClick={() => setCurrentScreen('email')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  currentScreen === 'email'
                    ? 'bg-white text-black'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                Email Tutorial
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="h-screen pt-20 pb-24 flex items-center justify-center">
        {currentScreen === 'fn-key' ? (
          <FnKeyTutorialScreen onNext={() => setCurrentScreen('voice')} />
        ) : currentScreen === 'voice' ? (
          <VoiceTranscriptionTutorialScreen onNext={() => setCurrentScreen('email')} />
        ) : (
          <EmailDictationScreen onNext={() => console.log('Tutorial completed!')} />
        )}
      </div>

      {/* Footer with instructions */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-xl border-t border-white/10">
        <div className="px-8 py-4">
          <div className="text-center">
            <p className="text-white/60 text-sm">
              Preview mode: Test the new tutorial screens by pressing the Fn key
            </p>
            <p className="text-white/40 text-xs mt-1">
              Make sure Fn key monitoring is enabled in the main process
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialPreview;
