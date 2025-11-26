import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import OnboardingFlow from './onboarding/OnboardingFlow';
import Dashboard from './components/Dashboard';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Debug user state changes
  useEffect(() => {
    console.log('🔄 [App] User state changed:', {
      hasUser: !!user,
      uid: user?.uid,
      loading,
      hasCompletedOnboarding,
      checkingOnboarding,
      isInitialized
    });
  }, [user, loading, hasCompletedOnboarding, checkingOnboarding, isInitialized]);

  // Initialize app state once
  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true);
      console.log('🚀 [App] App initialized');
    }
  }, [isInitialized]);

  // Check if user has completed onboarding when user changes
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      // Only check onboarding status if user is authenticated
      if (!user) {
        console.log('🔄 [App] No user - resetting onboarding state');
        setHasCompletedOnboarding(false);
        setCheckingOnboarding(false);
        return;
      }
      
      setCheckingOnboarding(true);
      
      // Add timeout protection to prevent indefinite loading
      const timeoutId = setTimeout(() => {
        console.error('❌ [App] Onboarding status check timed out after 10 seconds');
        setCheckingOnboarding(false);
        setHasCompletedOnboarding(false); // Default to requiring onboarding
      }, 10000); // 10 second timeout
      
      try {
        // DEVELOPMENT: Allow bypassing forced onboarding for normal testing
        const isDevelopment = false; // Set to true only when testing onboarding UI
        const forceOnboarding = isDevelopment;
        
        if (forceOnboarding) {
          console.log('🔧 [App] DEVELOPMENT: Forcing onboarding flow');
          setHasCompletedOnboarding(false);
          setCheckingOnboarding(false);
          clearTimeout(timeoutId);
          return;
        }
        
        // Always use main process as authoritative source for onboarding status
        const electronAPI = (window as any).electronAPI;
        let isCompleted = false;
        
        if (electronAPI && electronAPI.checkOnboardingStatus) {
          isCompleted = await electronAPI.checkOnboardingStatus();
          console.log('🔍 [App] Onboarding status from main process:', isCompleted);
        } else {
          // Fallback to localStorage if IPC not available (should not happen in production)
          const savedStatus = localStorage.getItem('jarvis_onboarding_completed');
          isCompleted = savedStatus === 'true';
          console.log('🔍 [App] Onboarding status from localStorage (fallback):', isCompleted);
        }
        
        setHasCompletedOnboarding(isCompleted);
        
        // If user is authenticated but hasn't completed onboarding, this is a sign of 
        // incomplete app lifecycle - user should complete onboarding to proceed
        if (!isCompleted) {
          console.log('⚠️ [App] User authenticated but onboarding incomplete - user must complete onboarding');
        }
        
        console.log('✅ [App] Onboarding status check completed:', { 
          userExists: !!user, 
          isCompleted,
          uid: user?.uid 
        });
      } catch (error) {
        console.error('❌ [App] Failed to check onboarding status:', error);
        setHasCompletedOnboarding(false); // Default to requiring onboarding
      } finally {
        clearTimeout(timeoutId);
        setCheckingOnboarding(false);
      }
    };

    checkOnboardingStatus();
  }, [user]); // Only run when user changes

  // Pre-load dashboard data when user is authenticated and onboarding is complete
  useEffect(() => {
    const preloadDashboardData = async () => {
      if (!user || !hasCompletedOnboarding) return;
      
      setLoadingData(true);
      try {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI && electronAPI.getStats) {
          const stats = await electronAPI.getStats();
          setDashboardData(stats);
        }
      } catch (error) {
        console.error('Failed to pre-load dashboard data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    // Defer data loading to prevent blocking UI
    const timeoutId = setTimeout(preloadDashboardData, 100);
    return () => clearTimeout(timeoutId);
  }, [user, hasCompletedOnboarding]);

  // Notify main process about onboarding state to prevent voice recording overlays
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI) {
      if (user && !hasCompletedOnboarding) {
        // User is in onboarding - disable voice recording
        console.log('🚫 [App] Notifying main process: onboarding in progress - disabling voice recording');
        if (electronAPI.setOnboardingActive) {
          electronAPI.setOnboardingActive(true).catch(console.error);
        } else if (electronAPI.ipcRenderer && electronAPI.ipcRenderer.invoke) {
          electronAPI.ipcRenderer.invoke('set-onboarding-active', true).catch(console.error);
        } else {
          console.warn('⚠️ [App] No method available to set onboarding state');
        }
      } else if (user && hasCompletedOnboarding) {
        // User completed onboarding - enable voice recording
        console.log('✅ [App] Notifying main process: onboarding complete - enabling voice recording');
        if (electronAPI.setOnboardingActive) {
          electronAPI.setOnboardingActive(false).catch(console.error);
        } else if (electronAPI.ipcRenderer && electronAPI.ipcRenderer.invoke) {
          electronAPI.ipcRenderer.invoke('set-onboarding-active', false).catch(console.error);
        } else {
          console.warn('⚠️ [App] No method available to set onboarding state');
        }
      }
    }
  }, [user, hasCompletedOnboarding]);

  // Set up global typing detection for nudge system - ONLY after onboarding is complete
  useEffect(() => {
    if (!user || !hasCompletedOnboarding) {
      console.log('🚫 [App] Skipping global event listeners - onboarding not complete');
      return;
    }

    console.log('✅ [App] Setting up global event listeners - onboarding complete');

    let typingTimer: NodeJS.Timeout;
    
    const handleTyping = () => {
      // Debounce typing events to avoid excessive calls
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI && electronAPI.nudgeRecordTyping) {
          electronAPI.nudgeRecordTyping();
        }
      }, 1000); // Record typing activity every second of continuous typing
    };

    // Listen for various typing events
    const events = ['keydown', 'input', 'paste'];
    events.forEach(event => {
      document.addEventListener(event, handleTyping);
    });

    // Listen for trigger-jarvis-from-nudge event
    const handleJarvisTrigger = () => {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.nudgeRecordJarvisUsage) {
        electronAPI.nudgeRecordJarvisUsage();
      }
      // You could also programmatically activate the Fn key or voice recording here
    };

    const electronAPI = (window as any).electronAPI;
    if (electronAPI && electronAPI.ipcRenderer) {
      electronAPI.ipcRenderer.on('trigger-jarvis-from-nudge', handleJarvisTrigger);
    }

    return () => {
      clearTimeout(typingTimer);
      events.forEach(event => {
        document.removeEventListener(event, handleTyping);
      });
      if (electronAPI && electronAPI.ipcRenderer) {
        electronAPI.ipcRenderer.removeListener('trigger-jarvis-from-nudge', handleJarvisTrigger);
      }
    };
  }, [user, hasCompletedOnboarding]);

  // Add typing detection for nudge system - ONLY after onboarding is complete
  useEffect(() => {
    if (!user || !hasCompletedOnboarding) {
      console.log('🚫 [App] Skipping keydown listener - onboarding not complete');
      return;
    }

    console.log('✅ [App] Setting up keydown listener - onboarding complete');

    const handleKeyPress = () => {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.nudgeRecordTyping) {
        electronAPI.nudgeRecordTyping();
      }
    };

    // Listen for any keypress in the app
    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [user, hasCompletedOnboarding]);

  // Show loading only for auth and onboarding checks, not for data loading
  if (loading || checkingOnboarding) {
    let loadingMessage = "Checking authentication...";
    if (checkingOnboarding) loadingMessage = "Setting up your workspace...";
    
    return (
      <div className="h-screen bg-gradient-to-br from-black via-gray-950 to-black flex items-center justify-center font-inter">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/70">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  // Show onboarding if user hasn't completed onboarding
  if (!hasCompletedOnboarding) {
    console.log('🔄 [App] Rendering OnboardingFlow - user exists but onboarding incomplete');
    return (
      <OnboardingFlow 
        onComplete={async () => {
          console.log('📝 [App] Onboarding completion initiated...');
          
          try {
            // Mark onboarding as completed locally and with electron
            localStorage.setItem('jarvis_onboarding_completed', 'true');
            console.log('✅ [App] Onboarding marked complete in localStorage');
            
            const electronAPI = (window as any).electronAPI;
            if (electronAPI && electronAPI.completeOnboarding) {
              await electronAPI.completeOnboarding();
              console.log('✅ [App] Onboarding completed via IPC');
            } else {
              console.warn('⚠️ [App] electronAPI.completeOnboarding not available');
            }
            
            // Enable voice recording now that onboarding is complete
            if (electronAPI) {
              if (electronAPI.setOnboardingActive) {
                await electronAPI.setOnboardingActive(false);
                console.log('✅ [App] Voice recording enabled after onboarding');
              } else if (electronAPI.ipcRenderer && electronAPI.ipcRenderer.invoke) {
                await electronAPI.ipcRenderer.invoke('set-onboarding-active', false);
                console.log('✅ [App] Voice recording enabled after onboarding');
              } else {
                console.warn('⚠️ [App] No method available to enable voice recording');
              }
            }
            
            setHasCompletedOnboarding(true);
            console.log('🎉 [App] Onboarding completion process finished');
          } catch (error) {
            console.error('❌ [App] Error completing onboarding:', error);
            // Still mark as completed locally to prevent getting stuck
            setHasCompletedOnboarding(true);
          }
        }}
      />
    );
  }

  // Show dashboard if user is authenticated, has completed onboarding, and data is loaded
  console.log('🔄 [App] Rendering Dashboard - user authenticated and onboarding complete');
  return <Dashboard preloadedData={dashboardData} />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;