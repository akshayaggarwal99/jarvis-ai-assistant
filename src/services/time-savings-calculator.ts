import { TranscriptionSession } from '../types/analytics';

interface TimeSavingsCalculation {
  sessionTimeSaved: number; // milliseconds
  estimatedTypingTime: number; // milliseconds
  actualTranscriptionTime: number; // milliseconds
  efficiencyMultiplier: number; // how many times faster than typing
  charactersPerMinute: number; // effective typing speed achieved
}

interface CumulativeTimeSavings {
  totalTimeSaved: number; // milliseconds
  totalSessions: number;
  averageEfficiency: number;
  totalCharactersTranscribed: number;
  totalTypingTimeSaved: number; // milliseconds
  dailySavings: number; // milliseconds for today
  weeklySavings: number; // milliseconds for this week
  monthlySavings: number; // milliseconds for this month
}

export class TimeSavingsCalculator {
  // Traditional AI workflow times (more realistic than just typing)
  private static readonly TRADITIONAL_WORKFLOW_BASE_TIME_MS = 120000; // 2 minutes minimum
  private static readonly TRADITIONAL_WORKFLOW_MAX_TIME_MS = 300000; // 5 minutes maximum  
  private static readonly JARVIS_WORKFLOW_BASE_TIME_MS = 5000; // 5 seconds minimum
  private static readonly JARVIS_WORKFLOW_MAX_TIME_MS = 15000; // 15 seconds maximum
  
  // Average typing speeds (characters per minute)
  private static readonly SLOW_TYPER_CPM = 150; // 30 WPM * 5 chars/word
  private static readonly AVERAGE_TYPER_CPM = 200; // 40 WPM * 5 chars/word  
  private static readonly FAST_TYPER_CPM = 300; // 60 WPM * 5 chars/word
  
  // Default typing speed for calculations
  private static readonly DEFAULT_TYPING_CPM = TimeSavingsCalculator.AVERAGE_TYPER_CPM;
  
  // Additional time factors for manual workflows
  private static readonly THINKING_TIME_MULTIPLIER = 1.3; // 30% more time for thinking while typing
  private static readonly EDITING_TIME_MULTIPLIER = 1.2; // 20% more time for corrections/editing
  private static readonly TOTAL_MANUAL_MULTIPLIER = TimeSavingsCalculator.THINKING_TIME_MULTIPLIER * 
                                                   TimeSavingsCalculator.EDITING_TIME_MULTIPLIER;

  /**
   * Calculate time savings for a single transcription session
   * Uses different baselines for dictation vs command mode
   */
  static calculateSessionSavings(session: TranscriptionSession): TimeSavingsCalculation {
    const characterCount = session.characterCount || session.transcriptionText?.length || 0;
    const audioLengthMs = session.metadata?.audioLengthMs || 0;
    const processingTimeMs = session.processingTimeMs || 0;
    const mode = session.mode || 'dictation'; // Default to dictation for backward compatibility
    
    // Calculate baseline time based on mode
    let baselineTime: number;
    if (mode === 'command') {
      // Command mode: Compare against traditional AI workflow (2-5 minutes)
      baselineTime = this.calculateTraditionalWorkflowTime(characterCount);
    } else {
      // Dictation mode: Compare against typing speed (40 WPM baseline)
      baselineTime = this.calculateTypingTime(characterCount);
    }
    
    // Actual time taken with Jarvis (audio recording + processing)
    const actualTranscriptionTime = audioLengthMs + processingTimeMs;
    
    // Time saved by using Jarvis
    const sessionTimeSaved = Math.max(0, baselineTime - actualTranscriptionTime);
    
    // Efficiency multiplier (how many times faster)
    const efficiencyMultiplier = baselineTime > 0 ? 
      baselineTime / actualTranscriptionTime : 1;
    
    // Effective characters per minute achieved
    const totalTimeMinutes = actualTranscriptionTime / (1000 * 60);
    const charactersPerMinute = totalTimeMinutes > 0 ? characterCount / totalTimeMinutes : 0;
    
    return {
      sessionTimeSaved,
      estimatedTypingTime: baselineTime, // Renamed but same interface
      actualTranscriptionTime,
      efficiencyMultiplier,
      charactersPerMinute
    };
  }

  /**
   * Calculate traditional AI workflow time:
   * 1. Open browser/app (10-30s)
   * 2. Navigate to AI tool (10-30s) 
   * 3. Type/describe context (30-120s)
   * 4. Wait for response (5-30s)
   * 5. Copy and switch back (5-15s)
   * 6. Paste and position (5-15s)
   * Total: 2-5 minutes typical
   */
  private static calculateTraditionalWorkflowTime(characterCount: number): number {
    // Base workflow overhead (app switching, navigation, copying, etc.)
    const baseOverheadMs = 90000; // 1.5 minutes baseline
    
    // Additional time based on complexity (more characters = more context to describe)
    const complexityFactorMs = Math.min(characterCount * 10, 120000); // Up to 2 more minutes
    
    return baseOverheadMs + complexityFactorMs;
  }

