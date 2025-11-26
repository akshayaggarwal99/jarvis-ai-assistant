/**
 * Nudge configuration and activity storage management
 */
import { app } from 'electron';
import path from 'path';
import * as fs from 'fs';

export interface NudgeConfig {
  enabled: boolean;
  frequency: 'low' | 'medium' | 'high';
  maxNudgesPerDay: number;
  snoozeTime: number; // minutes
  smartNudging: boolean;
  minTypingDuration: number; // seconds
  dismissedPermanently: boolean;
}

export interface UserActivity {
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

const DEFAULT_CONFIG: NudgeConfig = {
  enabled: true,
  frequency: 'low',
  maxNudgesPerDay: 5,
  snoozeTime: 60,
  smartNudging: true,
  minTypingDuration: 120,
  dismissedPermanently: false
};

const DEFAULT_ACTIVITY: UserActivity = {
  lastTypingTime: 0,
  lastJarvisUsage: Date.now(),
  typingStreakCount: 0,
  firstTypingTime: 0,
  typingSessionDuration: 0,
  lastPauseTime: 0,
  currentSessionId: '',
  nudgedInCurrentSession: false,
  todayNudgeCount: 0,
  lastNudgeDate: new Date().toDateString(),
  totalNudgesShown: 0,
  jarvisUsageCount: 0
};

export class NudgeStorage {
  private configPath: string;
  private activityPath: string;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'nudge-config.json');
    this.activityPath = path.join(app.getPath('userData'), 'user-activity.json');
  }

  getConfigPath(): string {
    return this.configPath;
  }

  loadConfig(): NudgeConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[Nudge] Failed to load config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(config: NudgeConfig): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('[Nudge] Failed to save config:', error);
    }
  }

  loadActivity(): UserActivity {
    try {
      if (fs.existsSync(this.activityPath)) {
        const data = fs.readFileSync(this.activityPath, 'utf8');
        const activity = JSON.parse(data);
        // Reset daily count if it's a new day
        const today = new Date().toDateString();
        if (activity.lastNudgeDate !== today) {
          activity.todayNudgeCount = 0;
          activity.lastNudgeDate = today;
        }
        return activity;
      }
    } catch (error) {
      console.error('[Nudge] Failed to load activity:', error);
    }
    return { ...DEFAULT_ACTIVITY };
  }

  saveActivity(activity: UserActivity): void {
    try {
      fs.writeFileSync(this.activityPath, JSON.stringify(activity, null, 2));
    } catch (error) {
      console.error('[Nudge] Failed to save activity:', error);
    }
  }

  configExists(): boolean {
    return fs.existsSync(this.configPath);
  }
}
