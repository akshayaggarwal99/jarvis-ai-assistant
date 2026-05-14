/**
 * Jarvis2Banner · soft waitlist nudge on the Dashboard tab.
 *
 * Eligibility: account is at least 7 days old OR has 10+ dictations, AND the
 * user hasn't dismissed it. Non-modal, dismissible-forever, single sticky
 * card. Click-through goes to https://jarvis.ceo/jarvis-2-0 via openExternal.
 */
import React, { useEffect, useState } from 'react';
import { theme } from '../../../styles/theme';

interface BannerStats {
  totalSessions?: number;
  createdAt?: string | Date;
}

const WAITLIST_URL = 'https://jarvis.ceo/jarvis-2-0';
const DAYS_THRESHOLD = 7;
const SESSIONS_THRESHOLD = 10;

const daysSince = (iso: string | Date | undefined): number => {
  if (!iso) return 0;
  const t = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
};

export const Jarvis2Banner: React.FC<{ stats: BannerStats | null }> = ({ stats }) => {
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [shownLogged, setShownLogged] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const api = (window as any).electronAPI;
        const settings = api?.appGetSettings ? await api.appGetSettings() : null;
        if (!alive) return;
        if (settings?.jarvis2BannerDismissed) {
          setDismissed(true);
          return;
        }
        const totalSessions = stats?.totalSessions ?? 0;
        const age = daysSince(stats?.createdAt);
        setEligible(age >= DAYS_THRESHOLD || totalSessions >= SESSIONS_THRESHOLD);
      } catch {
        // Fall back to hiding rather than risking a runtime crash on the dashboard.
        setEligible(false);
      }
    })();
    return () => { alive = false; };
  }, [stats?.totalSessions, stats?.createdAt]);

  useEffect(() => {
    if (!eligible || dismissed || shownLogged) return;
    const api = (window as any).electronAPI;
    if (api?.posthogCapture) {
      api.posthogCapture('jarvis2_banner_shown', {
        days_since_first_launch: daysSince(stats?.createdAt),
        total_sessions: stats?.totalSessions ?? 0
      });
    }
    setShownLogged(true);
  }, [eligible, dismissed, shownLogged, stats]);

  if (!eligible || dismissed) return null;

  const handleClick = async () => {
    const api = (window as any).electronAPI;
    if (api?.posthogCapture) {
      api.posthogCapture('jarvis2_banner_clicked', {});
    }
    if (api?.openExternal) {
      try { await api.openExternal(WAITLIST_URL); } catch { /* ignore */ }
    }
  };

  const handleDismiss = async () => {
    const api = (window as any).electronAPI;
    if (api?.posthogCapture) {
      api.posthogCapture('jarvis2_banner_dismissed', {});
    }
    setDismissed(true);
    if (api?.appUpdateSettings) {
      try { await api.appUpdateSettings({ jarvis2BannerDismissed: true }); } catch { /* ignore */ }
    }
  };

  return (
    <div className={`relative ${theme.glass.primary} ${theme.radius.xl} p-5 mb-6 border border-white/10 overflow-hidden`}>
      {/* subtle gradient accent */}
      <div className="absolute inset-0 bg-gradient-to-r from-violet-500/[0.08] via-transparent to-cyan-500/[0.08] pointer-events-none" />

      <div className="relative flex items-start gap-4">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/40 to-cyan-500/40 flex items-center justify-center border border-white/10">
          <span className="text-lg">✨</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className={`text-base font-medium ${theme.text.primary}`}>Jarvis 2.0 is coming</h3>
            <span className={`text-[10px] uppercase tracking-wider font-mono ${theme.text.quaternary}`}>
              early access
            </span>
          </div>
          <p className={`text-sm ${theme.text.tertiary} leading-relaxed`}>
            Cross-app memory, full assistant mode, bigger context. Built on what you already use Jarvis for, plus everything it should have been.
          </p>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleClick}
              className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition">
              Join the waitlist
            </button>
            <button
              onClick={handleDismiss}
              className={`text-xs ${theme.text.tertiary} hover:${theme.text.secondary} transition`}>
              Not now
            </button>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          title="Dismiss"
          className={`shrink-0 p-1 rounded-md ${theme.text.quaternary} hover:bg-white/5 hover:${theme.text.tertiary} transition`}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
};
