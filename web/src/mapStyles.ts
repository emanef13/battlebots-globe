export interface MapStyle {
  id: string;
  label: string;
  /** texture styles set url; vector styles render land polygons instead */
  url?: string;
  atmosphere: string;
  /** optional RGB multiplier to brighten/darken a texture (1 = unchanged) */
  tint?: [number, number, number];
  vector?: {
    ocean: string;
    land: string;
    border: string;
    /** glowing city dots (Shopify-globe style); color or null to disable */
    cities: string | null;
  };
}

export const MAP_STYLES: MapStyle[] = [
  {
    id: 'vector-light',
    label: 'Vector — Pearl (crisp)',
    atmosphere: '#a8c4ff',
    vector: { ocean: '#33507c', land: '#e9edf4', border: '#b9c2d4', cities: '#ffd98a' },
  },
  {
    id: 'vector-dark',
    label: 'Vector — Midnight (crisp)',
    atmosphere: '#3987e5',
    vector: { ocean: '#182642', land: '#46587a', border: '#61749c', cities: '#ffd27a' },
  },
  { id: 'night-classic', label: 'Night — Classic', url: '/textures/earth-night.jpg', atmosphere: '#5b9ff0' },
  { id: 'blue-marble', label: 'Day — Blue Marble', url: '/textures/earth-blue-marble.jpg', atmosphere: '#6db3f2' },
];

/** Day view from 06:00 to 17:59 local time, night otherwise.
 * Overridable with ?mode=day or ?mode=night (handy for demos). */
function isDaytime(): boolean {
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'day') return true;
  if (mode === 'night') return false;
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18;
}

export const AUTO_ID = 'auto';

/** 'auto' or a style id -> concrete style (auto follows the viewer's clock). */
export function resolveMapStyle(id: string): MapStyle {
  if (id !== AUTO_ID) {
    const style = MAP_STYLES.find((s) => s.id === id);
    if (style) return style;
  }
  return MAP_STYLES.find((s) => s.id === (isDaytime() ? 'blue-marble' : 'night-classic'))!;
}
