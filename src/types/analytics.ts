export interface TranscriptionSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  transcriptionText: string;
  wordCount: number;
  characterCount: number;
  processingTimeMs: number;
  contextType: 'email' | 'messaging' | 'document' | 'code' | 'other';
  mode: 'dictation' | 'command'; // New field to distinguish dictation vs command mode
  metadata: {
    audioLengthMs: number;
    model: string;
    language: string;
  };
  createdAt: Date;
}

export interface UserStats {
  userId: string;
  totalSessions: number;
  totalWords: number;
  totalCharacters: number;
  averageWPM: number;
  estimatedTimeSavedMs: number;
  lastActiveDate: Date;
  streakDays: number;
  createdAt: Date;
  // Optional enhanced fields calculated on-demand
  dailyTimeSaved?: number;
  weeklyTimeSaved?: number;
  monthlyTimeSaved?: number;
  efficiencyMultiplier?: number;
}
