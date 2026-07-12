export interface Team {
  id: string;
  bot: string;
  team: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number;
  lng: number;
  weapon: string | null;
  seasons: string[];
  active: boolean;
  builder: string | null;
  photo: string | null;
  /** circular robot-badge image rendered as the globe marker */
  marker?: string | null;
  /** verified team page (fandom wiki) */
  url?: string | null;
}

export interface TeamsFile {
  generated_at: string;
  source: string;
  placeholder?: boolean;
  teams: Team[];
}

/** A team projected onto the globe — same-city teams get spread slightly apart. */
export interface GlobePoint extends Team {
  glat: number;
  glng: number;
}

export interface Fight {
  a: string;
  b: string;
  winner: string | null;
  season: string | null;
  method: string | null;
}

export interface FightsFile {
  generated_at: string;
  source: string;
  fights: Fight[];
}

export interface FightVideo {
  id: string;
  title: string;
  channel: string;
  views: number;
  duration: string;
}

export interface VideosFile {
  generated_at: string;
  source: string;
  videos: Record<string, FightVideo[]>;
}

/** One fight video per head-to-head pair, keyed "a|b" (ids, a<b). */
export interface MatchVideosFile {
  generated_at: string;
  source: string;
  videos: Record<string, FightVideo>;
}
