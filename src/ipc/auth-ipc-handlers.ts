/**
 * AuthIPCHandlers - Handles authentication-related IPC communication
 */
import { ipcMain } from 'electron';
import { Logger } from '../core/logger';
import { AuthService, AuthState } from '../services/auth-service';
import { OptimizedAnalyticsManager } from '../analytics/optimized-analytics-manager';

export class AuthIPCHandlers {
  private static instance: AuthIPCHandlers;
  
  private analyticsManager: OptimizedAnalyticsManager | null = null;
  private authService: AuthService;
  private hasCompletedOnboardingFn: (() => boolean) | null = null;
  private activateOverlaysAndShortcutsFn: (() => Promise<void>) | null = null;
  private initializeJarvisFn: (() => Promise<void>) | null = null;
  private jarvisCoreRef: { value: any } = { value: null };
  
  private constructor() {
    this.authService = AuthService.getInstance();
  }
  
  static getInstance(): AuthIPCHandlers {
    if (!AuthIPCHandlers.instance) {
      AuthIPCHandlers.instance = new AuthIPCHandlers();
    }
    return AuthIPCHandlers.instance;
  }
  
  setAnalyticsManager(manager: OptimizedAnalyticsManager): void {
    this.analyticsManager = manager;
  }
  
  setCallbacks(
    hasCompletedOnboarding: () => boolean,
    activateOverlaysAndShortcuts: () => Promise<void>,
    initializeJarvis: () => Promise<void>,
    jarvisCoreRef: { value: any }
  ): void {
    this.hasCompletedOnboardingFn = hasCompletedOnboarding;
    this.activateOverlaysAndShortcutsFn = activateOverlaysAndShortcuts;
    this.initializeJarvisFn = initializeJarvis;
    this.jarvisCoreRef = jarvisCoreRef;
  }
  
  registerHandlers(): void {
    // Set user ID for analytics
    ipcMain.handle('set-user-id', async (_, userId: string) => {
      Logger.info('◎ [IPC] Received set-user-id request with userId:', userId);
      try {
        if (this.analyticsManager) {
          await this.analyticsManager.setUserId(userId);
        }
        Logger.info('● [IPC] Successfully set user ID in analytics manager:', userId);
        
        // Check if onboarding is completed, activate overlays if so
        if (this.hasCompletedOnboardingFn && this.hasCompletedOnboardingFn()) {
          Logger.info('▶ [IPC] User authenticated and onboarding completed - activating overlays and shortcuts');
          if (this.activateOverlaysAndShortcutsFn) {
            await this.activateOverlaysAndShortcutsFn();
          }
        } else {
          Logger.info('⧖ [IPC] User authenticated but onboarding not completed - waiting for onboarding completion');
        }
      } catch (error) {
        Logger.error('✖ [IPC] Failed to set user ID in analytics manager:', error);
        throw error;
      }
    });
    
    // Save auth state
    ipcMain.handle('save-auth-state', async (_, authState: AuthState) => {
      Logger.info('◎ [IPC] Received save-auth-state request');
      Logger.debug('◆ [IPC] Auth state data:', JSON.stringify(authState, null, 2));
      this.authService.saveAuthState(authState);
      
      // Initialize Jarvis Core if not already initialized
      if (!this.jarvisCoreRef.value && this.initializeJarvisFn) {
        Logger.info('▶ [Auth] Initializing Jarvis Core...');
        await this.initializeJarvisFn();
      }
      
      return true;
    });
    
    // Load auth state
    ipcMain.handle('load-auth-state', async () => {
      Logger.info('◎ [IPC] Received load-auth-state request');
      const authState = this.authService.loadAuthState();
      Logger.info('▼ [IPC] Returning auth state:', authState ? authState.uid : 'null');
      return authState;
    });
    
    // Clear auth state
    ipcMain.handle('clear-auth-state', async () => {
      Logger.info('◎ [IPC] Received clear-auth-state request');
      this.authService.clearAuthState();
      return true;
    });
    
    // Validate auth state
    ipcMain.handle('validate-auth-state', async () => {
      Logger.info('◎ [IPC] Received validate-auth-state request');
      const result = this.authService.validateAuthState();
      
      if (!result.valid) {
        Logger.info('✖ [IPC] Auth state invalid:', result.reason);
      } else {
        Logger.info('● [IPC] Auth state is valid:', result.authState?.uid);
      }
      
      return result;
    });
    
    Logger.info('✅ AuthIPCHandlers registered');
  }
}
