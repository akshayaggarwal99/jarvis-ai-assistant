/**
 * Local Analytics Storage
 * Stores all analytics data locally in ~/.jarvis/analytics-store.json
 * No cloud services required.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Logger } from '../core/logger';
import { TranscriptionSession, UserStats } from '../types/analytics';

type ISODateString = string;

interface PersistedSession {
  id: string;
  userId: string;
  startTime: ISODateString;
  endTime: ISODateString;
  transcriptionText: string;
  wordCount: number;
  characterCount: number;
  processingTimeMs: number;
  contextType: string;
  mode: 'dictation' | 'command';
  metadata: TranscriptionSession['metadata'];
  createdAt: ISODateString;
}

interface PersistedStats {
  totalSessions: number;
  totalWords: number;
  totalCharacters: number;
  averageWPM: number;
  estimatedTimeSavedMs: number;
  streakDays: number;
  lastActiveDate: ISODateString | null;
  createdAt: ISODateString;
}

interface PersistedEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp: ISODateString;
}

interface PersistedUserData {
  stats: PersistedStats;
  sessions: PersistedSession[];
  events: PersistedEvent[];
}

interface PersistedStore {
  machineId: string;
  users: Record<string, PersistedUserData>;
  version: number;
}

const STORE_VERSION = 1;
const STORE_DIR = process.env.JARVIS_DATA_DIR || path.join(os.homedir(), '.jarvis');
const STORE_FILE = path.join(STORE_DIR, 'analytics-store.json');

const ensureDirectory = () => {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
};

const nowISO = () => new Date().toISOString();

const defaultStats = (): PersistedStats => ({
  totalSessions: 0,
  totalWords: 0,
  totalCharacters: 0,
  averageWPM: 0,
  estimatedTimeSavedMs: 0,
  streakDays: 0,
  lastActiveDate: null,
  createdAt: nowISO()
});

const defaultUser = (): PersistedUserData => ({
  stats: defaultStats(),
  sessions: [],
  events: []
});

const generateMachineId = (): string => {
  try {
    const macPaths = ['en0', 'eth0'];
    for (const iface of macPaths) {
      const raw = fs.existsSync('/sbin/ifconfig')
        ? require('child_process')
            .execSync(`ifconfig ${iface} | awk '/ether/{print $2}'`, { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim()
        : '';
      if (raw) {
        return raw.replace(/:/g, '').toLowerCase();
      }
    }
  } catch (error) {
    Logger.debug('[AnalyticsStore] Failed to read MAC address, generating fallback id:', error);
  }
  return crypto.randomUUID();
};

const loadStore = (): PersistedStore => {
  try {
    ensureDirectory();
    if (!fs.existsSync(STORE_FILE)) {
      const initial: PersistedStore = {
        machineId: generateMachineId(),
        users: {},
        version: STORE_VERSION
      };
      fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }

    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedStore;
    if (!parsed.machineId) {
      parsed.machineId = generateMachineId();
    }
    if (!parsed.version) {
      parsed.version = STORE_VERSION;
    }
    return parsed;
  } catch (error) {
    Logger.error('[AnalyticsStore] Failed to read analytics store, starting fresh:', error);
    const fallback: PersistedStore = {
      machineId: generateMachineId(),
      users: {},
      version: STORE_VERSION
    };
    return fallback;
  }
};

const persistStore = (store: PersistedStore) => {
  try {
    ensureDirectory();
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  } catch (error) {
    Logger.error('[AnalyticsStore] Failed to persist analytics store:', error);
  }
};

const toUserStats = (userId: string, stats: PersistedStats): UserStats => ({
  userId,
  totalSessions: stats.totalSessions,
  totalWords: stats.totalWords,
  totalCharacters: stats.totalCharacters,
  averageWPM: stats.averageWPM,
  estimatedTimeSavedMs: stats.estimatedTimeSavedMs,
  streakDays: stats.streakDays,
  lastActiveDate: stats.lastActiveDate ? new Date(stats.lastActiveDate) : new Date(),
  createdAt: stats.createdAt ? new Date(stats.createdAt) : new Date()
});

const serializeSession = (session: TranscriptionSession): PersistedSession => ({
  id: session.id,
  userId: session.userId,
  startTime: session.startTime.toISOString(),
  endTime: session.endTime.toISOString(),
  transcriptionText: session.transcriptionText,
  wordCount: session.wordCount,
  characterCount: session.characterCount,
  processingTimeMs: session.processingTimeMs,
  contextType: session.contextType,
  mode: session.mode ?? 'dictation',
  metadata: session.metadata ?? { audioLengthMs: 0, model: 'unknown', language: 'en' },
  createdAt: session.createdAt.toISOString()
});

const deserializeSession = (session: PersistedSession): TranscriptionSession => ({
  id: session.id,
  userId: session.userId,
  startTime: new Date(session.startTime),
  endTime: new Date(session.endTime),
  transcriptionText: session.transcriptionText,
  wordCount: session.wordCount,
  characterCount: session.characterCount,
  processingTimeMs: session.processingTimeMs,
  contextType: session.contextType as TranscriptionSession['contextType'],
  mode: session.mode,
  metadata: session.metadata,
  createdAt: new Date(session.createdAt)
});

class LocalAnalyticsStore {
  private store: PersistedStore;
  private userId = 'default-user';

  constructor() {
    this.store = loadStore();
    Logger.info('[AnalyticsStore] Initialized with machine ID:', this.store.machineId);
  }

  setUserId(userId: string): void {
    if (!userId) {
      this.userId = 'default-user';
      return;
    }
    this.userId = userId;
    this.ensureUser();
    Logger.info('[AnalyticsStore] User ID updated:', userId);
  }

  private ensureUser(): PersistedUserData {
    if (!this.store.users[this.userId]) {
      this.store.users[this.userId] = defaultUser();
      persistStore(this.store);
    }
    return this.store.users[this.userId];
  }

  saveSession(session: TranscriptionSession): void {
    const user = this.ensureUser();
    user.sessions.push(serializeSession(session));
    user.stats.lastActiveDate = nowISO();
    if (!user.stats.createdAt) {
      user.stats.createdAt = nowISO();
    }
    persistStore(this.store);
    Logger.info(`[AnalyticsStore] Saved session ${session.id} for ${this.userId}`);
  }

  async getStats(): Promise<UserStats | null> {
    const user = this.ensureUser();
    return toUserStats(this.userId, user.stats);
  }

  async getUserSessions(_: string, limitCount: number = 50): Promise<TranscriptionSession[]> {
    const user = this.ensureUser();
    const sorted = [...user.sessions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted.slice(0, limitCount).map(deserializeSession);
  }

  async updateStatsInBatch(updates: { sessions: number; words: number; characters: number; timeSaved: number }): Promise<void> {
    const user = this.ensureUser();
    user.stats.totalSessions += updates.sessions;
    user.stats.totalWords += updates.words;
    user.stats.totalCharacters += updates.characters;
    user.stats.estimatedTimeSavedMs += updates.timeSaved;
    user.stats.lastActiveDate = nowISO();
    persistStore(this.store);
    Logger.info('[AnalyticsStore] Stats updated:', updates);
  }

  async trackEvent(eventName: string, properties?: Record<string, unknown>): Promise<void> {
    const user = this.ensureUser();
    user.events.push({ name: eventName, properties, timestamp: nowISO() });
    user.events = user.events.slice(-500);
    persistStore(this.store);
    Logger.debug(`[AnalyticsStore] Tracked event ${eventName}`);
  }

  async getUserSessionsInDateRange(_userId: string, startDate: Date, endDate: Date): Promise<TranscriptionSession[]> {
    const user = this.ensureUser();
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    return user.sessions
      .filter(session => {
        const sessionTime = new Date(session.startTime).getTime();
        return sessionTime >= startTime && sessionTime <= endTime;
      })
      .map(deserializeSession);
  }

  async clear(): Promise<void> {
    this.store.users[this.userId] = defaultUser();
    persistStore(this.store);
  }

  getMachineId(): string {
    return this.store.machineId;
  }
}

// Export LocalAnalyticsStore as the primary class
// FirebaseStorage is kept as an alias for backwards compatibility
export { LocalAnalyticsStore, LocalAnalyticsStore as FirebaseStorage };
