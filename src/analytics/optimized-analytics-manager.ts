import { TranscriptionSession, UserStats } from '../types/analytics';
import { LocalAnalyticsStore } from '../storage/local-analytics-store';
import { TimeSavingsCalculator } from '../services/time-savings-calculator';
import { Logger } from '../core/logger';
import { EventEmitter } from 'events';

/**
 * Optimized Analytics Manager with real-time updates and efficient queries
 */
export class OptimizedAnalyticsManager extends EventEmitter {
  private storage = new LocalAnalyticsStore();
  private currentSession: Partial<TranscriptionSession> | null = null;
  private userId: string = 'default-user';

  // Enhanced caching with immediate updates
  private cachedStats: UserStats | null = null;
  private pendingUpdates: {
    sessions: number;
    words: number;
    characters: number;
    timeSaved: number;
  } = { sessions: 0, words: 0, characters: 0, timeSaved: 0 };

  // Batch update timer
  private updateTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_UPDATE_DELAY = 5000; // 5 seconds

  // Throttle stats updates
  private lastEmitTime = 0;
  private readonly EMIT_THROTTLE_MS = 500;
  private emitTimeout: NodeJS.Timeout | null = null;


  constructor() {
    super();
  }

  setUserId(userId: string): void {
    Logger.debug('Setting userId from', this.userId, 'to', userId);

    // Clear everything when user changes
    if (this.userId !== userId) {
      this.cachedStats = null;
      this.pendingUpdates = { sessions: 0, words: 0, characters: 0, timeSaved: 0 };
      if (this.updateTimer) {
        clearTimeout(this.updateTimer);
        this.updateTimer = null;
      }
      if (this.emitTimeout) {
        clearTimeout(this.emitTimeout);
        this.emitTimeout = null;
      }
    }

    this.userId = userId;
    this.storage.setUserId(userId);
  }

  getCurrentUserId(): string {
    return this.userId;
  }

  startSession(): string {
    const sessionId = Date.now().toString();

    // Warn if there's already an active session
    if (this.currentSession) {
      Logger.warning(`📊 [Analytics] WARNING: Starting new session ${sessionId} while session ${this.currentSession.id} is still active!`);
    }

    this.currentSession = {
      id: sessionId,
      startTime: new Date(),
      contextType: 'other'
    };
    Logger.info(`🔥 Session started: ${sessionId}, userId: ${this.userId}, hasCurrentSession: ${!!this.currentSession}`);
    return sessionId;
  }

