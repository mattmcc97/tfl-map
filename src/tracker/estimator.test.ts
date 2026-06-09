import { describe, expect, it } from 'vitest';
import { buildNetwork } from '../data/network';
import { blendProgress, estimateTargets, pickSegment } from './estimator';
import type { TflPrediction, TflRouteSequence } from '../types';

// A miniature Northern line: two outbound branches that share Kennington but
// diverge afterwards (via Bank vs via Charing Cross), like the real thing.
const stop = (id: string, name: string, lon: number, lat: number) => ({ id, name, lat, lon });

const northern: TflRouteSequence = {
  lineId: 'northern',
  direction: 'outbound',
  stopPointSequences: [
    {
      branchId: 1,
      direction: 'outbound',
      stopPoint: [
        stop('KEN', 'Kennington Underground Station', -0.105, 51.488),
        stop('WAT', 'Waterloo Underground Station', -0.113, 51.503),
        stop('CHX', 'Charing Cross Underground Station', -0.124, 51.508),
        stop('EUS', 'Euston Underground Station', -0.133, 51.528),
      ],
    },
    {
      branchId: 2,
      direction: 'outbound',
      stopPoint: [
        stop('KEN', 'Kennington Underground Station', -0.105, 51.488),
        stop('BOR', 'Borough Underground Station', -0.094, 51.501),
        stop('BNK', 'Bank Underground Station', -0.089, 51.513),
        stop('EUS', 'Euston Underground Station', -0.133, 51.528),
      ],
    },
  ],
};

const network = buildNetwork([northern]);
const line = network.lines.get('northern')!;

const prediction = (overrides: Partial<TflPrediction>): TflPrediction => ({
  id: '1',
  vehicleId: '101',
  naptanId: 'EUS',
  stationName: 'Euston Underground Station',
  lineId: 'northern',
  platformName: '',
  direction: 'outbound',
  destinationName: 'Euston Underground Station',
  timeToStation: 60,
  currentLocation: '',
  towards: 'Euston',
  expectedArrival: '',
  ...overrides,
});

describe('pickSegment', () => {
  it('prefers the branch where the parsed previous station precedes next', () => {
    const viaBank = pickSegment(line, 'outbound', 'EUS', 'BNK', undefined);
    expect(viaBank?.branch.stops[viaBank.nextIdx - 1].naptanId).toBe('BNK');

    const viaCharingCross = pickSegment(line, 'outbound', 'EUS', 'CHX', undefined);
    expect(viaCharingCross?.branch.stops[viaCharingCross.nextIdx - 1].naptanId).toBe('CHX');
  });

  it('falls back to the branch containing the destination beyond next', () => {
    const pick = pickSegment(line, 'outbound', 'BOR', null, 'Bank Underground Station');
    expect(pick?.branch.stops[pick.nextIdx - 1].naptanId).toBe('KEN');
  });

  it('returns null when the station is not on the line', () => {
    expect(pickSegment(line, 'outbound', 'NOPE', null, undefined)).toBeNull();
  });
});

describe('estimateTargets', () => {
  it('places a train between stations using the parsed location', () => {
    const result = estimateTargets(
      [
        prediction({
          currentLocation: 'Between Bank and Euston',
          timeToStation: 90,
        }),
      ],
      network,
    );
    expect(result.targets).toHaveLength(1);
    const target = result.targets[0];
    expect(target.fromName).toBe('Bank');
    expect(target.toName).toBe('Euston');
    expect(target.progress).toBeGreaterThan(0);
    expect(target.progress).toBeLessThan(1);
  });

  it('drops placeholder vehicle ids and counts them as untracked', () => {
    const result = estimateTargets([prediction({ vehicleId: '000' })], network);
    expect(result.targets).toHaveLength(0);
    expect(result.untracked).toBe(1);
  });

  it('keeps only the soonest prediction per vehicle', () => {
    const result = estimateTargets(
      [
        prediction({ naptanId: 'EUS', timeToStation: 300 }),
        prediction({ id: '2', naptanId: 'BNK', timeToStation: 30, currentLocation: 'Left Borough' }),
      ],
      network,
    );
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].toName).toBe('Bank');
    expect(result.targets[0].fromName).toBe('Borough');
  });

  it('holds at the station when there is no previous stop', () => {
    const result = estimateTargets(
      [prediction({ naptanId: 'KEN', currentLocation: '', timeToStation: 10 })],
      network,
    );
    expect(result.targets[0].progress).toBe(1);
    expect(result.targets[0].fromName).toBe(result.targets[0].toName);
  });
});

describe('blendProgress', () => {
  it('pins to the platform and clamps between-station readings', () => {
    expect(blendProgress(0.5, { kind: 'atPlatform' }, false)).toBe(1);
    expect(blendProgress(0.02, { kind: 'between', from: 'A', to: 'B' }, false)).toBe(0.15);
    expect(blendProgress(0.99, { kind: 'between', from: 'A', to: 'B' }, false)).toBe(0.85);
    expect(blendProgress(0.4, { kind: 'at', station: 'A' }, true)).toBe(0);
    expect(blendProgress(0.4, { kind: 'approaching', station: 'B' }, false)).toBe(0.8);
  });
});
