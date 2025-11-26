/**
 * Dashboard main stats view
 */
import React from 'react';
import { theme } from '../../../styles/theme';

interface UserStats {
  totalSessions: number;
  totalWords: number;
  totalCharacters: number;
  averageWPM: number;
  estimatedTimeSavedMs: number;
  streakDays: number;
  lastActiveDate: string;
  dailyTimeSaved?: number;
  weeklyTimeSaved?: number;
  monthlyTimeSaved?: number;
  efficiencyMultiplier?: number;
}

interface DashboardViewProps {
  stats: UserStats | null;
  currentHotkey: string;
  onNavigate: (view: string) => void;
}

// Helper to format numbers
const formatNumber = (num: number): string => {
  if (num < 1000) return num.toString();
  return `${Math.round(num / 1000)}k`;
};

// Helper to get hotkey label
const getHotkeyLabel = (key: string): string => {
  const presets: Record<string, string> = { fn: 'Fn', option: 'Option', control: 'Ctrl' };
  return presets[key] || key.toUpperCase();
};

// Helper to format time saved
const formatTimeSaved = (ms: number): string => {
  if (ms < 60000) {
    const seconds = Math.round(ms / 1000);
    return `${seconds} ${seconds === 1 ? 'sec' : 'secs'}`;
  } else if (ms < 3600000) {
    const minutes = Math.round(ms / 60000);
    return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
  } else if (ms < 86400000) {
    const hours = Math.round(ms / 3600000 * 10) / 10;
    return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
  } else {
    const days = Math.round(ms / 86400000 * 10) / 10;
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
};

export const DashboardView: React.FC<DashboardViewProps> = ({ stats, currentHotkey, onNavigate }) => {
  return (
    <div className="space-y-8">
      {/* Primary Metric Section */}
      {stats && stats.totalSessions > 0 ? (
        <div className={`${theme.glass.primary} ${theme.radius.xl} p-8`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-baseline space-x-3 mb-2">
                <div className={`text-4xl font-medium tracking-tight ${theme.text.primary}`}>
                  {formatTimeSaved(stats.estimatedTimeSavedMs || 0)}
                </div>
                <div className={`text-base ${theme.text.tertiary} font-normal`}>lifetime saved</div>
              </div>
              <div className={`${theme.text.tertiary} text-sm`}>
                {stats.totalSessions} sessions • all time
              </div>
            </div>
            <div className="w-2 h-2 bg-white/40 rounded-full"></div>
          </div>
        </div>
      ) : (
        /* First-time user experience */
        <div className={`${theme.glass.primary} ${theme.radius.xl} p-8 text-center`}>
          <div className={`w-12 h-12 ${theme.glass.secondary} ${theme.radius.lg} flex items-center justify-center mx-auto mb-6`}>
            <span className={`material-icons-outlined ${theme.text.secondary} text-xl`}>mic</span>
          </div>
          <h2 className={`text-xl font-medium ${theme.text.primary} mb-4`}>Ready to dictate?</h2>
          <div className={`${theme.glass.secondary} ${theme.radius.lg} p-6`}>
            <div className="text-center mb-4">
              <div className={`${theme.text.primary} mb-2 font-normal`}>Press {getHotkeyLabel(currentHotkey)} Key to Dictate in any text box</div>
              <div className={`${theme.text.tertiary} text-sm`}>
                Hold <kbd className={`${theme.glass.secondary} ${theme.text.primary} px-2 py-1 ${theme.radius.sm} font-mono text-xs`}>{getHotkeyLabel(currentHotkey)}</kbd> and speak your request
              </div>
            </div>
            <div className={`${theme.text.quaternary} text-center text-xs`}>
              Jarvis will transcribe and respond instantly
            </div>
          </div>
        </div>
      )}

      {/* Minimal Stats Grid */}
      {stats && stats.totalSessions > 0 && (
        <div className="grid grid-cols-3 gap-6">
          <div className="card-glass p-6 transition-all duration-200 hover:bg-white/5">
            <div className="text-3xl font-semibold text-white mb-2">{stats.streakDays || 1}</div>
            <div className="text-white/70 text-sm font-medium">Day Streak</div>
          </div>
          <div className="card-glass p-6 transition-all duration-200 hover:bg-white/5">
            <div className="text-3xl font-semibold text-white mb-2">{stats.averageWPM}</div>
            <div className="text-white/70 text-sm font-medium">Avg WPM</div>
          </div>
          <div className="card-glass p-6 transition-all duration-200 hover:bg-white/5">
            <div className="text-3xl font-medium text-white mb-2">{formatNumber(stats.totalWords)}</div>
            <div className="text-white/70 text-sm font-medium">Words</div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {stats && stats.totalSessions > 0 && (
        <div className="card-glass p-6">
          <h3 className="text-lg font-medium text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => onNavigate('analytics')}
              className={`${theme.button.outline} p-4 text-left ${theme.radius.xl} group`}
            >
              <div className="text-white font-medium text-sm mb-1">View Analytics</div>
              <div className="text-white/60 text-xs">Detailed insights</div>
            </button>
            <button
              onClick={() => onNavigate('dictionary')}
              className={`${theme.button.outline} p-4 text-left ${theme.radius.xl} group`}
            >
              <div className="text-white font-medium text-sm mb-1">Custom Dictionary</div>
              <div className="text-white/60 text-xs">Manage words</div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
