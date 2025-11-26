import { TypingDetector } from './typing-detector';
import { NudgeScheduler } from './nudge-scheduler';
import { NudgeWindow } from './nudge-window';
import { NudgeConfigManager } from './nudge-config-manager';

interface NudgeConfig {
  enabled: boolean;
  frequency: 'low' | 'medium' | 'high';
  maxNudgesPerDay: number;
  snoozeTime: number;
  smartNudging: boolean;
  minTypingDuration: number;
  dismissedPermanently: boolean;
}

interface UserActivity {
  lastTypingTime: number;
  lastJarvisUsage: number;
  typingStreakCount: number;
  firstTypingTime: number;
  typingSessionDuration: number;
  lastPauseTime: number;
  currentSessionId: string;
  nudgedInCurrentSession: boolean;
  todayNudgeCount: number;
  lastNudgeDate: string;
  totalNudgesShown: number;
  jarvisUsageCount: number;
}

export class UserNudgeService {
  private static instance: UserNudgeService;
  private config: NudgeConfig;
  private activity: UserActivity;
  
  private typingDetector: TypingDetector;
  private scheduler: NudgeScheduler;
  private window: NudgeWindow;
  private configManager: NudgeConfigManager;

  private constructor() {
    this.configManager = new NudgeConfigManager();
    this.config = this.configManager.loadConfig();
    this.activity = this.configManager.loadActivity();
    
    this.typingDetector = new TypingDetector(() => this.onTypingDetected());
    this.scheduler = new NudgeScheduler(() => this.showDelightfulNudge());
    this.window = new NudgeWindow();
    
    this.startTypingDetection();
  }

  static getInstance(): UserNudgeService {
    if (!UserNudgeService.instance) {
      UserNudgeService.instance = new UserNudgeService();
    }
    return UserNudgeService.instance;
  }

  private startTypingDetection(): void {
    const success = this.typingDetector.start(this.config);
    if (!success) {
      console.log('🔔 [Nudge] Failed to start typing detection');
    }
  }

  private onTypingDetected(): void {
    if (!this.config.enabled || this.config.dismissedPermanently) {
      console.log('🔔 [Nudge] Typing detected but nudges are DISABLED - ignoring');
      return;
    }

    if (!this.typingDetector.isRunning()) {
      console.log('🔔 [Nudge] Typing detected but service is not running - ignoring');
      return;
    }

    const now = Date.now();
    const timeSinceLastJarvis = now - this.activity.lastJarvisUsage;
    
    this.activity = this.typingDetector.updateActivity(this.activity);
    
    if (!this.activity.nudgedInCurrentSession) {
      let shouldNudge = false;
      
      if (this.config.smartNudging) {
        shouldNudge = this.scheduler.checkSmartNudge(this.config, this.activity, now, timeSinceLastJarvis);
      } else {
        shouldNudge = this.scheduler.checkBasicNudge(this.config, this.activity, timeSinceLastJarvis);
      }
      
      if (shouldNudge) {
        this.showDelightfulNudge();
      }
    } else {
      console.log(`🔔 [Nudge] Already nudged in this session - respecting user's choice`);
    }

    this.configManager.saveActivity(this.activity);
  }

  private async showDelightfulNudge(): Promise<void> {
    if (!this.scheduler.shouldShowNudge(this.config, this.activity)) {
      console.log('🔔 [Nudge] Nudge conditions not met, skipping');
      return;
    }

    if (this.window.isShowing()) {
      console.log('🔔 [Nudge] Nudge already showing, skipping');
      return;
    }

    console.log('🔔 [Nudge] 🎉 Showing delightful nudge!');
    
    this.activity.nudgedInCurrentSession = true;
    this.activity.totalNudgesShown++;
    this.activity.todayNudgeCount++;
    
    try {
      await this.window.createWindow();
      console.log('🔔 [Nudge] ✨ Nudge displayed successfully');
    } catch (error) {
      console.error('🔔 [Nudge] Error creating nudge window:', error);
    }
    
    this.configManager.saveActivity(this.activity);
  }

  // Public API methods
  dismissNudge(): void {
    console.log('🔔 [Nudge] Nudge dismissed (user will try Jarvis)');
    this.window.hide();
    
    setTimeout(() => {
      this.window.destroy();
    }, 100);
  }

  dismissNudgeExplicitly(): void {
    console.log('🔔 [Nudge] Nudge explicitly dismissed');
    this.window.hide();
    
    this.activity.lastJarvisUsage = Date.now();
    this.configManager.saveActivity(this.activity);
    
    setTimeout(() => {
      this.window.destroy();
    }, 100);
  }

  resetNudgeCounter(): void {
    console.log('🔔 [Nudge] Resetting nudge counter');
    this.activity = this.configManager.resetDailyCount(this.activity);
  }

  recordJarvisUsage(): void {
    this.activity = this.configManager.recordJarvisUsage(this.activity);
  }

  recordTypingActivity(): void {
    this.activity = this.configManager.recordTypingActivity(this.activity);
  }

  getConfig(): NudgeConfig {
    return { ...this.config };
  }

  getActivityStatus(): any {
    return {
      todayNudgeCount: this.activity.todayNudgeCount,
      totalNudgesShown: this.activity.totalNudgesShown,
      jarvisUsageCount: this.activity.jarvisUsageCount,
      typingSessionDuration: Math.round(this.activity.typingSessionDuration / 1000),
      nudgedInCurrentSession: this.activity.nudgedInCurrentSession
    };
  }

  updateConfig(newConfig: Partial<NudgeConfig>): void {
    this.config = this.configManager.updateConfig(this.config, newConfig);
    
    if (newConfig.enabled !== undefined) {
      if (newConfig.enabled && !this.typingDetector.isRunning()) {
        this.startTypingDetection();
      } else if (!newConfig.enabled && this.typingDetector.isRunning()) {
        this.typingDetector.stop();
        this.window.hide();
      }
    }
  }

  snooze(): void {
    console.log(`🔔 [Nudge] Snoozing for ${this.config.snoozeTime} minutes`);
    this.window.hide();
    this.activity = this.configManager.snooze(this.activity, this.config.snoozeTime);
    
    setTimeout(() => {
      this.window.destroy();
    }, 100);
  }

  getNudgeSettings(): any {
    return {
      enabled: this.config.enabled,
      frequency: this.config.frequency,
      maxNudgesPerDay: this.config.maxNudgesPerDay,
      snoozeTime: this.config.snoozeTime,
      smartNudging: this.config.smartNudging,
      minTypingDuration: this.config.minTypingDuration,
      dismissedPermanently: this.config.dismissedPermanently
    };
  }

  updateNudgeSettings(settings: Partial<NudgeConfig>): void {
    console.log('🔔 [Nudge] Updating nudge settings:', settings);
    this.updateConfig(settings);
    console.log('🔔 [Nudge] Settings updated successfully');
  }

  debugStatus(): void {
    this.configManager.debugStatus(this.config, this.activity);
  }

  forceDisable(): void {
    console.log('🚫 [Nudge] FORCE DISABLING nudges...');
    
    this.config.enabled = false;
    this.config.dismissedPermanently = false;
    
    this.configManager.saveConfig(this.config);
    this.typingDetector.stop();
    this.window.hide();
    this.scheduler.clearTimers();
    
    console.log('✅ [Nudge] Nudges force-disabled successfully');
    this.debugStatus();
  }

  destroy(): void {
    this.typingDetector.stop();
    this.scheduler.clearTimers();
    this.window.destroy();
    console.log('🔔 [Nudge] Service destroyed');
  }
}
