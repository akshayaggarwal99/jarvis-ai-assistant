import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import { NativeTypingService } from './native-typing-service';
import { getNudgeHTML, getRandomMessage } from './nudge-templates';
import { NudgeStorage, NudgeConfig, UserActivity } from './nudge-storage';

export class UserNudgeService {
  private static instance: UserNudgeService;
  private storage: NudgeStorage;
  private config: NudgeConfig;
  private activity: UserActivity;
  private nudgeWindow: BrowserWindow | null = null;
  private nativeTypingService: NativeTypingService | null = null;
  private nudgeCheckTimer: NodeJS.Timeout | null = null;
  private isNudgeShowing = false;

  static getInstance(): UserNudgeService {
    if (!UserNudgeService.instance) {
      UserNudgeService.instance = new UserNudgeService();
    }
    return UserNudgeService.instance;
  }

  private constructor() {
    this.storage = new NudgeStorage();
    this.config = this.storage.loadConfig();
    this.activity = this.storage.loadActivity();
    
    // DEBUG: Log configuration status
    console.log('🔔 [Nudge] Constructor - Current config:', this.config);
    console.log('🔔 [Nudge] Constructor - Config file path:', this.storage.getConfigPath());
    console.log('🔔 [Nudge] Constructor - File exists:', this.storage.configExists());
    
    // Only start typing detection if nudges are enabled
    if (this.config.enabled && !this.config.dismissedPermanently) {
      this.startTypingDetection();
      console.log('🔔 [Nudge] Service initialized with typing detection enabled');
    } else {
      console.log('🔔 [Nudge] Service initialized with typing detection DISABLED (nudges off)');
    }
  }

  private saveConfig(): void {
    this.storage.saveConfig(this.config);
  }

