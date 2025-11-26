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

interface NudgeConfig {
  enabled: boolean;
  frequency: 'low' | 'medium' | 'high';
  maxNudgesPerDay: number;
  snoozeTime: number;
  smartNudging: boolean;
  minTypingDuration: number;
  dismissedPermanently: boolean;
}

export class NudgeScheduler {
  private nudgeCheckTimer: NodeJS.Timeout | null = null;
  private onNudgeTriggered: () => Promise<void>;

  constructor(onNudgeTriggered: () => Promise<void>) {
    this.onNudgeTriggered = onNudgeTriggered;
  }

  shouldShowNudge(config: NudgeConfig, activity: UserActivity): boolean {
    const today = new Date().toDateString();
    
    if (activity.lastNudgeDate !== today) {
      activity.todayNudgeCount = 0;
      activity.lastNudgeDate = today;
    }
    
    const hasReachedDailyLimit = activity.todayNudgeCount >= config.maxNudgesPerDay;
    
    console.log(`🔔 [Nudge] Nudge eligibility check:
      - Nudges enabled: ${config.enabled}
      - Not dismissed permanently: ${!config.dismissedPermanently}
      - Not nudged in session: ${!activity.nudgedInCurrentSession}
      - Daily count: ${activity.todayNudgeCount}/${config.maxNudgesPerDay}
      - Reached daily limit: ${hasReachedDailyLimit}`);
    
    return config.enabled && 
           !config.dismissedPermanently && 
           !activity.nudgedInCurrentSession && 
           !hasReachedDailyLimit;
  }

  checkSmartNudge(config: NudgeConfig, activity: UserActivity, now: number, timeSinceLastJarvis: number): boolean {
    const minTypingTime = config.minTypingDuration * 1000;
    
    if (activity.typingSessionDuration < minTypingTime) {
      console.log(`🔔 [Nudge] Smart nudge: Still building up typing time (${Math.round(activity.typingSessionDuration/1000)}s < ${config.minTypingDuration}s)`);
      return false;
    }

    const timeSinceLastTyping = now - activity.lastTypingTime;
    const SMART_PAUSE_THRESHOLD = 2000;
    
    if (timeSinceLastTyping < SMART_PAUSE_THRESHOLD) {
      console.log(`🔔 [Nudge] Smart nudge: User still actively typing (${timeSinceLastTyping}ms since last keystroke)`);
      return false;
    }

    if (activity.lastPauseTime === 0) {
      activity.lastPauseTime = now;
      console.log(`🔔 [Nudge] Smart nudge: First pause detected, waiting for optimal moment...`);
      this.scheduleNudgeAfterPause(config, activity);
      return false;
    }

    const pauseDuration = now - activity.lastPauseTime;
    const OPTIMAL_PAUSE_TIME = 3000;
    
    if (pauseDuration >= OPTIMAL_PAUSE_TIME && this.shouldShowNudge(config, activity)) {
      console.log(`🔔 [Nudge] Smart nudge: Optimal pause detected (${pauseDuration}ms), showing nudge`);
      return true;
    }

    return false;
  }

  checkBasicNudge(config: NudgeConfig, activity: UserActivity, timeSinceLastJarvis: number): boolean {
    const minTypingTime = config.minTypingDuration * 1000;
    
    if (activity.typingSessionDuration < minTypingTime) {
      console.log(`🔔 [Nudge] Basic nudge: Not enough typing time (${Math.round(activity.typingSessionDuration/1000)}s < ${config.minTypingDuration}s)`);
      return false;
    }

    const adaptiveTiming = this.getAdaptiveNudgeTiming(config, activity);
    
    if (timeSinceLastJarvis > adaptiveTiming && this.shouldShowNudge(config, activity)) {
      console.log(`🔔 [Nudge] Basic nudge: Time threshold reached (${Math.round(timeSinceLastJarvis/1000)}s > ${Math.round(adaptiveTiming/1000)}s)`);
      return true;
    }

    return false;
  }

  private scheduleNudgeAfterPause(config: NudgeConfig, activity: UserActivity): void {
    if (this.nudgeCheckTimer) {
      clearTimeout(this.nudgeCheckTimer);
    }

    this.nudgeCheckTimer = setTimeout(async () => {
      const now = Date.now();
      const timeSinceLastTyping = now - activity.lastTypingTime;
      const timeSinceLastJarvis = now - activity.lastJarvisUsage;
      
      const EXTENDED_PAUSE_TIME = 5000;
      
      if (timeSinceLastTyping >= EXTENDED_PAUSE_TIME && this.shouldShowNudge(config, activity)) {
        console.log(`🔔 [Nudge] Extended pause detected (${timeSinceLastTyping}ms), showing delayed nudge`);
        await this.onNudgeTriggered();
      } else {
        console.log(`🔔 [Nudge] User resumed typing during pause, nudge cancelled`);
      }
    }, 3000);
  }

  private getAdaptiveNudgeTiming(config: NudgeConfig, activity: UserActivity): number {
    const baseTiming = {
      'low': 15 * 60 * 1000,    // 15 minutes
      'medium': 10 * 60 * 1000, // 10 minutes  
      'high': 5 * 60 * 1000     // 5 minutes
    };
    
    let timing = baseTiming[config.frequency] || baseTiming['medium'];
    
    const nudgeSuccessRate = activity.jarvisUsageCount / Math.max(1, activity.totalNudgesShown);
    console.log(`🔔 [Nudge] Nudge success rate: ${Math.round(nudgeSuccessRate * 100)}% (${activity.jarvisUsageCount} uses / ${activity.totalNudgesShown} nudges)`);
    
    if (nudgeSuccessRate > 0.7) {
      timing *= 0.8;
      console.log(`🔔 [Nudge] High success rate - decreasing timing by 20%`);
    } else if (nudgeSuccessRate < 0.3) {
      timing *= 1.5;
      console.log(`🔔 [Nudge] Low success rate - increasing timing by 50%`);
    }
    
    if (activity.totalNudgesShown > 20) {
      const experienceMultiplier = 1 + (activity.totalNudgesShown - 20) * 0.05;
      timing *= Math.min(experienceMultiplier, 2.0);
      console.log(`🔔 [Nudge] Experienced user - applying experience multiplier: ${experienceMultiplier.toFixed(2)}`);
    }
    
    return timing;
  }

  clearTimers(): void {
    if (this.nudgeCheckTimer) {
      clearTimeout(this.nudgeCheckTimer);
      this.nudgeCheckTimer = null;
    }
  }
}
