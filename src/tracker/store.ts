import type { Train, TrainTarget } from '../types';

/** Polls a train can miss before it fades out (gone into a depot, id churn). */
const MAX_MISSED_POLLS = 2;

export class TrainStore {
  readonly trains = new Map<string, Train>();

  /** Folds a fresh set of estimator targets into the live train registry. */
  reconcile(targets: TrainTarget[]): void {
    const seen = new Set<string>();

    for (const target of targets) {
      seen.add(target.key);
      const existing = this.trains.get(target.key);

      if (!existing) {
        this.trains.set(target.key, {
          key: target.key,
          lineId: target.lineId,
          pos: lerp(target.from, target.to, target.progress),
          target,
          progress: target.progress,
          opacity: 0,
          state: 'entering',
          missedPolls: 0,
        });
        continue;
      }

      const sameSegment =
        existing.target.fromName === target.fromName &&
        existing.target.toName === target.toName;

      // On the same segment, never move backwards: dead reckoning may be
      // ahead of the fresh estimate and a reversal reads as a glitch.
      existing.progress = sameSegment
        ? Math.max(existing.progress, target.progress)
        : target.progress;
      existing.target = target;
      existing.missedPolls = 0;
      if (existing.state === 'leaving') existing.state = 'live';
    }

    for (const train of this.trains.values()) {
      if (seen.has(train.key)) continue;
      train.missedPolls++;
      if (train.missedPolls >= MAX_MISSED_POLLS) train.state = 'leaving';
    }
  }

  delete(key: string): void {
    this.trains.delete(key);
  }
}

export function lerp(
  a: [number, number],
  b: [number, number],
  t: number,
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
