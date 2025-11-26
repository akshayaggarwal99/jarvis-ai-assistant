/**
 * Analytics view component
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
}

interface AnalyticsViewProps {
  stats: UserStats | null;
}

// Helper to format numbers
const formatNumber = (num: number): string => {
  if (num < 1000) return num.toString();
  return `${Math.round(num / 1000)}k`;
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

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ stats }) => {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-medium text-white mb-1">Analytics</h2>
        <p className="text-white/60 text-sm">Your usage insights</p>
      </div>

      {stats && stats.totalSessions > 0 ? (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 text-center transition-all duration-200 hover:bg-white/[0.06]`}>
              <div className={`text-2xl font-medium ${theme.text.primary} mb-2`}>
                {formatTimeSaved(stats.estimatedTimeSavedMs || 0)}
              </div>
              <div className={`${theme.text.tertiary} text-xs font-medium`}>Lifetime Saved</div>
            </div>
            <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 text-center transition-all duration-200 hover:bg-white/[0.06]`}>
              <div className={`text-2xl font-medium ${theme.text.primary} mb-2`}>{stats.totalSessions}</div>
              <div className={`${theme.text.tertiary} text-xs font-medium`}>Sessions</div>
            </div>
            <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 text-center transition-all duration-200 hover:bg-white/[0.06]`}>
              <div className={`text-2xl font-medium ${theme.text.primary} mb-2`}>{formatNumber(stats.totalWords)}</div>
              <div className={`${theme.text.tertiary} text-xs font-medium`}>Words</div>
            </div>
            <div className={`${theme.glass.primary} ${theme.radius.xl} p-6 text-center transition-all duration-200 hover:bg-white/[0.06]`}>
              <div className={`text-2xl font-medium ${theme.text.primary} mb-2`}>{stats.averageWPM}</div>
              <div className={`${theme.text.tertiary} text-xs font-medium`}>Avg WPM</div>
            </div>
          </div>

          {/* Usage Insights */}
          <div className={`${theme.glass.primary} ${theme.radius.xl} p-6`}>
            <h3 className={`text-base font-medium ${theme.text.primary} mb-4`}>Usage Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className={`${theme.text.tertiary} text-sm`}>Words per session</span>
                  <span className={`${theme.text.primary} text-sm`}>{Math.round(stats.totalWords / stats.totalSessions)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`${theme.text.tertiary} text-sm`}>Average session time</span>
                  <span className={`${theme.text.primary} text-sm`}>{formatTimeSaved((stats.estimatedTimeSavedMs || 0) / stats.totalSessions)}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className={`${theme.text.tertiary} text-sm`}>Current streak</span>
                  <span className={`${theme.text.primary} text-sm`}>{stats.streakDays || 1} days</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`${theme.text.tertiary} text-sm`}>Sessions this week</span>
                  <span className={`${theme.text.primary} text-sm`}>{Math.min(stats.totalSessions, 7)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity Placeholder */}
          <div className={`${theme.glass.primary} ${theme.radius.xl} p-6`}>
            <h3 className={`text-base font-medium ${theme.text.primary} mb-4`}>Recent Activity</h3>
            <div className="text-center py-8">
              <div className={`w-8 h-8 ${theme.glass.secondary} ${theme.radius.lg} flex items-center justify-center mx-auto mb-3`}>
                <span className={`material-icons-outlined ${theme.text.tertiary} text-sm`}>history</span>
              </div>
              <p className={`${theme.text.quaternary} text-xs`}>Session history coming soon</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <div className={`w-12 h-12 ${theme.glass.secondary} ${theme.radius.lg} flex items-center justify-center mx-auto mb-4`}>
            <span className={`material-icons-outlined ${theme.text.tertiary} text-xl`}>analytics</span>
          </div>
          <h3 className={`text-base font-medium ${theme.text.secondary} mb-2`}>No data yet</h3>
          <p className={`${theme.text.quaternary} text-sm`}>Start using Jarvis to see your insights</p>
        </div>
      )}
    </div>
  );
};
