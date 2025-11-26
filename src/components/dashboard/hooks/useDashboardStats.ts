/**
 * Hook for dashboard statistics management
 */
import { useState, useEffect } from 'react';

export interface UserStats {
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

export function useDashboardStats(userId: string | undefined, preloadedData?: UserStats | null) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = async () => {
    try {
      const response = await (window as any).electronAPI?.getStats();
      if (response) {
        setStats(response);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
      if ((error as any)?.message?.includes('No handler registered')) {
        setTimeout(loadDashboardData, 500);
      }
    }
  };

  useEffect(() => {
    if (preloadedData) {
      setStats(preloadedData);
      setLoading(false);
      return;
    }
    
    if (userId) {
      const loadData = async () => {
        try {
          await (window as any).electronAPI?.refreshAnalytics();
        } catch (error) {
          console.error('Failed to refresh analytics:', error);
          await loadDashboardData();
        } finally {
          setLoading(false);
        }
      };
      
      const timer = setTimeout(loadData, 300);
      const interval = setInterval(loadDashboardData, 120000);
      
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    } else {
      setLoading(false);
      setStats(null);
    }
  }, [userId, preloadedData]);

  // Real-time stats listener
  useEffect(() => {
    if (!userId) return;
    
    const handleStatsUpdate = (updatedStats: UserStats) => {
      setStats(updatedStats);
    };
    
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.onStatsUpdate) {
      electronAPI.onStatsUpdate(handleStatsUpdate);
    }
  }, [userId, stats]);

  return { stats, loading, refreshStats: loadDashboardData };
}

// Helper functions
export const formatNumber = (num: number): string => {
  if (num < 1000) return num.toString();
  return `${Math.round(num / 1000)}k`;
};

export const formatTimeSaved = (ms: number): string => {
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