  private saveActivity(): void {
    this.storage.saveActivity(this.activity);
  }
  }

  /**
   * Start monitoring for typing activity using native approach
   */
  private startTypingDetection(): void {
    if (!this.config.enabled || this.config.dismissedPermanently) {
      console.log('🔔 [Nudge] Typing detection NOT started - nudges disabled');
      return;
    }

    // Don't start if already running
    if (this.nativeTypingService) {
      console.log('🔔 [Nudge] Typing detection already running');
      return;
    }

    console.log('🔔 [Nudge] Starting native typing detection...');
    
    // Initialize native typing service
    this.nativeTypingService = new NativeTypingService(() => {
      this.onTypingDetected();
    });

    // Start the native typing monitor
    const success = this.nativeTypingService.start();
    if (!success) {
      console.error('🔔 [Nudge] Failed to start native typing detection - nudges disabled');
      this.nativeTypingService = null;
    } else {
      console.log('🔔 [Nudge] Native typing detection started successfully');
    }
  }

  /**
   * Handle typing activity detected by native service
   */
  private onTypingDetected(): void {
    // Exit early if nudges are disabled or dismissed permanently
    if (!this.config.enabled || this.config.dismissedPermanently) {
      console.log('🔔 [Nudge] Typing detected but nudges are DISABLED - ignoring');
      return;
    }

    // Exit early if native typing service is not supposed to be running
    if (!this.nativeTypingService) {
      console.log('🔔 [Nudge] Typing detected but service is not running - ignoring');
      return;
    }

    const now = Date.now();
    const timeSinceLastJarvis = now - this.activity.lastJarvisUsage;
    const timeSinceLastTyping = now - this.activity.lastTypingTime;
    
    // Generate session ID
    const sessionId = this.generateSessionId();
    const isNewSession = sessionId !== this.activity.currentSessionId;
    
    if (isNewSession) {
      console.log(`🔔 [Nudge] New session detected: ${sessionId}`);
      this.activity.currentSessionId = sessionId;
      this.activity.nudgedInCurrentSession = false; // Reset nudge flag for new session
      this.activity.firstTypingTime = now;
      this.activity.typingStreakCount = 0;
    }
    
    // Update activity tracking
    this.activity.lastTypingTime = now;
    this.activity.typingStreakCount++;
    
    // Calculate session duration (ensure firstTypingTime is set)
    if (this.activity.firstTypingTime === 0) {
      this.activity.firstTypingTime = now;
    }
    this.activity.typingSessionDuration = now - this.activity.firstTypingTime;

    console.log(`🔔 [Nudge] Typing detected! Session: ${Math.round(this.activity.typingSessionDuration/1000)}s, Streak: ${this.activity.typingStreakCount}, Since Jarvis: ${Math.round(timeSinceLastJarvis/1000)}s, Nudged this session: ${this.activity.nudgedInCurrentSession}`);

    // Smart nudging logic - but only if NOT already nudged in this session
    if (!this.activity.nudgedInCurrentSession) {
      if (this.config.smartNudging) {
        this.checkSmartNudge(now, timeSinceLastJarvis);
      } else {
        this.checkBasicNudge(now, timeSinceLastJarvis);
      }
    } else {
      console.log(`🔔 [Nudge] Already nudged in this session - respecting user's choice`);
    }

    this.saveActivity();
  }

  /**
   * Smart nudging: Adaptive timing based on user experience
   */
  private checkSmartNudge(now: number, timeSinceLastJarvis: number): void {
    // Double-check nudges are still enabled before proceeding
    if (!this.config.enabled || this.config.dismissedPermanently) {
      return;
    }

    const sessionDurationSeconds = this.activity.typingSessionDuration / 1000;
    const adaptiveThreshold = this.getAdaptiveNudgeTiming();
    
    console.log(`🔔 [Nudge] Adaptive threshold: ${adaptiveThreshold}s (based on ${this.activity.totalNudgesShown} total nudges, ${this.activity.jarvisUsageCount} uses)`);
    
    // For new users (first few nudges), use immediate timing on any sustained typing
    // For experienced users, use reasonable session time (30s max)
    const minSessionTime = this.activity.totalNudgesShown < 3 ? 10 : Math.min(45, this.config.minTypingDuration);
    const minTypingStreak = this.activity.totalNudgesShown < 3 ? 5 : 8; // More typing required before nudging
    
    if (sessionDurationSeconds >= minSessionTime && 
        this.activity.typingStreakCount >= minTypingStreak &&
        timeSinceLastJarvis > adaptiveThreshold * 1000 && 
        this.activity.todayNudgeCount < this.config.maxNudgesPerDay && 
        !this.isNudgeShowing) {
      
      // For very new users (first 3 nudges), show immediately without waiting for pause
      if (this.activity.totalNudgesShown < 3) {
        console.log(`🔔 [Nudge] *** SHOWING EARLY NUDGE #${this.activity.totalNudgesShown + 1} FOR NEW USER ***`);
        this.showDelightfulNudge();
      } else {
        // Experienced users: wait for natural pause
        this.scheduleNudgeAfterPause();
      }
    } else {
      console.log(`🔔 [Nudge] Smart nudge conditions not met - session: ${Math.round(sessionDurationSeconds)}s/${minSessionTime}s, streak: ${this.activity.typingStreakCount}/${minTypingStreak}, since Jarvis: ${Math.round(timeSinceLastJarvis/1000)}s/${adaptiveThreshold}s, count: ${this.activity.todayNudgeCount}/${this.config.maxNudgesPerDay}`);
    }
  }

  /**
   * Basic nudging: Original immediate logic for users who prefer it
   */
  private checkBasicNudge(now: number, timeSinceLastJarvis: number): void {
    // Double-check nudges are still enabled before proceeding
    if (!this.config.enabled || this.config.dismissedPermanently) {
      return;
    }

    const sessionDurationSeconds = this.activity.typingSessionDuration / 1000;
    
    if (sessionDurationSeconds >= 15 && // Require at least 15 seconds of active typing
        timeSinceLastJarvis > 60 * 1000 && // 1 minute since last Jarvis use
        this.activity.todayNudgeCount < this.config.maxNudgesPerDay && 
        !this.isNudgeShowing &&
        this.activity.typingStreakCount >= 5) { // Require meaningful typing activity
      
      const shouldNudge = this.shouldShowNudge();
      if (shouldNudge) {
        console.log('🔔 [Nudge] *** SHOWING BASIC NUDGE ***');
        this.showDelightfulNudge();
      }
    } else {
      console.log(`🔔 [Nudge] Basic nudge conditions not met - session: ${Math.round(sessionDurationSeconds)}s/15s, streak: ${this.activity.typingStreakCount}/5, since Jarvis: ${Math.round(timeSinceLastJarvis/1000)}s/60s`);
    }
  }

  /**
   * Schedule nudge to show after user pauses typing
   */
  private scheduleNudgeAfterPause(): void {
    // Clear any existing pause timer
    if (this.nudgeCheckTimer) {
      clearTimeout(this.nudgeCheckTimer);
    }
    
    // Wait for 4-second pause before showing nudge (increased from 3s for better UX)
    this.nudgeCheckTimer = setTimeout(() => {
      // Check if nudges are still enabled before showing
      if (!this.config.enabled || this.config.dismissedPermanently) {
        console.log('🔔 [Nudge] Pause nudge cancelled - nudges disabled');
        return;
      }

      const now = Date.now();
      const timeSinceLastTyping = now - this.activity.lastTypingTime;
      
      // Only show if user is still in a pause (hasn't resumed typing) and conditions are still met
      if (timeSinceLastTyping >= 4000 && 
          !this.isNudgeShowing && 
          !this.activity.nudgedInCurrentSession &&
          this.activity.todayNudgeCount < this.config.maxNudgesPerDay) {
        console.log('🔔 [Nudge] *** SHOWING SMART NUDGE AFTER NATURAL PAUSE ***');
        this.showDelightfulNudge();
      } else {
        console.log(`🔔 [Nudge] Pause nudge cancelled - typing resumed or conditions changed`);
      }
    }, 4000);
  }

  /**
   * Stop typing detection
   */
  private stopTypingDetection(): void {
    if (this.nativeTypingService) {
      console.log('🔔 [Nudge] Stopping native typing detection - freeing resources');
      this.nativeTypingService.stop();
      this.nativeTypingService = null;
    } else {
      console.log('🔔 [Nudge] Typing detection already stopped or not started');
    }
  }

  /**
   * Determine if we should show a nudge based on current activity
   */
  private shouldShowNudge(): boolean {
    const frequencyThresholds = {
      low: 5,     // Show after sustained typing (5+ events)
      medium: 3,  // Show after moderate typing (3+ events)  
      high: 2     // Show after minimal typing (2+ events)
    };

    const threshold = frequencyThresholds[this.config.frequency];
    const shouldShow = this.activity.typingStreakCount >= threshold;
    console.log(`🔔 [Nudge] Should show? ${shouldShow} (streak: ${this.activity.typingStreakCount}, threshold: ${threshold})`);
    return shouldShow;
  }

  /**
   * Get adaptive timing for nudges based on user experience
   */
  private getAdaptiveNudgeTiming(): number {
    const totalNudges = this.activity.totalNudgesShown;
    const usageRatio = this.activity.jarvisUsageCount / Math.max(1, totalNudges);
    
    // Adaptive timing schedule (in seconds)
    const schedule = [
      5,   // 1st nudge: 5 seconds (very early to introduce feature)
      10,  // 2nd nudge: 10 seconds 
      15,  // 3rd nudge: 15 seconds
      20,  // 4th nudge: 20 seconds
      30,  // 5th nudge: 30 seconds
      45,  // 6th nudge: 45 seconds
      60,  // 7th nudge: 1 minute
      90,  // 8th nudge: 1.5 minutes
      120, // 9th+ nudge: 2 minutes (mature user)
    ];
    
    // If user has good adoption (>30% usage rate), be less aggressive
    if (usageRatio > 0.3 && totalNudges > 3) {
      const baseTime = schedule[Math.min(totalNudges, schedule.length - 1)];
      return baseTime * 1.5; // 50% longer timing for responsive users
    }
    
    // If user never uses Jarvis after many nudges, back off significantly
    if (usageRatio < 0.1 && totalNudges > 5) {
      return 300; // 5 minutes - very conservative
    }
    
    // Normal progressive timing
    return schedule[Math.min(totalNudges, schedule.length - 1)];
  }

  /**
   * Show a delightful, non-intrusive nudge
   */
  private async showDelightfulNudge(): Promise<void> {
    // Final check - don't show if nudges are disabled
    if (!this.config.enabled || this.config.dismissedPermanently) {
      console.log('🔔 [Nudge] Nudge creation cancelled - nudges disabled');
      return;
    }

    if (this.isNudgeShowing) {
      console.log('🔔 [Nudge] Already showing a nudge, skipping');
      return;
    }

    try {
      const nudgeNumber = this.activity.totalNudgesShown + 1;
      console.log(`🔔 [Nudge] *** SHOWING NUDGE #${nudgeNumber} IN SESSION ${this.activity.currentSessionId} ***`);
      
      this.isNudgeShowing = true;
      this.activity.todayNudgeCount++;
      this.activity.totalNudgesShown++; // Track lifetime nudges
      // Don't mark session as nudged yet - wait for user interaction
      this.activity.typingStreakCount = 0; // Reset counter
      this.saveActivity();

      console.log('🔔 [Nudge] Creating nudge window...');
      await this.createNudgeWindow();
      
      if (this.nudgeWindow && !this.nudgeWindow.isDestroyed()) {
        console.log('🔔 [Nudge] Window created successfully, showing it...');
        
        // Small delay to ensure window is ready
        setTimeout(() => {
          if (this.nudgeWindow && !this.nudgeWindow.isDestroyed()) {
            this.nudgeWindow.show();
            console.log('🔔 [Nudge] Window.show() called');
            
            // Force window to front (but don't focus since focusable is false)
            this.nudgeWindow.moveTop();
            
            // Auto-hide timing based on user experience
            const autoHideTime = this.activity.totalNudgesShown <= 3 ? 8000 : 6000; // Longer for new users
            setTimeout(() => {
              console.log(`🔔 [Nudge] Auto-hiding nudge after ${autoHideTime/1000} seconds`);
              this.hideNudge();
            }, autoHideTime);
            
            console.log(`🔔 [Nudge] *** NUDGE #${nudgeNumber} DISPLAYED - SESSION MARKED AS NUDGED ***`);
          } else {
            console.log('🔔 [Nudge] Window was destroyed before showing');
            this.isNudgeShowing = false;
          }
        }, 100); // 100ms delay
      } else {
        console.log('🔔 [Nudge] ERROR: nudgeWindow is null or destroyed after creation');
        this.isNudgeShowing = false;
      }
    } catch (error) {
      console.log('[Nudge] Failed to show nudge:', error);
      this.isNudgeShowing = false;
    }
  }

  /**
   * Create the nudge window
   */
  private async createNudgeWindow(): Promise<void> {
    if (this.nudgeWindow && !this.nudgeWindow.isDestroyed()) {
      console.log('🔔 [Nudge] Window already exists and not destroyed');
      return;
    }

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    console.log(`🔔 [Nudge] Screen dimensions: ${screenWidth}x${screenHeight}`);

    const windowWidth = 460;
    const windowHeight = 120;
    const xPos = screenWidth - windowWidth - 20; // 20px margin from right
    const yPos = 80; // 80px from top
    
    console.log(`🔔 [Nudge] Creating window at position: ${xPos}, ${yPos} with size: ${windowWidth}x${windowHeight}`);

    this.nudgeWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: xPos,
      y: yPos,
      frame: false,
      alwaysOnTop: true,
      transparent: true,
      resizable: false,
      movable: false,
      show: false,
      skipTaskbar: true,
      focusable: false, // Prevent stealing focus and screen switching
      acceptFirstMouse: false, // Don't respond to clicks that would steal focus
      hasShadow: false, // Remove shadow to prevent mouse hover detection issues
      roundedCorners: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload.js')
      }
    });

    console.log('🔔 [Nudge] BrowserWindow created, loading HTML...');

    // Create the HTML content
    const htmlContent = this.getNudgeHTML();
    const dataURL = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
    await this.nudgeWindow.loadURL(dataURL);
    
    console.log('🔔 [Nudge] HTML content loaded');

    this.nudgeWindow.on('closed', () => {
      console.log('🔔 [Nudge] Window closed event');
      this.nudgeWindow = null;
      this.isNudgeShowing = false;
    });

    // Set up window positioning to prevent screen/workspace switching
    this.nudgeWindow.setAlwaysOnTop(true, 'floating'); // Use floating level for better visibility
    this.nudgeWindow.setVisibleOnAllWorkspaces(false); // Don't show on all workspaces - stay on current screen
    this.nudgeWindow.setIgnoreMouseEvents(false); // Allow mouse events for close button
    
    console.log('🔔 [Nudge] Window setup complete - configured to not steal focus or switch screens');
  }

  /**
   * Generate the HTML for the nudge overlay
   */
  private getNudgeHTML(): string {
    const isNewUser = this.activity.totalNudgesShown <= 3;
    const message = getRandomMessage(isNewUser, this.activity.totalNudgesShown);
    return getNudgeHTML(isNewUser, message);
  }

  /**
   * Hide the nudge window
   */
  private hideNudge(): void {
    if (this.nudgeWindow && !this.nudgeWindow.isDestroyed()) {
      this.nudgeWindow.close();
    }
    this.isNudgeShowing = false;
  }

  /**
   * Dismiss a nudge without treating it as Jarvis usage
   */
  public dismissNudge(): void {
    // Auto-dismiss (timeout) - don't mark session, allow future nudges
    console.log('🔔 [Nudge] Nudge auto-dismissed - keeping session open for future nudges');
    
    // Clear any pending nudge timers
    if (this.nudgeCheckTimer) {
      clearTimeout(this.nudgeCheckTimer);
      this.nudgeCheckTimer = null;
    }
    
    // Hide the nudge window
    this.hideNudge();
    
    // Reset typing streak but keep session open
    this.activity.typingStreakCount = 0;
    
    // Short cooldown before allowing next nudge (60 seconds)
    this.activity.lastJarvisUsage = Date.now() - (120 * 1000); // Allow nudging after 60 more seconds
    
    this.saveActivity();
    console.log('🔔 [Nudge] Auto-dismiss complete - will allow nudging again after cooldown');
  }

  /**
   * Handle explicit user dismissal (clicking X button)
   */
  public dismissNudgeExplicitly(): void {
    console.log('🔔 [Nudge] User explicitly dismissed nudge - marking session');
    
    // Mark session as nudged to prevent re-nudging in this session
    this.activity.nudgedInCurrentSession = true;
    
    // Clear any pending nudge timers
    if (this.nudgeCheckTimer) {
      clearTimeout(this.nudgeCheckTimer);
      this.nudgeCheckTimer = null;
    }
    
    // Hide the nudge window
    this.hideNudge();
    
    // Reset for next session
    this.activity.typingStreakCount = 0;
    
    this.saveActivity();
    console.log('🔔 [Nudge] Explicit dismissal - no more nudges in this typing session');
  }

  /**
   * Reset nudge counter (for testing/development)
   */
  public resetNudgeCounter(): void {
    this.activity = {
      lastTypingTime: 0,
      lastJarvisUsage: Date.now() - (10 * 60 * 1000), // 10 minutes ago to allow nudging
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
    this.saveActivity();
    console.log('🔔 [Nudge] Nudge counter reset to 0 - you will see new user nudges!');
  }

  /**
   * Record that user used Jarvis (to reduce nudging)
   */
  public recordJarvisUsage(): void {
    this.activity.lastJarvisUsage = Date.now();
    this.activity.typingStreakCount = 0; // Reset typing streak
    this.activity.firstTypingTime = 0; // Reset session
    this.activity.typingSessionDuration = 0;
    this.activity.jarvisUsageCount++; // Track successful adoption
    
    // User used Jarvis - start fresh session after this
    this.activity.currentSessionId = `session_jarvis_${Date.now()}`;
    this.activity.nudgedInCurrentSession = false; // Can nudge again in next session
    
    // Clear any pending nudge timers
    if (this.nudgeCheckTimer) {
      clearTimeout(this.nudgeCheckTimer);
      this.nudgeCheckTimer = null;
    }
    
    this.saveActivity();
    
    const adoptionRate = (this.activity.jarvisUsageCount / Math.max(1, this.activity.totalNudgesShown) * 100).toFixed(1);
    console.log(`🔔 [Nudge] Recorded Jarvis usage - started new session (${adoptionRate}% adoption rate)`);
  }

  /**
   * Record typing activity and check for immediate nudge opportunity
   */
  public recordTypingActivity(): void {
    // Exit early if nudges are disabled
    if (!this.config.enabled || this.config.dismissedPermanently) {
      console.log('🔔 [Nudge] recordTypingActivity called but nudges are DISABLED - ignoring');
      return;
    }

    // Exit early if native typing service is not supposed to be running
    if (!this.nativeTypingService) {
      console.log('🔔 [Nudge] recordTypingActivity called but service is stopped - ignoring');
      return;
    }

    const now = Date.now();
    this.activity.lastTypingTime = now;
    
    console.log(`🔔 [Nudge] TYPING RECORDED at ${new Date().toISOString()}`);
    
    // Check if we should show a nudge for this typing activity
    const timeSinceLastJarvis = now - this.activity.lastJarvisUsage;
    
    console.log(`🔔 [Nudge] Checking nudge conditions:`);
    console.log(`  - Time since last Jarvis: ${Math.round(timeSinceLastJarvis/1000)}s`);
    console.log(`  - Today's nudge count: ${this.activity.todayNudgeCount}/${this.config.maxNudgesPerDay}`);
    console.log(`  - Currently showing: ${this.isNudgeShowing}`);
    
    // Only consider nudging if:
    // 1. User hasn't used Jarvis recently (> 2 minutes)
    // 2. We haven't reached daily limit  
    // 3. No nudge currently showing
    if (timeSinceLastJarvis > 2 * 60 * 1000 && 
        this.activity.todayNudgeCount < this.config.maxNudgesPerDay && 
        !this.isNudgeShowing) {
      
      this.activity.typingStreakCount++;
      console.log(`🔔 [Nudge] Conditions met! Streak: ${this.activity.typingStreakCount}`);
      
      // Show nudge if threshold met
      const shouldNudge = this.shouldShowNudge();
      if (shouldNudge) {
        console.log('🔔 [Nudge] *** TRIGGERING NUDGE FOR REAL TYPING! ***');
        this.showDelightfulNudge();
      } else {
        console.log('🔔 [Nudge] Threshold not met for nudge');
      }
    } else {
      console.log('🔔 [Nudge] Conditions not met for nudging');
      if (timeSinceLastJarvis <= 2 * 60 * 1000) {
        console.log(`  - Used Jarvis too recently (${Math.round(timeSinceLastJarvis/1000)}s ago)`);
      }
      if (this.activity.todayNudgeCount >= this.config.maxNudgesPerDay) {
        console.log(`  - Daily limit reached (${this.activity.todayNudgeCount}/${this.config.maxNudgesPerDay})`);
      }
      if (this.isNudgeShowing) {
        console.log(`  - Nudge already showing`);
      }
    }
    
    this.saveActivity();
  }

  /**
   * Generate a session ID based on app focus and typing patterns
   */
  private generateSessionId(): string {
    const now = Date.now();
    const timeSinceLastTyping = now - this.activity.lastTypingTime;
    
    // If there's a big gap in typing (>5 minutes), it's a new session
    if (timeSinceLastTyping > 5 * 60 * 1000) {
      return `session_${now}`;
    }
    
    // If we don't have a current session, create one
    if (!this.activity.currentSessionId) {
      return `session_${now}`;
    }
    
    // Continue current session
    return this.activity.currentSessionId;
  }

  /**
   * Get current nudge settings
   */
  public getConfig(): NudgeConfig {
    return { ...this.config };
  }

  /**
   * Get current activity status for debugging
   */
  public getActivityStatus(): any {
    return {
      ...this.activity,
      timeSinceLastJarvis: Date.now() - this.activity.lastJarvisUsage,
      timeSinceLastTyping: Date.now() - this.activity.lastTypingTime,
      isNudgeShowing: this.isNudgeShowing,
      config: this.config
    };
  }

  /**
   * Reset daily nudge count for testing
   */
  public resetDailyCount(): void {
    this.activity.todayNudgeCount = 0;
    this.activity.lastNudgeDate = new Date().toDateString();
    this.saveActivity();
    console.log('🔔 [Nudge] Reset daily nudge count for testing');
  }

  /**
   * Update nudge settings
   */
  public updateConfig(newConfig: Partial<NudgeConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
    
    // Handle typing detection based on new settings
    const shouldRun = this.config.enabled && !this.config.dismissedPermanently;
    const wasRunning = !!this.nativeTypingService;
    
    if (shouldRun && !wasRunning) {
      console.log('🔔 [Nudge] Nudges enabled - starting typing detection');
      this.startTypingDetection();
    } else if (!shouldRun && wasRunning) {
      console.log('🔔 [Nudge] Nudges disabled - stopping typing detection to save resources');
      this.stopTypingDetection();
      this.hideNudge();
    }
    
    console.log('🔔 [Nudge] Configuration updated', {
      old: oldConfig,
      new: this.config,
      typingDetectionRunning: !!this.nativeTypingService
    });
  }

  /**
   * Temporarily snooze nudges
   */
  public snooze(): void {
    this.hideNudge();
    
    // Stop typing detection immediately when snoozing
    this.stopTypingDetection();
    
    // Clear any pending timers
    if (this.nudgeCheckTimer) {
      clearTimeout(this.nudgeCheckTimer);
      this.nudgeCheckTimer = null;
    }
    
    // Remember original state
    const originalEnabled = this.config.enabled;
    
    // Temporarily disable nudging (but don't save this state to disk)
    this.config.enabled = false;
    
    // Re-enable after snooze period
    setTimeout(() => {
      this.config.enabled = originalEnabled;
      if (originalEnabled) {
        this.startTypingDetection();
      }
    }, this.config.snoozeTime * 60 * 1000);
    
    console.log(`🔔 [Nudge] Snoozed for ${this.config.snoozeTime} minutes - typing detection stopped`);
  }

  /**
   * Get nudge settings for dashboard
   */
  public getNudgeSettings(): any {
    const adoptionRate = (this.activity.jarvisUsageCount / Math.max(1, this.activity.totalNudgesShown) * 100).toFixed(1);
    const currentThreshold = this.getAdaptiveNudgeTiming();
    
    return {
      enabled: this.config.enabled,
      frequency: this.config.frequency,
      smartNudging: this.config.smartNudging,
      maxNudgesPerDay: this.config.maxNudgesPerDay,
      minTypingDuration: this.config.minTypingDuration,
      snoozeTime: this.config.snoozeTime,
      currentStats: {
        todayNudgeCount: this.activity.todayNudgeCount,
        totalNudgesShown: this.activity.totalNudgesShown,
        jarvisUsageCount: this.activity.jarvisUsageCount,
        adoptionRate: `${adoptionRate}%`,
        currentThreshold: `${currentThreshold}s`,
        userLevel: this.activity.totalNudgesShown <= 3 ? 'new' : 'experienced',
        timeSinceLastJarvis: Date.now() - this.activity.lastJarvisUsage,
        typingSessionDuration: this.activity.typingSessionDuration,
        isNudgeShowing: this.isNudgeShowing
      }
    };
  }

  /**
   * Update nudge settings from dashboard - STREAMLINED VERSION
   */
  public updateNudgeSettings(settings: Partial<NudgeConfig>): void {
    if (!settings) {
      console.error('🔔 [Nudge] updateNudgeSettings called with undefined settings');
      return;
    }
    
    console.log('🔔 [Nudge] *** SETTINGS UPDATE REQUESTED ***', settings);
    
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...settings };
    
    // Save immediately
    this.saveConfig();
    
    console.log('🔔 [Nudge] Config updated:', {
      old: oldConfig.enabled,
      new: this.config.enabled,
      oldDismissed: oldConfig.dismissedPermanently,
      newDismissed: this.config.dismissedPermanently
    });
    
    // Handle typing detection based on new settings
    const shouldRun = this.config.enabled && !this.config.dismissedPermanently;
    const wasRunning = !!this.nativeTypingService;
    
    console.log('🔔 [Nudge] Detection logic:', {
      shouldRun,
      wasRunning,
      enabled: this.config.enabled,
      dismissed: this.config.dismissedPermanently
    });
    
    if (shouldRun && !wasRunning) {
      console.log('✅ [Nudge] *** ENABLING TYPING DETECTION ***');
      this.startTypingDetection();
    } else if (!shouldRun && wasRunning) {
      console.log('� [Nudge] *** DISABLING TYPING DETECTION ***');
      this.stopTypingDetection();
      this.hideNudge();
      // Clear any pending timers
      if (this.nudgeCheckTimer) {
        clearTimeout(this.nudgeCheckTimer);
        this.nudgeCheckTimer = null;
      }
    } else {
      console.log('ℹ️ [Nudge] No detection state change needed');
    }
    
    console.log('🔔 [Nudge] *** SETTINGS UPDATE COMPLETE ***', {
      typing_detection_running: !!this.nativeTypingService,
      config_enabled: this.config.enabled
    });
  }

  /**
   * Debug: Check current nudge status and configuration
   */
  public debugStatus(): void {
    console.log('🔧 [Nudge] DEBUG STATUS:');
    console.log('  - Config enabled:', this.config.enabled);
    console.log('  - Config dismissed permanently:', this.config.dismissedPermanently);
    console.log('  - Native typing service running:', !!this.nativeTypingService);
    console.log('  - Config file path:', this.configPath);
    console.log('  - Full config:', this.config);
    
    if (fs.existsSync(this.configPath)) {
      try {
        const fileContent = fs.readFileSync(this.configPath, 'utf8');
        const fileConfig = JSON.parse(fileContent);
        console.log('  - Config file content:', fileConfig);
        
        if (fileConfig.enabled !== this.config.enabled) {
          console.log('  ⚠️  CONFIG MISMATCH! File says enabled:', fileConfig.enabled, 'but service has:', this.config.enabled);
        }
      } catch (error) {
        console.log('  ❌ Error reading config file:', error.message);
      }
    } else {
      console.log('  📄 Config file does not exist');
    }
  }

  /**
   * Force disable nudges immediately (for debugging)
   */
  public forceDisable(): void {
    console.log('🚫 [Nudge] FORCE DISABLING nudges...');
    
    // Update in-memory config
    this.config.enabled = false;
    this.config.dismissedPermanently = false;
    
    // Save to file
    this.saveConfig();
    
    // Stop typing detection immediately
    this.stopTypingDetection();
    
    // Hide any active nudges
    this.hideNudge();
    
    // Clear timers
    if (this.nudgeCheckTimer) {
      clearTimeout(this.nudgeCheckTimer);
      this.nudgeCheckTimer = null;
    }
    
    console.log('✅ [Nudge] Nudges force-disabled successfully');
    console.log('✅ [Nudge] Typing detection stopped');
    console.log('✅ [Nudge] Configuration saved');
    
    // Verify the change
    this.debugStatus();
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopTypingDetection();
    if (this.nudgeCheckTimer) {
      clearInterval(this.nudgeCheckTimer);
    }
    this.hideNudge();
    console.log('🔔 [Nudge] Service destroyed');
  }
}
