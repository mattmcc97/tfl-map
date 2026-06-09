export type LineId =
  | 'bakerloo'
  | 'central'
  | 'circle'
  | 'district'
  | 'hammersmith-city'
  | 'jubilee'
  | 'metropolitan'
  | 'northern'
  | 'piccadilly'
  | 'victoria'
  | 'waterloo-city';

export const LINE_IDS: LineId[] = [
  'bakerloo',
  'central',
  'circle',
  'district',
  'hammersmith-city',
  'jubilee',
  'metropolitan',
  'northern',
  'piccadilly',
  'victoria',
  'waterloo-city',
];

/** Official TfL line colours. */
export const LINE_COLORS: Record<LineId, string> = {
  bakerloo: '#B36305',
  central: '#E32017',
  circle: '#FFD300',
  district: '#00782A',
  'hammersmith-city': '#F3A9BB',
  jubilee: '#A0A5A9',
  metropolitan: '#9B0056',
  northern: '#2E2E33',
  piccadilly: '#0044AA',
  victoria: '#0098D4',
  'waterloo-city': '#95CDBA',
};

export const LINE_NAMES: Record<LineId, string> = {
  bakerloo: 'Bakerloo',
  central: 'Central',
  circle: 'Circle',
  district: 'District',
  'hammersmith-city': 'H’smith & City',
  jubilee: 'Jubilee',
  metropolitan: 'Metropolitan',
  northern: 'Northern',
  piccadilly: 'Piccadilly',
  victoria: 'Victoria',
  'waterloo-city': 'W’loo & City',
};

export const API_BASE = 'https://api.tfl.gov.uk';

/** Optional TfL app key, baked at build time when provided. */
export const APP_KEY: string = import.meta.env?.VITE_TFL_APP_KEY ?? '';

/** Arrivals poll cadence. */
export const POLL_MS = 27_500;
/** Refresh line status every N polls. */
export const STATUS_EVERY_N_POLLS = 4;
/** Mark the feed stale after this long without a successful poll. */
export const STALE_AFTER_MS = 90_000;

/** Assumed average inter-station speed, used to estimate segment travel time. */
export const AVG_SPEED_KMH = 33;
export const MIN_SEG_SECONDS = 60;
export const MAX_SEG_SECONDS = 240;
export const DEFAULT_SEG_SECONDS = 120;

export const BASEMAP_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';

export const MAP_CENTER: [number, number] = [-0.1276, 51.509];
export const MAP_ZOOM = 11.2;
export const MAP_MIN_ZOOM = 8.5;
export const MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-1.3, 51.15],
  [0.9, 51.85],
];

export const ROUTE_CACHE_KEY = 'tfl-routes-v1';
export const ROUTE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
