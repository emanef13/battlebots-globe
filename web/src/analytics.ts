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
  | 'fight_mode'
  | 'challenge_started'
  | 'video_play'
  | 'filter_toggle'
  | 'news_click'
  | 'chat_open'
  | 'chat_message';

let posthog: PostHog | null = null;

// PostHog client token comes from the Vercel env (Settings → Environment
// Variables → VITE_POSTHOG_KEY). Note it is a write-only public key and is
// visible in the shipped bundle either way — env keeps it out of the repo.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
if (KEY) {
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
  try {
    if (posthog) posthog.capture(name, props);
    track(name, props);
  } catch {
    // analytics must never break the app
  }
}
