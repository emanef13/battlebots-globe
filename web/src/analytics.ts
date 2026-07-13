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
  | 'filter_toggle';

let posthog: PostHog | null = null;

// PostHog client token — write-only and public by design (it ships in the
// bundle regardless); VITE_POSTHOG_KEY overrides it if ever rotated.
const KEY =
  (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ??
  'phc_veFzouaHTygMF2S3guUwSQnMHCiPnPTqFpPeUr4hTypf';
if (KEY) {
  import('posthog-js').then(({ default: ph }) => {
    ph.init(KEY, {
      api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com',
      autocapture: true,
      capture_pageview: true,
      person_profiles: 'identified_only',
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
