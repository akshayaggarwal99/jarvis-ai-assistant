/**
 * PowerManagementService - Handles macOS sleep/wake events to prevent system hanging
 * 
 * This service prevents the critical issue where Jarvis causes MacBooks to hang
 * after sleep/wake cycles by properly managing system event listeners and 
 * cleaning up resources during sleep transitions.
 */

import { powerMonitor } from 'electron';

// Simple logger interface for this service
const Logger = {
  info: (message: string, ...args: any[]) => console.log(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args)
};

export class PowerManagementService {
  private static instance: PowerManagementService;
  private isSystemSleeping = false;
  private activeServices: Set<string> = new Set();
  private suspendedServices: Map<string, any> = new Map();

  private constructor() {
    this.setupPowerEventListeners();
  }

  public static getInstance(): PowerManagementService {
    if (!PowerManagementService.instance) {
      PowerManagementService.instance = new PowerManagementService();
    }
    return PowerManagementService.instance;
  }

  private setupPowerEventListeners(): void {
    Logger.info('🔋 [PowerManagement] Setting up power event listeners...');

    // System is about to sleep
    powerMonitor.on('suspend', () => {
      Logger.info('😴 [PowerManagement] System entering sleep mode - suspending services');
      this.handleSuspend();
    });

    // System woke up from sleep
    powerMonitor.on('resume', () => {
      Logger.info('🌅 [PowerManagement] System resuming from sleep - restoring services');
      this.handleResume();
    });

    // System is shutting down
    powerMonitor.on('shutdown', () => {
      Logger.info('🔌 [PowerManagement] System shutting down - cleaning up resources');
      this.handleShutdown();
    });

    // AC power connected/disconnected
    powerMonitor.on('on-ac', () => {
      Logger.info('🔌 [PowerManagement] AC power connected');
    });

    powerMonitor.on('on-battery', () => {
      Logger.info('🔋 [PowerManagement] Running on battery power');
    });

    Logger.info('✅ [PowerManagement] Power event listeners registered');
  }

  private handleSuspend(): void {
    this.isSystemSleeping = true;

    // Suspend critical services that could cause hanging
    this.suspendService('audio-monitoring');
    this.suspendService('key-monitoring');
    this.suspendService('screen-capture');
    this.suspendService('native-modules');
    this.suspendService('streaming-connections');
    this.suspendService('background-processes');

    Logger.info('🛌 [PowerManagement] All services suspended for sleep');
  }

  private handleResume(): void {
    // Add delay to let system stabilize before resuming services
    setTimeout(() => {
      this.isSystemSleeping = false;

      // Resume services in reverse order
      this.resumeService('background-processes');
      this.resumeService('streaming-connections');
      this.resumeService('native-modules');
      this.resumeService('screen-capture');
      this.resumeService('key-monitoring');
      this.resumeService('audio-monitoring');

      Logger.info('🌞 [PowerManagement] All services resumed after sleep');
    }, 2000); // 2 second delay for system stabilization
  }

  private handleShutdown(): void {
    Logger.info('🔄 [PowerManagement] Performing clean shutdown...');
    
    // Force cleanup all services
    this.activeServices.forEach(service => {
      this.suspendService(service);
    });

    // Clear all maps
    this.activeServices.clear();
    this.suspendedServices.clear();

    Logger.info('✅ [PowerManagement] Clean shutdown completed');
  }

  public registerService(serviceName: string, serviceInstance?: any): void {
    this.activeServices.add(serviceName);
    Logger.info(`📝 [PowerManagement] Registered service: ${serviceName}`);
  }

  public unregisterService(serviceName: string): void {
    this.activeServices.delete(serviceName);
    this.suspendedServices.delete(serviceName);
    Logger.info(`🗑️ [PowerManagement] Unregistered service: ${serviceName}`);
  }

  private suspendService(serviceName: string): void {
    if (!this.activeServices.has(serviceName)) return;

    try {
      switch (serviceName) {
        case 'audio-monitoring':
          this.suspendAudioMonitoring();
          break;
        case 'key-monitoring':
          this.suspendKeyMonitoring();
          break;
        case 'screen-capture':
          this.suspendScreenCapture();
          break;
        case 'native-modules':
          this.suspendNativeModules();
          break;
        case 'streaming-connections':
          this.suspendStreamingConnections();
          break;
        case 'background-processes':
          this.suspendBackgroundProcesses();
          break;
      }

      Logger.info(`⏸️ [PowerManagement] Suspended: ${serviceName}`);
    } catch (error) {
      Logger.error(`❌ [PowerManagement] Failed to suspend ${serviceName}:`, error);
    }
  }

