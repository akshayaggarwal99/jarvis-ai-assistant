import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import Settings from './Settings';
import { UpdateNotification, UpdateProgress, UpdateReady } from './UpdateComponents';
import { SuccessModal } from './SuccessModal';
import { theme, themeComponents } from '../styles/theme';
import { DashboardView, DictionaryView, AnalyticsView, HelpView } from './dashboard/views';

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

interface DashboardProps {
  preloadedData?: UserStats | null;
}

interface DictionaryEntry {
  id: string;
  word: string;
  pronunciation?: string;
  context?: string;
  createdAt: string;
  isAutoSuggested?: boolean;
  confidence?: number;
  originalWord?: string;
  usageCount?: number;
}

type ViewType = 'dashboard' | 'analytics' | 'dictionary' | 'settings' | 'help';

// Helper function to get hotkey display label
const getHotkeyLabel = (key: string): string => {
  const presets: Record<string, string> = { fn: 'Fn', option: 'Option', control: 'Ctrl' };
  return presets[key] || key.toUpperCase();
};

const Dashboard: React.FC<DashboardProps> = ({ preloadedData }) => {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentHotkey, setCurrentHotkey] = useState('fn'); // Default to 'fn'

  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [dictionaryEntries, setDictionaryEntries] = useState<DictionaryEntry[]>([]);
  const [showAddWord, setShowAddWord] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [newPronunciation, setNewPronunciation] = useState('');
  
  // Update state management
  const [updateNotification, setUpdateNotification] = useState<{
    visible: boolean;
    version: string;
    releaseNotes: string;
    isMajor?: boolean;
    downloadUrl?: string;
  }>({ visible: false, version: '', releaseNotes: '', isMajor: false, downloadUrl: '' });
  
  const [updateProgress, setUpdateProgress] = useState<{
    visible: boolean;
    progress: number;
  }>({ visible: false, progress: 0 });
  
  const [updateReady, setUpdateReady] = useState(false);
  
  // Success modal state for Pro upgrade celebration
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  const { user, signOut } = useAuth();
  // Open-source build: All features unlocked, no subscription check needed
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowSignOutModal(false);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  useEffect(() => {
    // Use preloaded data if available, otherwise load normally
    if (preloadedData) {
      setStats(preloadedData);
      setLoading(false);
      console.log('Using preloaded dashboard data');
      // Still load dictionary entries
      loadDictionaryEntries();
    } else if (user && user.uid) {
      // Force refresh analytics when user becomes available (handles auth restoration)
      const loadData = async () => {
        try {
          // Refresh analytics to ensure we get data for the correct user
          await (window as any).electronAPI?.refreshAnalytics();
          await loadDictionaryEntries();
        } catch (error) {
          console.error('Failed to refresh analytics:', error);
          // Fallback to regular load
          await loadDashboardData();
          await loadDictionaryEntries();
        } finally {
          setLoading(false);
        }
      };
      
      // Add a small delay to ensure IPC handlers are registered and set-user-id call completes
      const timer = setTimeout(loadData, 300);
      
      // Still poll occasionally for reliability (reduced to every 2 minutes)
      const interval = setInterval(loadDashboardData, 120000);
      
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
        // Note: The onStatsUpdate API doesn't provide a cleanup method
        // but that's okay since the listener will be cleaned up when the window closes
      };
    } else {
      // User not authenticated, reset loading state
      setLoading(false);
      setStats(null);
      setDictionaryEntries([]);
    }
  }, [user, preloadedData]); // Re-run when user changes

  // Separate effect for real-time stats listener - runs after stats are initialized
  useEffect(() => {
    if (!user?.uid) return; // Only set up listener when user is authenticated
    
    // Listen for real-time stats updates using the proper API
    const handleStatsUpdate = (updatedStats: UserStats) => {
      setStats(updatedStats);
    };
    
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.onStatsUpdate) {
      electronAPI.onStatsUpdate(handleStatsUpdate);
    }
    
    // Note: The onStatsUpdate API doesn't provide a cleanup method
    // but that's okay since the listener will be cleaned up when the window closes
  }, [user?.uid, stats]); // Re-run when user changes or stats are initialized

  // Load hotkey settings
  useEffect(() => {
    const loadHotkeySettings = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.appGetSettings) {
          const appSettings = await electronAPI.appGetSettings();
          if (appSettings?.hotkey) {
            setCurrentHotkey(appSettings.hotkey);
          }
        }
      } catch (error) {
        console.error('Failed to load hotkey settings:', error);
        // Keep default 'fn' on error
      }
    };

    loadHotkeySettings();
  }, []); // Load once on component mount

  // Update system IPC listeners
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) {
      console.log('❌ electronAPI not available');
      return;
    }

    console.log('🔧 Setting up IPC listeners...');

    // Listen for update events
    const handleUpdateAvailable = (event: any, data: { version: string; releaseNotes: string; isMajor?: boolean; downloadUrl?: string }) => {
      setUpdateNotification({
        visible: true,
        version: data.version,
        releaseNotes: data.releaseNotes,
        isMajor: data.isMajor || false,
        downloadUrl: data.downloadUrl || ''
      });
    };

    const handleUpdateProgress = (event: any, progress: { percent: number }) => {
      setUpdateProgress({
        visible: true,
        progress: progress.percent
      });
    };

    const handleUpdateDownloaded = () => {
      setUpdateProgress({ visible: false, progress: 0 });
      setUpdateReady(true);
    };

    const handleUpdateError = (event: any, error: { error: string }) => {
      setUpdateProgress({ visible: false, progress: 0 });
      setUpdateNotification({ visible: false, version: '', releaseNotes: '', isMajor: false, downloadUrl: '' });
      // Could show error notification here if needed
      console.error('Update error:', error.error);
    };

    // Add IPC listeners
    if (electronAPI.ipcRenderer) {
      console.log('🔧 Adding update listeners...');
      electronAPI.ipcRenderer.on('update-available', handleUpdateAvailable);
      electronAPI.ipcRenderer.on('update-progress', handleUpdateProgress);
      electronAPI.ipcRenderer.on('update-downloaded', handleUpdateDownloaded);
      electronAPI.ipcRenderer.on('update-download-error', handleUpdateError);
    }

    // Cleanup listeners
    return () => {
      if (electronAPI.ipcRenderer) {
        console.log('🧹 Cleaning up IPC listeners...');
        electronAPI.ipcRenderer.removeListener('update-available', handleUpdateAvailable);
        electronAPI.ipcRenderer.removeListener('update-progress', handleUpdateProgress);
        electronAPI.ipcRenderer.removeListener('update-downloaded', handleUpdateDownloaded);
        electronAPI.ipcRenderer.removeListener('update-download-error', handleUpdateError);
      }
    };
  }, []);

  const loadDictionaryEntries = async () => {
    try {
      const response = await (window as any).electronAPI?.getDictionary();
      if (response) {
        setDictionaryEntries(response);
      }
    } catch (error) {
      console.error('Failed to load dictionary:', error);
    }
  };

  const addDictionaryEntry = async () => {
    if (!newWord.trim()) return;
    
    try {
      await (window as any).electronAPI?.addDictionaryEntry(newWord, newPronunciation || undefined);
      setNewWord('');
      setNewPronunciation('');
      setShowAddWord(false);
      await loadDictionaryEntries();
    } catch (error) {
      console.error('Failed to add dictionary entry:', error);
    }
  };

  const removeDictionaryEntry = async (id: string) => {
    try {
      await (window as any).electronAPI?.removeDictionaryEntry(id);
      await loadDictionaryEntries();
    } catch (error) {
      console.error('Failed to remove dictionary entry:', error);
    }
  };

  const loadDashboardData = async () => {
    try {
      const response = await (window as any).electronAPI?.getStats();
      if (response) {
        setStats(response);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
      // If we get a "No handler registered" error, retry after a short delay
      if (error?.message?.includes('No handler registered')) {
        console.log('IPC handlers not ready, retrying in 500ms...');
        setTimeout(loadDashboardData, 500);
      }
    }
  };

  // Update handlers
  const handleUpdateDownload = async () => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || !updateNotification.downloadUrl) return;
    
    try {
      // Hide notification and show progress immediately
      setUpdateNotification({ visible: false, version: '', releaseNotes: '', isMajor: false, downloadUrl: '' });
      setUpdateProgress({ visible: true, progress: 0 });
      
      await electronAPI.downloadUpdate({
        downloadUrl: updateNotification.downloadUrl,
        version: updateNotification.version
      });
    } catch (error) {
      console.error('Download failed:', error);
      // Hide progress on error
      setUpdateProgress({ visible: false, progress: 0 });
    }
  };

  const handleUpdateDismiss = () => {
    setUpdateNotification({ visible: false, version: '', releaseNotes: '', isMajor: false, downloadUrl: '' });
  };

  const handleUpdateRestart = async () => {
    try {
      await (window as any).electronAPI?.restartApp();
    } catch (error) {
      console.error('Failed to restart for update:', error);
    }
  };

  const handleUpdateLater = () => {
    setUpdateReady(false);
  };

  if (loading) {
    return (
      <div className={`h-screen ${themeComponents.container} flex`}>
        {/* Liquid Glass Sidebar Skeleton */}
        <aside className={`w-72 ${themeComponents.sidebar}`}>
          <div className="px-6 py-5 border-b border-gray-700/30">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/10 rounded-lg animate-pulse"></div>
              <div className="flex flex-col space-y-2">
                <div className="w-20 h-4 bg-white/10 rounded animate-pulse"></div>
                <div className="w-16 h-3 bg-white/5 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-6 py-4 space-y-3 overflow-y-auto scrollbar-hide min-h-0">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center space-x-3 px-3 py-2.5">
                <div className="w-5 h-5 bg-white/10 rounded animate-pulse"></div>
                <div className="w-24 h-4 bg-white/10 rounded animate-pulse"></div>
              </div>
            ))}
          </nav>
        </aside>
        
        {/* Glass Main Content Skeleton */}
        <div className="flex-1 p-6 bg-transparent overflow-y-auto scrollbar-hide">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="w-64 h-8 bg-white/20 rounded animate-pulse animate-shimmer mb-2"></div>
              <div className="w-48 h-5 bg-white/10 rounded animate-pulse animate-shimmer"></div>
            </div>
            <div className="flex space-x-4">
              <div className="w-24 h-10 bg-white/20 rounded-xl animate-pulse animate-shimmer"></div>
              <div className="w-20 h-10 bg-white/20 rounded-xl animate-pulse animate-shimmer"></div>
            </div>
          </div>
          
            {/* Liquid Glass Stats Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="card-glass p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-white/20 rounded-xl animate-pulse animate-shimmer"></div>
                    <div className="w-16 h-6 bg-white/20 rounded-full animate-pulse animate-shimmer"></div>
                  </div>
                  <div className="w-20 h-8 bg-white/20 rounded animate-pulse animate-shimmer mb-2"></div>
                  <div className="w-24 h-4 bg-white/15 rounded animate-pulse animate-shimmer mb-3"></div>
                  <div className="w-full h-2 bg-white/15 rounded-full animate-pulse animate-shimmer"></div>
                </div>
              ))}
            </div>
          
          {/* Quick Actions Skeleton */}
          <div className="w-full h-32 card-glass animate-pulse animate-shimmer mb-8 shadow-xl"></div>
          
          {/* Recent Activity Skeleton */}
          <div className="card-glass p-6 shadow-xl">
            <div className="w-32 h-6 bg-white/20 rounded animate-pulse animate-shimmer mb-6"></div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-4 p-4 bg-white/5 rounded-xl">
                  <div className="w-12 h-12 bg-white/20 rounded-xl animate-pulse animate-shimmer"></div>
                  <div className="flex-1 space-y-2">
                    <div className="w-48 h-4 bg-white/20 rounded animate-pulse animate-shimmer"></div>
                    <div className="w-32 h-3 bg-white/15 rounded animate-pulse animate-shimmer"></div>
                  </div>
                  <div className="w-16 h-6 bg-white/20 rounded-full animate-pulse animate-shimmer"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get user's first name for personalization
  const getUserFirstName = () => {
    if (user?.displayName) {
      const firstName = user.displayName.split(' ')[0];
      return firstName;
    }
    return 'there';
  };

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className={`h-screen ${themeComponents.container} flex`} style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Enhanced Dark Glass Sidebar with Beautiful Separation */}
      <aside className={`w-64 relative`} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Sophisticated dark glass background with gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900/80 via-black/70 to-gray-950/90 backdrop-blur-2xl border-r border-gray-700/30"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-white/3 via-transparent to-white/2"></div>
        {/* Additional gradient for elegant visual separation */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent"></div>
        {/* Subtle inner shadow for depth */}
        <div className="absolute inset-0 shadow-[inset_-1px_0_0_rgba(255,255,255,0.1)]"></div>
        
        <div className="relative z-10 h-full flex flex-col">
          {/* Logo Section */}
          <div className="px-6 pt-12 pb-8">
            <div className="px-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-white/20 to-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/20 shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 20 20" height="24px" viewBox="0 0 20 20" width="24px" fill="#ffffff">
                    <rect fill="none" height="20" width="20" y="0"/>
                    <path d="M15.98,5.82L10,2.5L4.02,5.82l3.8,2.11C8.37,7.36,9.14,7,10,7s1.63,0.36,2.17,0.93L15.98,5.82z M8.5,10 c0-0.83,0.67-1.5,1.5-1.5s1.5,0.67,1.5,1.5s-0.67,1.5-1.5,1.5S8.5,10.83,8.5,10z M9.25,17.08l-6-3.33V7.11L7.1,9.24 C7.03,9.49,7,9.74,7,10c0,1.4,0.96,2.57,2.25,2.91V17.08z M10.75,17.08v-4.18C12.04,12.57,13,11.4,13,10c0-0.26-0.03-0.51-0.1-0.76 l3.85-2.14l0,6.64L10.75,17.08z"/>
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-white font-semibold text-lg drop-shadow-sm">Jarvis</span>
                  <span className="text-white/70 text-xs font-medium">AI Assistant</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Enhanced Navigation */}
          <nav className="flex-1 px-6 py-6 space-y-3 overflow-y-auto scrollbar-hide min-h-0">
            <button 
              onClick={() => setCurrentView('dashboard')}
              className={`group w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 text-left ${
                currentView === 'dashboard' 
                  ? 'text-white bg-white/25 backdrop-blur-xl shadow-lg border border-white/20' 
                  : 'text-white/80 hover:text-white hover:bg-white/15 hover:backdrop-blur-lg hover:border hover:border-white/10'
              }`}
            >
              <span className="material-icons-outlined text-[18px] group-hover:scale-110 transition-transform duration-200">dashboard</span>
              <span className="text-sm font-medium">Dashboard</span>
            </button>
            <button 
              onClick={() => setCurrentView('analytics')}
              className={`group w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 text-left ${
                currentView === 'analytics' 
                  ? 'text-white bg-white/25 backdrop-blur-xl shadow-lg border border-white/20' 
                  : 'text-white/80 hover:text-white hover:bg-white/15 hover:backdrop-blur-lg hover:border hover:border-white/10'
              }`}
            >
              <span className="material-icons-outlined text-[18px] group-hover:scale-110 transition-transform duration-200">analytics</span>
              <span className="text-sm font-medium">Analytics</span>
            </button>
            <button 
              onClick={() => setCurrentView('dictionary')}
              className={`group w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 text-left ${
                currentView === 'dictionary' 
                  ? 'text-white bg-white/25 backdrop-blur-xl shadow-lg border border-white/20' 
                  : 'text-white/80 hover:text-white hover:bg-white/15 hover:backdrop-blur-lg hover:border hover:border-white/10'
              }`}
            >
              <span className="material-icons-outlined text-[18px] group-hover:scale-110 transition-transform duration-200">book</span>
              <span className="text-sm font-medium">Dictionary</span>
            </button>
            <button 
              onClick={() => setCurrentView('settings')}
              className={`group w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 text-left ${
                currentView === 'settings' 
                  ? 'text-white bg-white/25 backdrop-blur-xl shadow-lg border border-white/20' 
                  : 'text-white/80 hover:text-white hover:bg-white/15 hover:backdrop-blur-lg hover:border hover:border-white/10'
              }`}
            >
              <span className="material-icons-outlined text-[18px] group-hover:scale-110 transition-transform duration-200">settings</span>
              <span className="text-sm font-medium">Settings</span>
            </button>
          </nav>

        {/* Open Source Build - Pro Status */}
        <div className="px-6 pb-6 flex-shrink-0">
          <div className="p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="text-sm text-white/90">Pro (Open Source)</div>
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            </div>
            <div className="text-xs text-white/60 mt-1">All features unlocked</div>
          </div>
        </div>
        </div>
      </aside>

      {/* Main Content - Liquid Glass theme */}
      <main className="flex-1 p-8 bg-transparent overflow-y-auto scrollbar-hide" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        {/* Enhanced Header */}
        <div className="flex items-center justify-between mb-12" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div>
            <h1 className={`${theme.text.primary} mb-2`}>{getTimeBasedGreeting()}, {getUserFirstName()}</h1>
            <p className={`${theme.text.secondary}`}>
              <span className="inline-flex items-center space-x-2">
                <span>Press</span>
                <kbd className={`${theme.glass.secondary} ${theme.radius.sm} px-2 py-1 text-xs font-mono ${theme.text.primary} ${theme.shadow.sm}`}>{getHotkeyLabel(currentHotkey)}</kbd>
                <span>in any text box to start dictating</span>
              </span>
            </p>
          </div>
          <div className="flex items-center space-x-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setCurrentView('help')}
              className={`${theme.text.secondary} hover:${theme.text.primary} transition-all duration-200 p-2 ${theme.radius.lg} hover:${theme.glass.secondary} ${
                currentView === 'help' ? `${theme.text.primary} ${theme.glass.active}` : ''
              }`}
              title="Help & Support"
            >
              <span className="material-icons-outlined">help</span>
            </button>
            <button
              onClick={() => setShowSignOutModal(true)}
              className={`${theme.text.secondary} hover:${theme.text.primary} transition-all duration-200 p-2 ${theme.radius.lg} hover:${theme.glass.secondary}`}
              title="Sign Out"
            >
              <span className="material-icons-outlined">logout</span>
            </button>
          </div>
        </div>

        {/* Render different views based on currentView */}
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {currentView === 'dashboard' && (
          <DashboardView
            stats={stats}
            currentHotkey={currentHotkey}
            onNavigate={(view) => setCurrentView(view as ViewType)}
          />
        )}

        {currentView === 'dictionary' && (
          <DictionaryView
            entries={dictionaryEntries}
            showAddWord={showAddWord}
            newWord={newWord}
            newPronunciation={newPronunciation}
            onShowAddWord={setShowAddWord}
            onNewWordChange={setNewWord}
            onNewPronunciationChange={setNewPronunciation}
            onAddEntry={addDictionaryEntry}
            onRemoveEntry={removeDictionaryEntry}
          />
        )}

        {currentView === 'analytics' && <AnalyticsView stats={stats} />}

        {currentView === 'help' && <HelpView />}

        {/* Settings View */}
        {currentView === 'settings' && <Settings />}
        </div>
      </main>

      {/* Sign Out Confirmation Modal */}
      {showSignOutModal && (
        <div className={`fixed inset-0 ${theme.background.modal} flex items-center justify-center z-50`} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className={`${theme.glass.primary} ${theme.radius.xl} p-8 max-w-md w-full mx-6 ${theme.shadow}`}>
            {/* Header with icon */}
            <div className="text-center mb-6">
              <div className={`w-14 h-14 ${theme.glass.secondary} ${theme.radius.xl} flex items-center justify-center mx-auto mb-4`}>
                <svg className={`w-6 h-6 ${theme.text.primary}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className={`${theme.text.primary} text-xl font-semibold mb-2`}>Sign Out</h3>
              <p className={`${theme.text.secondary} text-sm`}>
                Are you sure you want to sign out?
              </p>
            </div>
            
            {/* Warning message */}
            <div className={`${theme.glass.secondary} ${theme.radius.lg} p-4 mb-8`}>
              <div className="flex items-start space-x-3">
                <div className={`w-5 h-5 ${theme.glass.secondary} rounded-full flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <svg className={`w-3 h-3 ${theme.text.primary}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.667-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className={`${theme.text.secondary} text-sm font-medium mb-1`}>Your personal dictionary will be deleted.</p>
                  <p className={`${theme.text.tertiary} text-xs leading-relaxed`}>
                    All custom words and pronunciations you've added will be permanently removed from this device.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowSignOutModal(false)}
                className={`flex-1 px-4 py-2.5 ${theme.glass.secondary} ${theme.radius.lg} ${theme.text.secondary} hover:${theme.text.primary} transition-all duration-200 text-sm font-medium`}
              >
                Cancel
              </button>
              <button
                onClick={handleSignOut}
                className={`flex-1 px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white ${theme.radius.lg} transition-all duration-200 transform hover:scale-105 active:scale-95 ${theme.shadow} text-sm font-medium`}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Components */}
      <UpdateNotification
        isVisible={updateNotification.visible}
        version={updateNotification.version}
        releaseNotes={updateNotification.releaseNotes}
        isMajor={updateNotification.isMajor}
        onDownload={handleUpdateDownload}
        onDismiss={handleUpdateDismiss}
      />
      
      <UpdateProgress
        isVisible={updateProgress.visible}
        progress={updateProgress.progress}
      />
      
      <UpdateReady
        isVisible={updateReady}
        onRestart={handleUpdateRestart}
        onLater={handleUpdateLater}
      />
      
      {/* Success Modal for Pro upgrade celebration */}
      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="🎉 Welcome to Jarvis Pro!"
        message="Thank you for upgrading! You now have unlimited transcriptions and premium features. Enjoy the enhanced Jarvis experience!"
      />
    </div>
  );
};

export default Dashboard;
