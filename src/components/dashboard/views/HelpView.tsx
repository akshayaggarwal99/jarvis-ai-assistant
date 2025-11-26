/**
 * Help view component
 */
import React from 'react';
import YouTubeEmbed from '../../YouTubeEmbed';

export const HelpView: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-medium text-white mb-3">Help & Support</h1>
        <p className="text-white/70">Learn how to use Jarvis effectively</p>
      </div>

      {/* Demo Video */}
      <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden mb-8 shadow-xl">
        <div className="p-4 border-b border-gray-700/30">
          <h2 className="font-medium text-white">Quick Demo</h2>
          <p className="text-sm text-white/60">2-minute overview of Jarvis</p>
        </div>
        <div className="aspect-video bg-white/10">
          <YouTubeEmbed videoId="TnNf300Bbxg" title="Jarvis Demo" />
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-6 shadow-xl">
        <h3 className="font-medium text-white mb-4">Keyboard Shortcuts</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">Voice dictation</span>
            <span className="text-xs text-white/60">Configurable in Settings</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">Open dashboard</span>
            <kbd className="backdrop-blur-lg bg-gray-900/60 border border-gray-700/60 rounded px-2 py-1 text-xs font-mono text-white shadow-lg">⌘ + ⌥ + J</kbd>
          </div>
        </div>
      </div>
    </div>
  );
};
