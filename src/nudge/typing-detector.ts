import { NativeTypingService } from '../services/native-typing-service';

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

export class TypingDetector {
  private nativeTypingService: NativeTypingService | null = null;
  private onTypingCallback: () => void;

  constructor(onTypingCallback: () => void) {
    this.onTypingCallback = onTypingCallback;
  }

  start(config: NudgeConfig): boolean {
    if (!config.enabled || config.dismissedPermanently) {
      console.log('🔔 [Nudge] Typing detection NOT started - nudges disabled');
      return false;
    }

    if (this.nativeTypingService) {
      console.log('🔔 [Nudge] Typing detection already running');
      return true;
    }

    console.log('🔔 [Nudge] Starting native typing detection...');
    
    this.nativeTypingService = new NativeTypingService(() => {
      this.onTypingCallback();
    });

    const success = this.nativeTypingService.start();
    if (!success) {
      console.error('🔔 [Nudge] Failed to start native typing detection - nudges disabled');
      this.nativeTypingService = null;
      return false;
    }

    console.log('🔔 [Nudge] Native typing detection started successfully');
    return true;
  }

  stop(): void {
    if (this.nativeTypingService) {
      this.nativeTypingService.stop();
      this.nativeTypingService = null;
      console.log('🔔 [Nudge] Typing detection stopped');
    }
  }

  updateActivity(activity: UserActivity): UserActivity {
    const now = Date.now();
    const sessionId = this.generateSessionId();
    const isNewSession = sessionId !== activity.currentSessionId;
    
    if (isNewSession) {
      console.log(`🔔 [Nudge] New session detected: ${sessionId}`);
      activity.currentSessionId = sessionId;
      activity.nudgedInCurrentSession = false;
      activity.firstTypingTime = now;
      activity.typingStreakCount = 0;
    }
    
    activity.lastTypingTime = now;
    activity.typingStreakCount++;
    
    if (activity.firstTypingTime === 0) {
      activity.firstTypingTime = now;
    }
    activity.typingSessionDuration = now - activity.firstTypingTime;

    const timeSinceLastJarvis = now - activity.lastJarvisUsage;
    console.log(`🔔 [Nudge] Typing detected! Session: ${Math.round(activity.typingSessionDuration/1000)}s, Streak: ${activity.typingStreakCount}, Since Jarvis: ${Math.round(timeSinceLastJarvis/1000)}s, Nudged this session: ${activity.nudgedInCurrentSession}`);

    return activity;
  }

  private generateSessionId(): string {
    const now = new Date();
    const hourMinutes = now.getHours() * 100 + now.getMinutes();
    const sessionWindow = Math.floor(hourMinutes / 5) * 5;
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${sessionWindow}`;
  }

  isRunning(): boolean {
    return this.nativeTypingService !== null;
  }
}
