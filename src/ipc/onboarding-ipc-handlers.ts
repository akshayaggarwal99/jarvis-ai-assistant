/**
 * Onboarding IPC Handlers Module
 * 
 * Handles all IPC communication related to onboarding flow.
 * Extracted from main.ts to improve modularity.
 */

import { ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Logger } from '../core/logger';
import { OptimizedAnalyticsManager } from '../analytics/optimized-analytics-manager';
import { AuthService } from '../services/auth-service';
import { nodeDictionaryService } from '../services/node-dictionary';

type ActivationCallback = () => Promise<void>;
type DeactivationCallback = () => void;
type OnboardingCheckCallback = () => boolean;
type OnboardingMarkCallback = () => void;
type HotkeyCallback = () => void;

export class OnboardingIPCHandlers {
  private static instance: OnboardingIPCHandlers;
  private analyticsManager: OptimizedAnalyticsManager | null = null;
  private authService: AuthService;
  private dashboardWindow: BrowserWindow | null = null;
  private fnKeyMonitor: any = null;
  
  // Callbacks
  private activateOverlaysCallback: ActivationCallback | null = null;
  private deactivateOverlaysCallback: DeactivationCallback | null = null;
  private hasCompletedOnboardingCallback: OnboardingCheckCallback | null = null;
  private markOnboardingCompletedCallback: OnboardingMarkCallback | null = null;
  private startHotkeyCallback: HotkeyCallback | null = null;
  private stopHotkeyCallback: HotkeyCallback | null = null;
  
  private handlersRegistered = false;

  private constructor() {
    this.authService = AuthService.getInstance();
  }

  static getInstance(): OnboardingIPCHandlers {
    if (!OnboardingIPCHandlers.instance) {
      OnboardingIPCHandlers.instance = new OnboardingIPCHandlers();
    }
    return OnboardingIPCHandlers.instance;
  }

  setAnalyticsManager(manager: OptimizedAnalyticsManager): void {
    this.analyticsManager = manager;
  }

  setDashboardWindow(window: BrowserWindow | null): void {
    this.dashboardWindow = window;
  }

  setActivateOverlaysCallback(callback: ActivationCallback): void {
    this.activateOverlaysCallback = callback;
  }

  setDeactivateOverlaysCallback(callback: DeactivationCallback): void {
    this.deactivateOverlaysCallback = callback;
  }

  setOnboardingCallbacks(
    hasCompleted: OnboardingCheckCallback,
    markCompleted: OnboardingMarkCallback
  ): void {
    this.hasCompletedOnboardingCallback = hasCompleted;
    this.markOnboardingCompletedCallback = markCompleted;
  }

  setHotkeyCallbacks(start: HotkeyCallback, stop: HotkeyCallback): void {
    this.startHotkeyCallback = start;
    this.stopHotkeyCallback = stop;
  }

  stopFnKeyMonitor(): void {
    if (this.fnKeyMonitor) {
      this.fnKeyMonitor.stop();
      this.fnKeyMonitor = null;
    }
  }

  registerHandlers(): void {
    if (this.handlersRegistered) {
      Logger.warning('[OnboardingIPC] Handlers already registered');
      return;
    }

    // Complete onboarding
    ipcMain.handle('complete-onboarding', async () => {
      try {
        this.markOnboardingCompletedCallback?.();
        
        // Stop tutorial-specific Fn key monitoring
        if (this.fnKeyMonitor) {
          Logger.info('[OnboardingIPC] Stopping tutorial Fn key monitor...');
          this.fnKeyMonitor.stop();
          this.fnKeyMonitor = null;
        }
        
        // Check if user is already authenticated
        const isUserAuthenticated = this.analyticsManager?.getCurrentUserId() !== null;
        
        if (isUserAuthenticated && this.activateOverlaysCallback) {
          Logger.info('[OnboardingIPC] User authenticated - activating overlays');
          await this.activateOverlaysCallback();
        } else {
          Logger.info('[OnboardingIPC] Waiting for authentication');
        }
        
        return true;
      } catch (error) {
        Logger.error('[OnboardingIPC] Failed to complete onboarding:', error);
        return false;
      }
    });

    // Reset onboarding (for testing)
    ipcMain.handle('reset-onboarding', async () => {
      try {
        Logger.info('[OnboardingIPC] Resetting onboarding...');
        
        const configPath = path.join(os.homedir(), '.jarvis', 'config.json');
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
          Logger.info('[OnboardingIPC] Onboarding config deleted');
        }
        
        this.deactivateOverlaysCallback?.();
        
        if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
          this.dashboardWindow.reload();
        }
        
        Logger.info('[OnboardingIPC] Onboarding reset successfully');
        return true;
      } catch (error) {
        Logger.error('[OnboardingIPC] Failed to reset onboarding:', error);
        return false;
      }
    });

    // Check onboarding status
    ipcMain.handle('check-onboarding-status', async () => {
      return this.hasCompletedOnboardingCallback?.() ?? false;
    });

    // Start Fn key monitor for onboarding tutorial
    ipcMain.handle('start-fn-key-monitor', async () => {
      try {
        const { FnKeyMonitor } = await import('../input/fn-key-monitor');
        
        this.fnKeyMonitor = new FnKeyMonitor(
          () => {
            BrowserWindow.getAllWindows().forEach(window => {
              if (window && !window.isDestroyed()) {
                window.webContents.send('fn-key-down');
                window.webContents.send('fn-key-state-change', true);
              }
            });
          },
          () => {
            BrowserWindow.getAllWindows().forEach(window => {
              if (window && !window.isDestroyed()) {
                window.webContents.send('fn-key-up');
                window.webContents.send('fn-key-state-change', false);
              }
            });
          }
        );
        
        const started = this.fnKeyMonitor.start();
        Logger.info('[OnboardingIPC] Fn key monitor started:', started);
        return started;
      } catch (error) {
        Logger.error('[OnboardingIPC] Failed to start Fn key monitor:', error);
        return false;
      }
    });

    // Stop Fn key monitor
    ipcMain.handle('stop-fn-key-monitor', async () => {
      this.stopFnKeyMonitor();
      Logger.info('[OnboardingIPC] Fn key monitor stopped');
    });

    // Start full hotkey monitoring (for voice tutorial)
    ipcMain.handle('start-hotkey-monitoring', async () => {
      try {
        Logger.info('[OnboardingIPC] Starting hotkey monitoring for voice tutorial...');
        this.startHotkeyCallback?.();
        return true;
      } catch (error) {
        Logger.error('[OnboardingIPC] Failed to start hotkey monitoring:', error);
        return false;
      }
    });

    // Stop full hotkey monitoring
    ipcMain.handle('stop-hotkey-monitoring', async () => {
      try {
        Logger.info('[OnboardingIPC] Stopping hotkey monitoring...');
        this.stopHotkeyCallback?.();
        return true;
      } catch (error) {
        Logger.error('[OnboardingIPC] Failed to stop hotkey monitoring:', error);
        return false;
      }
    });

    // User logout handler
    ipcMain.handle('logout', async () => {
      Logger.info('[OnboardingIPC] Received logout request');
      try {
        this.deactivateOverlaysCallback?.();
        
        nodeDictionaryService.clearDictionary();
        this.analyticsManager?.clearState();
        this.authService.clearAuthState();
        
        Logger.success('[OnboardingIPC] Logout processed successfully');
        return true;
      } catch (error) {
        Logger.error('[OnboardingIPC] Failed to process logout:', error);
        throw error;
      }
    });

    this.handlersRegistered = true;
    Logger.info('[OnboardingIPC] All handlers registered');
  }
}