  /**
   * Calculate cumulative time savings across multiple sessions
   */
  static calculateCumulativeSavings(sessions: TranscriptionSession[]): CumulativeTimeSavings {
    let totalTimeSaved = 0;
    let totalCharactersTranscribed = 0;
    let totalTypingTimeSaved = 0;
    let totalEfficiency = 0;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    let dailySavings = 0;
    let weeklySavings = 0;
    let monthlySavings = 0;
    
    for (const session of sessions) {
      const savings = this.calculateSessionSavings(session);
      
      // Debug log only for truly problematic calculations (negative savings or unrealistic values)
      if (savings.sessionTimeSaved < 0 || savings.sessionTimeSaved > 3600000) { // Less than 0 or more than 1 hour
        console.log(`🔍 [Time Calc Debug] Session ${session.id}:`, {
          mode: session.mode,
          characterCount: session.characterCount,
          audioLengthMs: session.metadata?.audioLengthMs,
          processingTimeMs: session.processingTimeMs,
          baselineTime: savings.estimatedTypingTime,
          actualTime: savings.actualTranscriptionTime,
          timeSaved: savings.sessionTimeSaved,
          efficiency: savings.efficiencyMultiplier
        });
      }
      
      totalTimeSaved += savings.sessionTimeSaved;
      totalTypingTimeSaved += savings.estimatedTypingTime;
      totalCharactersTranscribed += session.characterCount || 0;
      totalEfficiency += savings.efficiencyMultiplier;
      
      // Calculate time-based savings
      const sessionDate = new Date(session.startTime);
      if (sessionDate >= todayStart) {
        dailySavings += savings.sessionTimeSaved;
      }
      if (sessionDate >= weekStart) {
        weeklySavings += savings.sessionTimeSaved;
      }
      if (sessionDate >= monthStart) {
        monthlySavings += savings.sessionTimeSaved;
      }
    }
    
    return {
      totalTimeSaved,
      totalSessions: sessions.length,
      averageEfficiency: sessions.length > 0 ? totalEfficiency / sessions.length : 1,
      totalCharactersTranscribed,
      totalTypingTimeSaved,
      dailySavings,
      weeklySavings,
      monthlySavings
    };
  }

  /**
   * Calculate estimated typing time for given character count
   */
  private static calculateTypingTime(characterCount: number): number {
    // Base typing time
    const baseTypingTimeMs = (characterCount / this.DEFAULT_TYPING_CPM) * 60 * 1000;
    
    // Apply multipliers for thinking and editing time
    return baseTypingTimeMs * this.TOTAL_MANUAL_MULTIPLIER;
  }

  /**
   * Format time savings for display
   */
  static formatTimeSavings(milliseconds: number): string {
    if (milliseconds < 60000) { // Less than 1 minute
      const seconds = Math.round(milliseconds / 1000);
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    } else if (milliseconds < 3600000) { // Less than 1 hour
      const minutes = Math.round(milliseconds / 60000);
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else if (milliseconds < 86400000) { // Less than 1 day
      const hours = Math.round(milliseconds / 3600000 * 10) / 10; // One decimal place
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else {
      const days = Math.round(milliseconds / 86400000 * 10) / 10;
      return `${days} day${days !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Get efficiency messaging for dashboard
   */
  static getEfficiencyMessage(efficiency: number): string {
    if (efficiency >= 5) {
      return `${Math.round(efficiency)}x faster than typing`;
    } else if (efficiency >= 2) {
      return `${Math.round(efficiency * 10) / 10}x faster than typing`;
    } else if (efficiency > 1) {
      return `${Math.round((efficiency - 1) * 100)}% faster than typing`;
    } else {
      return 'Building efficiency...';
    }
  }

  /**
   * Get productivity insights
   */
  static getProductivityInsights(savings: CumulativeTimeSavings): string[] {
    const insights: string[] = [];
    
    if (savings.totalSessions === 0) {
      return ['Start using Jarvis to see your time savings!'];
    }
    
    // Weekly insights
    if (savings.weeklySavings > 0) {
      insights.push(`Saved ${this.formatTimeSavings(savings.weeklySavings)} this week`);
    }
    
    // Efficiency insights
    if (savings.averageEfficiency > 3) {
      insights.push(this.getEfficiencyMessage(savings.averageEfficiency));
    }
    
    // Volume insights
    if (savings.totalCharactersTranscribed > 10000) {
      const pages = Math.round(savings.totalCharactersTranscribed / 2000); // ~2000 chars per page
      insights.push(`Transcribed ${pages} pages of text`);
    }
    
    // Workflow insights
    if (savings.totalSessions > 50) {
      insights.push(`Eliminated ${savings.totalSessions} manual workflows`);
    }
    
    return insights.length > 0 ? insights : ['Keep using Jarvis to unlock productivity insights!'];
  }

  /**
   * Calculate potential future savings based on usage patterns
   */
  static calculateProjectedSavings(
    sessions: TranscriptionSession[], 
    timeframe: 'week' | 'month' | 'year'
  ): number {
    if (sessions.length === 0) return 0;
    
    const savings = this.calculateCumulativeSavings(sessions);
    const averageDailySavings = savings.weeklySavings / 7; // Average daily savings from this week
    
    switch (timeframe) {
      case 'week':
        return averageDailySavings * 7;
      case 'month':
        return averageDailySavings * 30;
      case 'year':
        return averageDailySavings * 365;
      default:
        return 0;
    }
  }
}

export type { TimeSavingsCalculation, CumulativeTimeSavings };
