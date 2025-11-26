import * as fs from 'fs';
import path from 'path';
import { app } from 'electron';

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

export class NudgeConfigManager {
  private configPath: string;
  private activityPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'nudge-config.json');
    this.activityPath = path.join(userDataPath, 'user-activity.json');
  }

  loadConfig(): NudgeConfig {
    const defaultConfig: NudgeConfig = {
      enabled: true,
      frequency: 'medium',
      maxNudgesPerDay: 3,
      snoozeTime: 15,
      smartNudging: true,
      minTypingDuration: 120,
      dismissedPermanently: false
    };

    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const config = { ...defaultConfig, ...JSON.parse(configData) };
        console.log('🔔 [Nudge] Config loaded:', config);
        return config;
      }
    } catch (error) {
      console.error('🔔 [Nudge] Error loading config:', error);
    }

    console.log('🔔 [Nudge] Using default config');
    return defaultConfig;
  }

  loadActivity(): UserActivity {
    const defaultActivity: UserActivity = {
      lastTypingTime: 0,
      lastJarvisUsage: 0,
      typingStreakCount: 0,
      firstTypingTime: 0,
      typingSessionDuration: 0,
      lastPauseTime: 0,
      currentSessionId: '',
      nudgedInCurrentSession: false,
      todayNudgeCount: 0,
      lastNudgeDate: '',
      totalNudgesShown: 0,
      jarvisUsageCount: 0
    };

    try {
      if (fs.existsSync(this.activityPath)) {
        const activityData = fs.readFileSync(this.activityPath, 'utf8');
        const activity = { ...defaultActivity, ...JSON.parse(activityData) };
        
        const today = new Date().toDateString();
        if (activity.lastNudgeDate !== today) {
          activity.todayNudgeCount = 0;
          activity.lastNudgeDate = today;
        }
        
        console.log('🔔 [Nudge] Activity loaded');
        return activity;
      }
    } catch (error) {
      console.error('🔔 [Nudge] Error loading activity:', error);
    }

    console.log('🔔 [Nudge] Using default activity');
    return defaultActivity;
  }

  saveConfig(config: NudgeConfig): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      console.log('🔔 [Nudge] Config saved');
    } catch (error) {
      console.error('🔔 [Nudge] Error saving config:', error);
    }
  }

  saveActivity(activity: UserActivity): void {
    try {
      fs.writeFileSync(this.activityPath, JSON.stringify(activity, null, 2));
    } catch (error) {
      console.error('🔔 [Nudge] Error saving activity:', error);
    }
  }

  updateConfig(config: NudgeConfig, newConfig: Partial<NudgeConfig>): NudgeConfig {
    const updatedConfig = { ...config, ...newConfig };
    this.saveConfig(updatedConfig);
    console.log('🔔 [Nudge] Config updated:', newConfig);
    return updatedConfig;
  }

  resetDailyCount(activity: UserActivity): UserActivity {
    const today = new Date().toDateString();
    activity.todayNudgeCount = 0;
    activity.lastNudgeDate = today;
    this.saveActivity(activity);
    console.log('🔔 [Nudge] Daily nudge count reset');
    return activity;
  }

  recordJarvisUsage(activity: UserActivity): UserActivity {
    const now = Date.now();
    activity.lastJarvisUsage = now;
    activity.jarvisUsageCount++;
    
    if (activity.nudgedInCurrentSession) {
      console.log('🔔 [Nudge] Jarvis used after nudge - success!');
    }
    
    console.log(`🔔 [Nudge] Jarvis usage recorded (total: ${activity.jarvisUsageCount})`);
    this.saveActivity(activity);
    return activity;
  }

  recordTypingActivity(activity: UserActivity): UserActivity {
    const now = Date.now();
    activity.lastTypingTime = now;
    
    const timeSinceLastActivity = now - activity.lastTypingTime;
    if (timeSinceLastActivity > 5 * 60 * 1000) {
      console.log('🔔 [Nudge] New typing session detected after break');
      activity.firstTypingTime = now;
      activity.typingSessionDuration = 0;
      activity.typingStreakCount = 0;
      activity.nudgedInCurrentSession = false;
    }
    
    activity.typingStreakCount++;
    if (activity.firstTypingTime === 0) {
      activity.firstTypingTime = now;
    }
    activity.typingSessionDuration = now - activity.firstTypingTime;
    
    this.saveActivity(activity);
    return activity;
  }

  snooze(activity: UserActivity, snoozeTime: number): UserActivity {
    const snoozeUntil = Date.now() + (snoozeTime * 60 * 1000);
    activity.lastJarvisUsage = snoozeUntil;
    console.log(`🔔 [Nudge] Snoozed for ${snoozeTime} minutes`);
    this.saveActivity(activity);
    return activity;
  }

  debugStatus(config: NudgeConfig, activity: UserActivity): void {
    console.log('\n🔔 [Nudge] === DEBUG STATUS ===');
    console.log('  📋 Configuration:');
    console.log(`    - Enabled: ${config.enabled}`);
    console.log(`    - Dismissed permanently: ${config.dismissedPermanently}`);
    console.log(`    - Frequency: ${config.frequency}`);
    console.log(`    - Max nudges per day: ${config.maxNudgesPerDay}`);
    console.log(`    - Smart nudging: ${config.smartNudging}`);
    console.log(`    - Min typing duration: ${config.minTypingDuration}s`);
    
    console.log('  📊 Activity:');
    console.log(`    - Today's nudge count: ${activity.todayNudgeCount}`);
    console.log(`    - Total nudges shown: ${activity.totalNudgesShown}`);
    console.log(`    - Jarvis usage count: ${activity.jarvisUsageCount}`);
    console.log(`    - Nudged in current session: ${activity.nudgedInCurrentSession}`);
    console.log(`    - Current session ID: ${activity.currentSessionId}`);
    console.log(`    - Typing session duration: ${Math.round(activity.typingSessionDuration/1000)}s`);
    
    const now = Date.now();
    const timeSinceLastJarvis = now - activity.lastJarvisUsage;
    const timeSinceLastTyping = now - activity.lastTypingTime;
    console.log(`    - Time since last Jarvis: ${Math.round(timeSinceLastJarvis/1000)}s`);
    console.log(`    - Time since last typing: ${Math.round(timeSinceLastTyping/1000)}s`);
    
    console.log('  📁 Files:');
    console.log(`    - Config path: ${this.configPath}`);
    console.log(`    - Activity path: ${this.activityPath}`);
    
    if (fs.existsSync(this.configPath)) {
      try {
        const fileContent = fs.readFileSync(this.configPath, 'utf8');
        const fileConfig = JSON.parse(fileContent);
        
        if (fileConfig.enabled !== config.enabled) {
          console.log('  ⚠️  CONFIG MISMATCH! File says enabled:', fileConfig.enabled, 'but service has:', config.enabled);
        }
      } catch (error) {
        console.log('  ❌ Error reading config file:', error.message);
      }
    } else {
      console.log('  📄 Config file does not exist');
    }
  }
}
