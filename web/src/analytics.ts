import { track } from '@vercel/analytics';

/** Custom-event names kept to a small fixed set (Vercel counts distinct
 * events against plan quotas); detail goes in the properties. */
type AppEvent =
  | 'bot_selected'
  | 'search_select'
  | 'country_focus'
  | 'fight_mode'
  | 'challenge_started'
  | 'video_play'
  | 'filter_toggle';

export function trackEvent(
  name: AppEvent,
  props?: Record<string, string | number | boolean>,
): void {
  try {
    track(name, props);
  } catch {
    // analytics must never break the app
  }
}
