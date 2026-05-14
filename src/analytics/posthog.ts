/**
 * Anonymous usage pulse — tells the maintainer "people are still dictating"
 * so the project can be improved with confidence that the work matters.
 *
 * What it sends (only when user's Settings.analytics toggle is on AND the
 * build has a key baked in):
 *   - that a dictation finished, with: word count, audio length, model, mode.
 *
 * What it never sends:
 *   - the transcribed text
 *   - your name, email, IP, file paths, app context, hotkey, dictionary
 *   - any account identifier
 *
 * The "user identifier" is a random UUID generated on first launch and
 * stored locally in userData. It cannot be reversed to anything real.
 *
 * In open-source builds the key is empty (gitignored .env file lives only
 * on the maintainer's build machine), so this entire module is a no-op.
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AppSettingsService } from '../services/app-settings-service';
import { Logger } from '../core/logger';

// Injected at build time by webpack DefinePlugin from process.env.POSTHOG_API_KEY.
// Empty string in open-source builds → this module is a no-op.
const POSTHOG_API_KEY: string = (process.env.POSTHOG_API_KEY || '').trim();
const POSTHOG_HOST = 'https://us.i.posthog.com';

interface QueuedEvent {
  event: string;
  properties: Record<string, any>;
  timestamp: string;
}

class PostHog {
  private distinctId: string | null = null;
  private queue: QueuedEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private appVersion: string = '';
  private readonly FLUSH_INTERVAL_MS = 30_000;
  private readonly MAX_QUEUE = 50;

  isEnabled(): boolean {
    if (!POSTHOG_API_KEY) return false;
    try {
      return AppSettingsService.getInstance().getSettings().analytics !== false;
    } catch {
      return false;
    }
  }

  private getDistinctId(): string {
    if (this.distinctId) return this.distinctId;
    try {
      const idPath = path.join(app.getPath('userData'), 'posthog-distinct-id');
      if (fs.existsSync(idPath)) {
        const stored = fs.readFileSync(idPath, 'utf8').trim();
        if (stored) {
          this.distinctId = stored;
          return stored;
        }
      }
      const fresh = crypto.randomUUID();
      fs.writeFileSync(idPath, fresh, 'utf8');
      this.distinctId = fresh;
      return fresh;
    } catch (e) {
      // If filesystem fails, fall back to in-memory ID (resets every launch).
      this.distinctId = crypto.randomUUID();
      return this.distinctId;
    }
  }

  private ensureAppVersion(): string {
    if (this.appVersion) return this.appVersion;
    try {
      this.appVersion = app.getVersion();
    } catch {
      this.appVersion = 'unknown';
    }
    return this.appVersion;
  }

  capture(event: string, properties: Record<string, any> = {}): void {
    if (!this.isEnabled()) return;
    this.queue.push({
      event,
      properties: {
        ...properties,
        $app_version: this.ensureAppVersion(),
        $os: process.platform,
        $arch: process.arch
      },
      timestamp: new Date().toISOString()
    });

    if (this.queue.length >= this.MAX_QUEUE) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.FLUSH_INTERVAL_MS);
  }

  async flush(): Promise<void> {
    if (!POSTHOG_API_KEY || this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    const distinct_id = this.getDistinctId();
    try {
      await fetch(`${POSTHOG_HOST}/batch/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: POSTHOG_API_KEY,
          batch: batch.map(b => ({
            event: b.event,
            distinct_id,
            properties: b.properties,
            timestamp: b.timestamp
          }))
        })
      });
    } catch (err) {
      // Never let analytics failures affect the app. Drop the batch.
      Logger.debug('[posthog] flush failed (ignored):', err);
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

export const posthog = new PostHog();