  async endSession(transcriptionText: string, audioLengthMs: number, model: string = 'whisper-local', mode: 'dictation' | 'command' = 'dictation'): Promise<void> {
    Logger.info(`📊 [Analytics] endSession called - currentSession: ${!!this.currentSession}, sessionId: ${this.currentSession?.id}, userId: ${this.userId}, isAuthenticated: ${this.storage['isAuthenticated']}`);

    // Add extra debug logging
    console.log('📊 [DEBUG] Analytics state:', {
      userId: this.userId,
      isAuthenticated: this.storage['isAuthenticated'],
      hasCurrentSession: !!this.currentSession,
      sessionId: this.currentSession?.id,
      transcriptionLength: transcriptionText.length
    });

    if (!this.currentSession) {
      Logger.warning('📊 [Analytics] No current session to end');
      return;
    }

    const wordCount = transcriptionText.trim().split(/\s+/).length;
    const characterCount = transcriptionText.length;
    const processingTimeMs = Date.now() - this.currentSession.startTime!.getTime();

    const session: TranscriptionSession = {
      ...this.currentSession,
      userId: this.userId,
      endTime: new Date(),
      transcriptionText,
      wordCount,
      characterCount,
      processingTimeMs,
      mode,
      metadata: {
        audioLengthMs,
        model,
        language: 'en'
      },
      createdAt: new Date()
    } as TranscriptionSession;

    // Calculate time saved for this session
    const sessionSavings = TimeSavingsCalculator.calculateSessionSavings(session);
    const timeSaved = sessionSavings.sessionTimeSaved;

    // Update pending changes immediately
    this.pendingUpdates.sessions += 1;
    this.pendingUpdates.words += wordCount;
    this.pendingUpdates.characters += characterCount;
    this.pendingUpdates.timeSaved += timeSaved;

    // Calculate WPM for this session (words per minute based on audio length)
    const sessionWPM = audioLengthMs > 0 ? Math.round((wordCount / audioLengthMs) * 60000) : 0;

    // Update cached stats immediately for instant UI updates
    if (!this.cachedStats) {
      // Initialize default stats if not cached
      this.cachedStats = {
        userId: this.userId,
        totalSessions: 0,
        totalWords: 0,
        totalCharacters: 0,
        averageWPM: 0,
        estimatedTimeSavedMs: 0,
        lastActiveDate: new Date(),
        streakDays: 0,
        createdAt: new Date(),
        _totalAudioMs: 0 // Internal tracking for WPM calculation
      } as any;
      Logger.info('📊 [Analytics] Initialized default cached stats for real-time updates');
    }

    this.cachedStats.totalSessions += 1;
    this.cachedStats.totalWords += wordCount;
    this.cachedStats.totalCharacters += characterCount;
    this.cachedStats.estimatedTimeSavedMs += timeSaved;

    // Update average WPM using cumulative audio time
    const cachedStatsWithAudio = this.cachedStats as any;
    cachedStatsWithAudio._totalAudioMs = (cachedStatsWithAudio._totalAudioMs || 0) + audioLengthMs;
    if (cachedStatsWithAudio._totalAudioMs > 0) {
      this.cachedStats.averageWPM = Math.round((this.cachedStats.totalWords / cachedStatsWithAudio._totalAudioMs) * 60000);
    }

    Logger.info(`📊 [Analytics] Session WPM: ${sessionWPM}, Average WPM: ${this.cachedStats.averageWPM}`);

    // Emit stats update event for real-time dashboard updates (throttled)
    this.emitStatsUpdate();

    // Save session to local storage (non-blocking)
    Logger.info(`📊 [Analytics] Saving session locally - sessionId: ${session.id}, words: ${wordCount}`);
    this.storage.saveSession(session);

    // Schedule batch update to local storage
    this.scheduleBatchUpdate();

    // Clear session AFTER all processing is done
    const endedSessionId = this.currentSession.id;
    this.currentSession = null;
    Logger.info(`📊 [Analytics] Session ${endedSessionId} ended successfully - totalSessions now: ${this.cachedStats?.totalSessions || 'unknown'}`);

    // Log listener count to debug real-time updates
    Logger.info(`📊 [Analytics] Event listeners for stats-update: ${this.listenerCount('stats-update')}`);
  }

  private scheduleBatchUpdate(): void {
    // Clear existing timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    // Set new timer for batch update
    this.updateTimer = setTimeout(() => {
      this.performBatchUpdate();
    }, this.BATCH_UPDATE_DELAY);
  }

  private async performBatchUpdate(): Promise<void> {
    if (this.pendingUpdates.sessions === 0) return;

    Logger.info('📊 Performing batch stats update:', this.pendingUpdates);

    try {
      // Update local storage stats in batch
      await this.storage.updateStatsInBatch(this.pendingUpdates);

      // Clear pending updates
      this.pendingUpdates = { sessions: 0, words: 0, characters: 0, timeSaved: 0 };
    } catch (error) {
      Logger.error('Failed to perform batch update:', error);
      // Keep pending updates for retry
    }
  }

  // Throttled event emission
  private emitStatsUpdate(): void {
    const now = Date.now();
    const timeSinceLastEmit = now - this.lastEmitTime;

    if (timeSinceLastEmit >= this.EMIT_THROTTLE_MS) {
      // Time threshold passed, emit immediately
      this.performEmit();
    } else {
      // Too soon, schedule for later if not already scheduled
      if (!this.emitTimeout) {
        const delay = this.EMIT_THROTTLE_MS - timeSinceLastEmit;
        this.emitTimeout = setTimeout(() => {
          this.performEmit();
        }, delay);
      }
    }
  }

