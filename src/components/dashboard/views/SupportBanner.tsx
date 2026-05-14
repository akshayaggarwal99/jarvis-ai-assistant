/**
 * SupportBanner · personal founder ask after heavy usage.
 *
 * Shows once the account is at least 9 days old OR has 50+ dictations.
 * One dismiss is permanent. Two CTAs (share + star) and two passive
 * dismisses ("thanks, I'll think about it" and "I already did") so users
 * have an honest way out either direction.
 */
import React, { useEffect, useState } from 'react';
import { theme } from '../../../styles/theme';

interface BannerStats {
  totalSessions?: number;
  estimatedTimeSavedMs?: number;
  createdAt?: string | Date;
}

const DAYS_THRESHOLD = 9;
const SESSIONS_THRESHOLD = 50;

const GITHUB_URL = 'https://github.com/akshayaggarwal99/jarvis-ai-assistant';
const TWEET_TEXT = encodeURIComponent(
  "Just found Jarvis — open-source voice dictation for Mac. Free, fast, no account needed."
);
const TWEET_URL_PARAM = encodeURIComponent('https://jarvis.ceo');
const SHARE_INTENT = `https://twitter.com/intent/tweet?text=${TWEET_TEXT}&url=${TWEET_URL_PARAM}`;

const daysSince = (iso: string | Date | undefined): number => {
  if (!iso) return 0;
  const t = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
};

const hoursSaved = (ms: number | undefined): number => {
  if (!ms || ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 10) / 10;
};

export const SupportBanner: React.FC<{ stats: BannerStats | null }> = ({ stats }) => {
  const [eligible, setEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [shownLogged, setShownLogged] = useState(false);
  const [thanksMode, setThanksMode] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const api = (window as any).electronAPI;
        const settings = api?.appGetSettings ? await api.appGetSettings() : null;
        if (!alive) return;
        if (settings?.supportBannerDismissed) {
          setDismissed(true);
          return;
        }
        const totalSessions = stats?.totalSessions ?? 0;
        const age = daysSince(stats?.createdAt);
        setEligible(age >= DAYS_THRESHOLD || totalSessions >= SESSIONS_THRESHOLD);
      } catch {
        setEligible(false);
      }
    })();
    return () => { alive = false; };
  }, [stats?.totalSessions, stats?.createdAt]);

  useEffect(() => {
    if (!eligible || dismissed || shownLogged) return;
    const api = (window as any).electronAPI;
    if (api?.posthogCapture) {
      api.posthogCapture('support_banner_shown', {
        days_since_first_launch: daysSince(stats?.createdAt),
        total_sessions: stats?.totalSessions ?? 0,
        hours_saved: hoursSaved(stats?.estimatedTimeSavedMs)
      });
    }
    setShownLogged(true);
  }, [eligible, dismissed, shownLogged, stats]);

  if (!eligible || dismissed) return null;

  const persistDismiss = async () => {
    const api = (window as any).electronAPI;
    if (api?.appUpdateSettings) {
      try { await api.appUpdateSettings({ supportBannerDismissed: true }); } catch { /* ignore */ }
    }
  };

  const handleShare = async () => {
    const api = (window as any).electronAPI;
    if (api?.posthogCapture) api.posthogCapture('support_banner_share_clicked', {});
    if (api?.openExternal) {
      try { await api.openExternal(SHARE_INTENT); } catch { /* ignore */ }
    }
  };

  const handleStar = async () => {
    const api = (window as any).electronAPI;
    if (api?.posthogCapture) api.posthogCapture('support_banner_star_clicked', {});
    if (api?.openExternal) {
      try { await api.openExternal(GITHUB_URL); } catch { /* ignore */ }
    }
  };

  const handleAlreadyDid = async () => {
    const api = (window as any).electronAPI;
    if (api?.posthogCapture) api.posthogCapture('support_banner_already_did', {});
    setThanksMode(true);
    await persistDismiss();
    setTimeout(() => setDismissed(true), 2200);
  };

  const handleDismiss = async () => {
    const api = (window as any).electronAPI;
    if (api?.posthogCapture) api.posthogCapture('support_banner_dismissed', {});
    setDismissed(true);
    await persistDismiss();
  };

  const saved = hoursSaved(stats?.estimatedTimeSavedMs);

  if (thanksMode) {
    return (
      <div className={`relative ${theme.glass.primary} ${theme.radius.xl} p-5 mb-6 border border-white/10 overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.08] via-transparent to-rose-500/[0.06] pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border border-white/20 backdrop-blur-sm">
            <span className="text-lg">❤️</span>
          </div>
          <div className="flex-1">
            <h3 className={`text-base font-medium ${theme.text.primary} mb-0.5`}>Thank you</h3>
            <p className={`text-sm ${theme.text.tertiary}`}>
              Means a lot. Seriously — keep dictating. — Akshay
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${theme.glass.primary} ${theme.radius.xl} p-5 mb-6 border border-white/10 overflow-hidden`}>
      {/* warm accent — distinct from the cooler 2.0 banner */}
      <div className="absolute inset-0 bg-gradient-to-r from-rose-500/[0.06] via-transparent to-amber-500/[0.06] pointer-events-none" />

      <div className="relative flex items-start gap-4">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border border-white/20 backdrop-blur-sm shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 20 20" height="22px" viewBox="0 0 20 20" width="22px" fill="#ffffff">
            <rect fill="none" height="20" width="20" y="0" />
            <path d="M15.98,5.82L10,2.5L4.02,5.82l3.8,2.11C8.37,7.36,9.14,7,10,7s1.63,0.36,2.17,0.93L15.98,5.82z M8.5,10 c0-0.83,0.67-1.5,1.5-1.5s1.5,0.67,1.5,1.5s-0.67,1.5-1.5,1.5S8.5,10.83,8.5,10z M9.25,17.08l-6-3.33V7.11L7.1,9.24 C7.03,9.49,7,9.74,7,10c0,1.4,0.96,2.57,2.25,2.91V17.08z M10.75,17.08v-4.18C12.04,12.57,13,11.4,13,10c0-0.26-0.03-0.51-0.1-0.76 l3.85-2.14l0,6.64L10.75,17.08z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className={`text-base font-medium ${theme.text.primary}`}>A quick note from Akshay</h3>
            {saved > 0 && (
              <span className={`text-[10px] uppercase tracking-wider font-mono ${theme.text.quaternary}`}>
                you've saved {saved} hrs
              </span>
            )}
          </div>
          <p className={`text-sm ${theme.text.tertiary} leading-relaxed`}>
            Hey — I'm the only person building Jarvis. Nights and weekends, no paid tier, never will be. If it's saved you time, the single biggest help is telling one person who might use it too. A GitHub star helps Jarvis show up for others.
          </p>
          <p className={`text-sm ${theme.text.tertiary} leading-relaxed mt-2`}>
            Either, both, or neither — appreciate you using it.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button
              onClick={handleShare}
              className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition">
              Share with a friend
            </button>
            <button
              onClick={handleStar}
              className={`px-4 py-2 rounded-lg border border-white/15 ${theme.text.primary} text-sm hover:bg-white/[0.06] transition flex items-center gap-1.5`}>
              <span>★</span>
              <span>Star on GitHub</span>
            </button>
            <button
              onClick={handleAlreadyDid}
              className={`text-xs ${theme.text.tertiary} hover:${theme.text.secondary} transition`}>
              I already did
            </button>
            <button
              onClick={handleDismiss}
              className={`text-xs ${theme.text.quaternary} hover:${theme.text.tertiary} transition`}>
              thanks, I'll think about it
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