  private resumeService(serviceName: string): void {
    if (!this.activeServices.has(serviceName)) return;

    try {
      switch (serviceName) {
        case 'audio-monitoring':
          this.resumeAudioMonitoring();
          break;
        case 'key-monitoring':
          this.resumeKeyMonitoring();
          break;
        case 'screen-capture':
          this.resumeScreenCapture();
          break;
        case 'native-modules':
          this.resumeNativeModules();
          break;
        case 'streaming-connections':
          this.resumeStreamingConnections();
          break;
        case 'background-processes':
          this.resumeBackgroundProcesses();
          break;
      }

      Logger.info(`▶️ [PowerManagement] Resumed: ${serviceName}`);
    } catch (error) {
      Logger.error(`❌ [PowerManagement] Failed to resume ${serviceName}:`, error);
    }
  }

  // Service-specific suspend implementations
  private suspendAudioMonitoring(): void {
    // Stop all audio streams and close audio contexts
    if (typeof window !== 'undefined' && window.AudioContext) {
      const audioContexts = document.querySelectorAll('audio');
      audioContexts.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    }
  }

  private suspendKeyMonitoring(): void {
    // Signal to native key monitor to suspend
    try {
      const { universalKeyMonitor } = require('universal_key_monitor');
      if (universalKeyMonitor && universalKeyMonitor.stop) {
        universalKeyMonitor.stop();
      }
    } catch (error) {
      // Silent fail - module might not be loaded
    }
  }

  private suspendScreenCapture(): void {
    // Clear any active screen capture intervals
    if (global.screenCaptureInterval) {
      clearInterval(global.screenCaptureInterval);
      global.screenCaptureInterval = null;
    }
  }

  private suspendNativeModules(): void {
    // Gracefully close native module connections
    try {
      const { audioCapture } = require('audio_capture');
      if (audioCapture && audioCapture.stop) {
        audioCapture.stop();
      }
    } catch (error) {
      // Silent fail
    }
  }

  private suspendStreamingConnections(): void {
    // Close WebSocket connections and HTTP streams
    if (global.deepgramConnection) {
      try {
        global.deepgramConnection.close();
        global.deepgramConnection = null;
      } catch (error) {
        // Silent fail
      }
    }
  }

  private suspendBackgroundProcesses(): void {
    // Clear all active intervals and timeouts
    if (global.backgroundIntervals) {
      global.backgroundIntervals.forEach(interval => clearInterval(interval));
      global.backgroundIntervals = [];
    }
  }

  // Service-specific resume implementations
  private resumeAudioMonitoring(): void {
    // Audio will be re-initialized when needed
    Logger.info('🔊 [PowerManagement] Audio monitoring ready for resume');
  }

  private resumeKeyMonitoring(): void {
    // Key monitoring will be re-initialized by the hotkey service
    Logger.info('⌨️ [PowerManagement] Key monitoring ready for resume');
  }

  private resumeScreenCapture(): void {
    // Screen capture will be re-initialized when needed
    Logger.info('📸 [PowerManagement] Screen capture ready for resume');
  }

  private resumeNativeModules(): void {
    // Native modules will be re-initialized when accessed
    Logger.info('🔧 [PowerManagement] Native modules ready for resume');
  }

  private resumeStreamingConnections(): void {
    // Streaming connections will be re-established when needed
    Logger.info('🌐 [PowerManagement] Streaming connections ready for resume');
  }

  private resumeBackgroundProcesses(): void {
    // Background processes will be restarted by their respective services
    Logger.info('⚙️ [PowerManagement] Background processes ready for resume');
  }

  public isSystemInSleepMode(): boolean {
    return this.isSystemSleeping;
  }

  public getActiveServices(): string[] {
    return Array.from(this.activeServices);
  }

  public getSuspendedServices(): string[] {
    return Array.from(this.suspendedServices.keys());
  }
}
