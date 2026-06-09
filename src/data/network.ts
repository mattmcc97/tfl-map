import {
  AVG_SPEED_KMH,
  LINE_COLORS,
  LINE_IDS,
  MAX_SEG_SECONDS,
  MIN_SEG_SECONDS,
  ROUTE_CACHE_KEY,
  ROUTE_CACHE_TTL_MS,
  type LineId,
} from '../config';
import { getRouteSequence } from '../api/tfl';
import { normalizeName } from './locationParser';
import type { Branch, Direction, LineModel, NetworkModel, Stop, TflRouteSequence } from '../types';

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function estimateSegSeconds(a: [number, number], b: [number, number]): number {
  const seconds = (haversineKm(a, b) / AVG_SPEED_KMH) * 3600;
  return Math.min(MAX_SEG_SECONDS, Math.max(MIN_SEG_SECONDS, Math.round(seconds)));
}

function buildBranch(stops: Stop[]): Branch {
  const index = new Map<string, number>();
  stops.forEach((s, i) => index.set(s.naptanId, i));
  const segSeconds: number[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    segSeconds.push(estimateSegSeconds(stops[i].lngLat, stops[i + 1].lngLat));
  }
  return { stops, index, segSeconds };
}

export function buildNetwork(sequences: TflRouteSequence[]): NetworkModel {
  const lines = new Map<LineId, LineModel>();
  const stations = new Map<string, Stop>();

  for (const seq of sequences) {
    let line = lines.get(seq.lineId);
    if (!line) {
      line = {
        id: seq.lineId,
        color: LINE_COLORS[seq.lineId],
        directions: { inbound: [], outbound: [] },
        nameToNaptan: new Map(),
      };
      lines.set(seq.lineId, line);
    }
    const direction: Direction = seq.direction === 'inbound' ? 'inbound' : 'outbound';
    for (const sps of seq.stopPointSequences ?? []) {
      const stops: Stop[] = sps.stopPoint.map((p) => ({
        naptanId: p.id,
        name: p.name.replace(/ Underground Station$/i, ''),
        lngLat: [p.lon, p.lat],
      }));
      if (stops.length < 2) continue;
      line.directions[direction].push(buildBranch(stops));
      for (const s of stops) {
        if (!stations.has(s.naptanId)) stations.set(s.naptanId, s);
        line.nameToNaptan.set(normalizeName(s.name), s.naptanId);
      }
    }
  }
  return { lines, stations };
}

interface RouteCache {
  savedAt: number;
  sequences: TflRouteSequence[];
}

function readCache(): TflRouteSequence[] | null {
  try {
    const raw = localStorage.getItem(ROUTE_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as RouteCache;
    if (Date.now() - cache.savedAt > ROUTE_CACHE_TTL_MS) return null;
    if (!Array.isArray(cache.sequences) || cache.sequences.length === 0) return null;
    return cache.sequences;
  } catch {
    return null;
  }
}

function writeCache(sequences: TflRouteSequence[]): void {
  try {
    localStorage.setItem(
      ROUTE_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), sequences } satisfies RouteCache),
    );
  } catch {
    // Storage full or unavailable — fine, we just refetch next load.
  }
}

/** Loads all route sequences (22 requests on a cold start) and builds the model. */
export async function loadNetwork(): Promise<NetworkModel> {
  const cached = readCache();
  if (cached) return buildNetwork(cached);

  const requests: Promise<TflRouteSequence>[] = [];
  for (const lineId of LINE_IDS) {
    for (const direction of ['inbound', 'outbound'] as const) {
      requests.push(
        getRouteSequence(lineId, direction).then((seq) => ({
          // The API echoes lineId/direction, but pin them so the cache is self-describing.
          ...seq,
          lineId,
          direction,
        })),
      );
    }
  }
  const sequences = await Promise.all(requests);
  writeCache(sequences);
  return buildNetwork(sequences);
}
