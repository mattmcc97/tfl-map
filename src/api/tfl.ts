import { API_BASE, APP_KEY, LINE_IDS, type LineId } from '../config';
import type { TflLineStatus, TflPrediction, TflRouteSequence } from '../types';

function url(path: string, params: Record<string, string> = {}): string {
  const u = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (APP_KEY) u.searchParams.set('app_key', APP_KEY);
  return u.toString();
}

async function getJson<T>(path: string, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(url(path), {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`TfL API ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

export function getArrivals(lineIds: LineId[] = LINE_IDS): Promise<TflPrediction[]> {
  return getJson<TflPrediction[]>(`/Line/${lineIds.join(',')}/Arrivals`);
}

export function getRouteSequence(
  lineId: LineId,
  direction: 'inbound' | 'outbound',
): Promise<TflRouteSequence> {
  return getJson<TflRouteSequence>(`/Line/${lineId}/Route/Sequence/${direction}`);
}

export function getStatus(): Promise<TflLineStatus[]> {
  return getJson<TflLineStatus[]>(`/Line/Mode/tube/Status`);
}