  private performEmit(): void {
    if (this.emitTimeout) {
      clearTimeout(this.emitTimeout);
      this.emitTimeout = null;
    }

    this.lastEmitTime = Date.now();

    Logger.info(`📊 [Analytics] Emitting stats-update (listeners: ${this.listenerCount('stats-update')})`);
    this.emit('stats-update', this.cachedStats);
  }

  async getStats(): Promise<UserStats | null> {
    // Return cached stats immediately if available
    if (this.cachedStats) {
      Logger.info(`📊 Returning cached stats - sessions: ${this.cachedStats.totalSessions}, userId: ${this.userId}`);
      return this.cachedStats;
    }

    Logger.info(`🔍 Loading stats from local storage for userId: ${this.userId}...`);
    const baseStats = await this.storage.getStats();
    if (!baseStats) {
      Logger.warning(`📊 [Analytics] No stats from Firebase - returning cached stats or defaults`);
      // If we have cached stats from memory, return those
      if (this.cachedStats) {
        return this.cachedStats;
      }
      // Otherwise return default stats
      return {
        userId: this.userId,
        totalSessions: 0,
        totalWords: 0,
        totalCharacters: 0,
        averageWPM: 0,
        estimatedTimeSavedMs: 0,
        lastActiveDate: new Date(),
        streakDays: 0,
        createdAt: new Date()
      };
    }

    // Only fetch recent sessions for time-based calculations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSessions = await this.storage.getUserSessionsInDateRange(
      this.userId,
      thirtyDaysAgo,
      new Date()
    );

    if (recentSessions && recentSessions.length > 0) {
      const recentSavings = TimeSavingsCalculator.calculateCumulativeSavings(recentSessions);

      // Calculate average WPM from sessions
      let totalWords = 0;
      let totalAudioMs = 0;
      for (const session of recentSessions) {
        totalWords += session.wordCount || 0;
        totalAudioMs += session.metadata?.audioLengthMs || 0;
      }
      const calculatedWPM = totalAudioMs > 0 ? Math.round((totalWords / totalAudioMs) * 60000) : 0;

      this.cachedStats = {
        ...baseStats,
        averageWPM: calculatedWPM,
        dailyTimeSaved: recentSavings.dailySavings,
        weeklyTimeSaved: recentSavings.weeklySavings,
        monthlyTimeSaved: recentSavings.monthlySavings,
        efficiencyMultiplier: recentSavings.averageEfficiency,
        _totalAudioMs: totalAudioMs // Keep track for future calculations
      } as UserStats & {
        dailyTimeSaved: number;
        weeklyTimeSaved: number;
        monthlyTimeSaved: number;
        efficiencyMultiplier: number;
        _totalAudioMs: number;
      };
    } else {
      this.cachedStats = baseStats;
    }

    return this.cachedStats;
  }

  // Force save any pending updates (e.g., on app quit)
  async flush(): Promise<void> {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    if (this.pendingUpdates.sessions > 0) {
      await this.performBatchUpdate();
    }
  }

  // Subscribe to real-time stats updates
  onStatsUpdate(callback: (stats: UserStats) => void): () => void {
    this.on('stats-update', callback);
    return () => this.off('stats-update', callback);
  }

  // Existing methods for compatibility
  forceRefreshStats(): void {
    this.cachedStats = null;
  }

  clearState(): void {
    this.userId = 'default-user';
    this.currentSession = null;
    this.cachedStats = null;
    this.pendingUpdates = { sessions: 0, words: 0, characters: 0, timeSaved: 0 };
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this.storage.setUserId('default-user');
  }

  // Event tracking methods (unchanged)
  trackEvent(eventName: string, properties?: Record<string, any>): void {
    Logger.info(`[Analytics] Event: ${eventName}`, properties);
    this.storage.trackEvent(eventName, properties);
  }

  trackError(errorType: string, properties?: Record<string, any>): void {
    Logger.error(`[Analytics] Error: ${errorType}`, properties);
    this.storage.trackEvent('error_' + errorType, properties);
  }

  trackPerformance(metricName: string, value: number, properties?: Record<string, any>): void {
    Logger.info(`[Analytics] Performance: ${metricName} = ${value}ms`, properties);
    this.storage.trackEvent('performance_' + metricName, { ...properties, value });
  }
}