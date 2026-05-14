/**
 * DictationView · port of the north-star Dictation screen from jarvis_2.0.
 * Shows lifetime savings, week/streak/words stats, and a paginated list of
 * recent transcriptions read straight from the local analytics store.
 */
import React, { useEffect, useState } from 'react';
import { theme } from '../../../styles/theme';

interface SessionRow {
  id: string;
  startTime: string;
  endTime: string;
  transcriptionText: string;
  wordCount: number;
  contextType: string;
  mode?: 'dictation' | 'command';
  metadata?: any;
}

interface Stats {
  totalSessions: number;
  totalWords: number;
  totalCharacters: number;
  averageWPM: number;
  estimatedTimeSavedMs: number;
  streakDays: number;
  lastActiveDate: string | null;
}

const PAGE_SIZE = 10;
const MAX_FETCH = 200;

export const DictationView: React.FC = () => {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(c => (c === id ? null : c)), 1200);
    } catch (e) {
      console.error('clipboard write failed', e);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const api = (window as any).electronAPI;
        if (!api?.dictationRecent) {
          if (alive) setLoading(false);
          return;
        }
        const r = await api.dictationRecent(MAX_FETCH);
        if (!alive) return;
        setSessions(r?.sessions ?? []);
        setStats(r?.stats ?? null);
      } catch (err) {
        console.error('Dictation · load failed', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const showMore = () => setVisible(v => Math.min(sessions.length, v + PAGE_SIZE));
  const showLess = () => setVisible(PAGE_SIZE);

  const lifetimeHours = stats ? stats.estimatedTimeSavedMs / 3_600_000 : 0;
  const todaysSessions = sessions.filter(s => isToday(s.startTime));
  const todaysSavedMs = todaysSessions.reduce((acc, s) => acc + estimateSavedMs(s.wordCount), 0);
  const todaysSavedMin = Math.round(todaysSavedMs / 60_000);
  const thisWeekSessions = sessions.filter(s => isWithinDays(s.startTime, 7));
  const thisWeekHours = thisWeekSessions.reduce((acc, s) => acc + estimateSavedMs(s.wordCount), 0) / 3_600_000;
  const last = sessions[0];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-medium text-white mb-1">Dictation</h2>
        <p className={`${theme.text.tertiary} text-sm`}>
          Hold <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 text-xs font-mono">Fn</kbd> in any text field — speak — release. Jarvis transcribes locally and pastes at your cursor. Works everywhere: Mail, Notion, Slack, Cursor, Telegram.
        </p>
      </div>

      {/* Last dictation pill */}
      <div className={`${theme.glass.primary} ${theme.radius.lg} px-4 py-3 mb-6 flex items-center gap-3 font-mono text-xs`}>
        <span className={theme.text.tertiary}>Last dictation</span>
        {last ? (
          <>
            <span className="text-emerald-400">●</span>
            <span className={theme.text.secondary}>
              {humanDuration(last.startTime, last.endTime)} · {last.wordCount} words · {timeOnly(last.startTime)}
            </span>
            <span className={`ml-auto ${theme.text.tertiary}`}>in {appLabel(last) || 'unknown'}</span>
          </>
        ) : (
          <span className={theme.text.tertiary}>nothing yet · hold Fn to start</span>
        )}
      </div>

      {/* Savings cards */}
      <div className="mb-3">
        <div className={`text-[11px] uppercase tracking-wider ${theme.text.quaternary} font-medium`}>Your dictation savings</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="LIFETIME SAVED"
          value={loading ? '—' : lifetimeHours.toFixed(1)}
          unit="hrs"
          delta={todaysSavedMin > 0 ? `+${todaysSavedMin}m today` : 'no dictation today'}
          deltaPositive={todaysSavedMin > 0}
        />
        <StatCard
          label="THIS WEEK"
          value={loading ? '—' : thisWeekHours.toFixed(1)}
          unit="hrs"
          delta={`${thisWeekSessions.length} sessions`}
          deltaPositive
        />
        <StatCard
          label="DAY STREAK"
          value={loading ? '—' : String(stats?.streakDays ?? 0)}
          unit="days"
          delta={(stats?.streakDays ?? 0) >= 5 ? 'on a roll' : 'keep going'}
          deltaPositive={(stats?.streakDays ?? 0) > 0}
        />
        <StatCard
          label="WORDS DICTATED"
          value={loading ? '—' : compactNumber(stats?.totalWords ?? 0)}
          delta={`avg ${Math.round(stats?.averageWPM ?? 0)} wpm`}
        />
      </div>

      {/* Recent dictations */}
      <div className="mb-3">
        <div className={`text-[11px] uppercase tracking-wider ${theme.text.quaternary} font-medium`}>Recent dictations</div>
      </div>

      {loading ? (
        <p className={`${theme.text.tertiary} text-sm`}>Loading…</p>
      ) : sessions.length === 0 ? (
        <div className={`${theme.glass.primary} ${theme.radius.lg} p-8 text-center`}>
          <p className={`${theme.text.tertiary} text-sm`}>
            No history yet. Hold <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 text-xs font-mono">Fn</kbd> in any text field and speak — sessions land here automatically.
          </p>
        </div>
      ) : (
        <>
          <div className={`${theme.glass.primary} ${theme.radius.lg} divide-y divide-white/[0.06]`}>
            {sessions.slice(0, visible).map(s => {
              const isOpen = expanded.has(s.id);
              const text = s.transcriptionText || '';
              const truncated = !isOpen && text.length > 120;
              return (
                <div
                  key={s.id}
                  onClick={() => toggleExpand(s.id)}
                  className="px-4 py-3 flex items-start gap-4 cursor-pointer hover:bg-white/[0.03] transition-colors">
                  <div className={`shrink-0 w-16 font-mono text-xs ${theme.text.tertiary} pt-0.5`}>
                    <div>{timeOnly(s.startTime)}</div>
                    <div className={`${theme.text.quaternary} text-[10px] mt-0.5`}>{s.wordCount} words</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`${theme.text.secondary} text-sm leading-relaxed`}
                      style={{
                        whiteSpace: isOpen ? 'pre-wrap' : 'nowrap',
                        overflow: 'hidden',
                        textOverflow: isOpen ? 'clip' : 'ellipsis',
                        wordBreak: 'break-word'
                      }}>
                      "{truncated ? text.slice(0, 120) + '…' : text}"
                    </div>
                    <div className={`${theme.text.quaternary} text-xs mt-1 font-mono`}>
                      {appLabel(s) || 'unknown'}{s.mode ? ` · ${s.mode}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyText(s.id, text); }}
                    title={copiedId === s.id ? 'Copied' : 'Copy transcript'}
                    className={`shrink-0 p-1.5 rounded-md ${theme.text.tertiary} hover:bg-white/10 hover:text-white/80 transition`}>
                    {copiedId === s.id ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5l3 3 7-7" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="5" width="9" height="9" rx="1.5" />
                        <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {(visible < sessions.length || visible > PAGE_SIZE) && (
            <div className="flex justify-between items-center mt-4 font-mono text-xs">
              <span className={theme.text.tertiary}>
                Showing {Math.min(visible, sessions.length)} of {sessions.length}
                {sessions.length === MAX_FETCH ? '+' : ''}
              </span>
              <div className="flex gap-2">
                {visible > PAGE_SIZE && (
                  <button
                    onClick={showLess}
                    className={`px-3 py-1.5 rounded-md border border-white/10 ${theme.text.tertiary} hover:bg-white/[0.04] text-xs`}>
                    Show less
                  </button>
                )}
                {visible < sessions.length && (
                  <button
                    onClick={showMore}
                    className="px-3 py-1.5 rounded-md bg-white/10 text-white hover:bg-white/15 text-xs">
                    Load {Math.min(PAGE_SIZE, sessions.length - visible)} more
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── helpers ────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaPositive?: boolean;
}> = ({ label, value, unit, delta, deltaPositive }) => (
  <div className={`${theme.glass.primary} ${theme.radius.xl} p-5`}>
    <div className={`text-[11px] uppercase tracking-wider ${theme.text.quaternary} font-medium mb-3`}>{label}</div>
    <div className="flex items-baseline gap-1.5">
      <span className={`text-3xl font-medium ${theme.text.primary}`}>{value}</span>
      {unit && <span className={`text-sm ${theme.text.tertiary}`}>{unit}</span>}
    </div>
    {delta && (
      <div className={`text-xs mt-2 font-mono ${deltaPositive ? 'text-emerald-400' : theme.text.quaternary}`}>{delta}</div>
    )}
  </div>
);

function isToday(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const today = new Date();
  return d.getFullYear() === today.getFullYear()
    && d.getMonth() === today.getMonth()
    && d.getDate() === today.getDate();
}

function isWithinDays(iso: string, days: number): boolean {
  if (!iso) return false;
  const d = new Date(iso).getTime();
  return d > Date.now() - days * 86_400_000;
}

function timeOnly(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function humanDuration(start: string, end: string): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)} seconds`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

function estimateSavedMs(wordCount: number): number {
  if (!wordCount) return 0;
  const typingWpm = 35;
  return (wordCount / typingWpm) * 60 * 1000;
}

function appLabel(s: SessionRow): string {
  const raw = s?.metadata?.appName as string | undefined;
  if (raw && raw.trim()) {
    return raw.trim().replace(/\b\w/g, c => c.toUpperCase());
  }
  const t = (s?.contextType || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1) + 'k';
  if (n < 1_000_000) return Math.round(n / 1000) + 'k';
  return (n / 1_000_000).toFixed(1) + 'M';
}
