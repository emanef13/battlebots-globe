import { track } from '@vercel/analytics';
import type { PostHog } from 'posthog-js';

/** Custom-event names kept to a small fixed set; detail goes in the
 * properties. Events go to PostHog when a key is configured (Vercel's
 * Hobby plan doesn't expose custom events) and to Vercel otherwise —
 * harmless there, and useful if the project ever moves to Pro. */
type AppEvent =
  | 'bot_selected'
  | 'search_select'
  | 'country_focus'
  | 'team_focus'
  | 'fight_mode'
  | 'challenge_started'
  | 'video_play'
  | 'filter_toggle'
  | 'news_click'
  | 'chat_open'
  | 'chat_message';

let posthog: PostHog | null = null;

// Owner opt-out: visiting /?notrack=1 once flags this browser and every
// kind of tracking (PostHog + Vercel) stays off on it; /?notrack=0 undoes.
const NT_FLAG = 'bb-notrack';
{
  const nt = new URLSearchParams(window.location.search).get('notrack');
  if (nt === '1') localStorage.setItem(NT_FLAG, '1');
  if (nt === '0') localStorage.removeItem(NT_FLAG);
  if (nt !== null) {
    const off = localStorage.getItem(NT_FLAG) === '1';
    const note = document.createElement('div');
    note.textContent = off ? 'Analytics disabled on this device' : 'Analytics re-enabled on this device';
    note.style.cssText =
      'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99;' +
      'padding:10px 18px;border-radius:10px;background:#141a2c;color:#fff;' +
      'border:1px solid rgba(237,161,0,.6);font:600 14px system-ui;';
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 3500);
  }
}
export const TRACKING_OFF = localStorage.getItem(NT_FLAG) === '1';

// PostHog client token comes from the Vercel env (Settings → Environment
// Variables → VITE_POSTHOG_KEY). Note it is a write-only public key and is
// visible in the shipped bundle either way — env keeps it out of the repo.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
if (KEY && !TRACKING_OFF) {
  import('posthog-js').then(({ default: ph }) => {
    ph.init(KEY, {
      api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com',
      autocapture: true,
      capture_pageview: true,
      person_profiles: 'identified_only',
      debug: import.meta.env.DEV,
      loaded: (p) => {
        if (import.meta.env.DEV) console.log('[ph] loaded, distinct_id:', p.get_distinct_id());
      },
    });
    posthog = ph;
  });
}

export function trackEvent(
  name: AppEvent,
  props?: Record<string, string | number | boolean>,
): void {
  if (TRACKING_OFF) return;
  try {
    if (posthog) posthog.capture(name, props);
    track(name, props);
  } catch {
    // analytics must never break the app
  }
}
