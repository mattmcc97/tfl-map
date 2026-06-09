import type { LineId } from '../config';
import { DEFAULT_SEG_SECONDS } from '../config';
import { parseLocation, normalizeName, type ParsedLocation } from '../data/locationParser';
import { estimateSegSeconds } from '../data/network';
import type {
  Branch,
  Direction,
  EstimateResult,
  LineModel,
  NetworkModel,
  TflPrediction,
  TrainTarget,
} from '../types';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Station the train was last at, according to the currentLocation text. */
function parsedPrevId(parsed: ParsedLocation, line: LineModel): string | null {
  let name: string | null = null;
  if (parsed.kind === 'at' || parsed.kind === 'left') name = parsed.station;
  else if (parsed.kind === 'between') name = parsed.from;
  if (!name) return null;
  return line.nameToNaptan.get(normalizeName(name)) ?? null;
}

interface SegmentPick {
  branch: Branch;
  nextIdx: number;
}

/**
 * Picks the branch (and the index of the next station in it) that best matches
 * what we know: a parsed previous station beats a destination check beats the
 * first branch that contains the next station at all.
 */
export function pickSegment(
  line: LineModel,
  direction: Direction | '',
  nextId: string,
  prevId: string | null,
  destinationName: string | undefined,
): SegmentPick | null {
  const dirs: Direction[] =
    direction === 'inbound' || direction === 'outbound'
      ? [direction]
      : ['inbound', 'outbound'];

  const candidates: SegmentPick[] = [];
  for (const dir of dirs) {
    for (const branch of line.directions[dir]) {
      const nextIdx = branch.index.get(nextId);
      if (nextIdx === undefined) continue;
      candidates.push({ branch, nextIdx });
    }
  }
  if (candidates.length === 0) return null;

  // a) the branch where the parsed previous station immediately precedes next
  if (prevId) {
    const exact = candidates.find(
      (c) => c.nextIdx > 0 && c.branch.stops[c.nextIdx - 1].naptanId === prevId,
    );
    if (exact) return exact;
  }

  // b) the branch heading towards the advertised destination
  const destId = destinationName
    ? line.nameToNaptan.get(normalizeName(destinationName))
    : undefined;
  if (destId) {
    const towardsDest = candidates.find((c) => {
      const destIdx = c.branch.index.get(destId);
      return c.nextIdx > 0 && destIdx !== undefined && destIdx > c.nextIdx;
    });
    if (towardsDest) return towardsDest;
  }

  // c) any branch where next has a predecessor, else whatever we have
  return candidates.find((c) => c.nextIdx > 0) ?? candidates[0];
}

/** Blends the timetable-style estimate with what the location text tells us. */
export function blendProgress(base: number, parsed: ParsedLocation, atPrev: boolean): number {
  switch (parsed.kind) {
    case 'at':
      return atPrev ? 0 : base;
    case 'left':
      return Math.max(base, 0.1);
    case 'between':
      return Math.min(0.85, Math.max(0.15, base));
    case 'approaching':
      return Math.max(base, 0.8);
    case 'atPlatform':
      return 1;
    default:
      return base;
  }
}

export function estimateTargets(
  predictions: TflPrediction[],
  network: NetworkModel,
): EstimateResult {
  const byTrain = new Map<string, TflPrediction[]>();
  let untracked = 0;

  for (const p of predictions) {
    if (!network.lines.has(p.lineId)) continue;
    if (!p.vehicleId || p.vehicleId === '000') {
      untracked++;
      continue;
    }
    const key = `${p.lineId}:${p.vehicleId}`;
    const group = byTrain.get(key);
    if (group) group.push(p);
    else byTrain.set(key, [p]);
  }

  const targets: TrainTarget[] = [];
  const countsByLine = new Map<LineId, number>();

  for (const [key, group] of byTrain) {
    // A vehicle can have several predictions for one station (one per
    // platform); keep the soonest per station, then take the soonest overall.
    const byStation = new Map<string, TflPrediction>();
    for (const p of group) {
      const existing = byStation.get(p.naptanId);
      if (!existing || p.timeToStation < existing.timeToStation) byStation.set(p.naptanId, p);
    }
    const next = [...byStation.values()].sort((a, b) => a.timeToStation - b.timeToStation)[0];

    const line = network.lines.get(next.lineId)!;
    const nextStop = network.stations.get(next.naptanId);
    if (!nextStop) continue; // station outside the route model (depot, sidings)

    const parsed = parseLocation(next.currentLocation);
    const prevId = parsedPrevId(parsed, line);
    const pick = pickSegment(line, next.direction, next.naptanId, prevId, next.destinationName);

    let from = nextStop;
    let segSeconds = DEFAULT_SEG_SECONDS;

    if (pick && pick.nextIdx > 0) {
      from = pick.branch.stops[pick.nextIdx - 1];
      segSeconds = pick.branch.segSeconds[pick.nextIdx - 1];
    } else if (prevId && prevId !== next.naptanId) {
      // Next is a branch start (Circle loop seam, terminus) but the location
      // text still names the previous station — synthesise the segment.
      const prevStop = network.stations.get(prevId);
      if (prevStop) {
        from = prevStop;
        segSeconds = estimateSegSeconds(prevStop.lngLat, nextStop.lngLat);
      }
    }

    let progress: number;
    if (from.naptanId === nextStop.naptanId) {
      progress = 1; // nowhere to come from: hold at the station
    } else {
      const base = clamp01(1 - next.timeToStation / segSeconds);
      const atPrev = parsed.kind === 'at' && prevId === from.naptanId;
      progress = next.timeToStation <= 15 ? 1 : blendProgress(base, parsed, atPrev);
    }

    targets.push({
      key,
      lineId: next.lineId,
      from: from.lngLat,
      to: nextStop.lngLat,
      fromName: from.name,
      toName: nextStop.name,
      progress,
      segSeconds,
      meta: {
        destination: (next.destinationName ?? next.towards ?? '').replace(
          / Underground Station$/i,
          '',
        ),
        currentLocation: next.currentLocation,
        timeToStation: next.timeToStation,
        towards: next.towards,
      },
    });
    countsByLine.set(next.lineId, (countsByLine.get(next.lineId) ?? 0) + 1);
  }

  return { targets, untracked, countsByLine };
}
