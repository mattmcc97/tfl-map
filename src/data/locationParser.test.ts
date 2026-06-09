import { describe, expect, it } from 'vitest';
import { normalizeName, parseLocation } from './locationParser';

describe('parseLocation', () => {
  // Real strings observed in the TfL arrivals feed.
  it.each([
    ['At Warren Street', { kind: 'at', station: 'Warren Street' }],
    ['At Platform', { kind: 'atPlatform' }],
    ['At Platform 2', { kind: 'atPlatform' }],
    ['Between Pimlico and Victoria', { kind: 'between', from: 'Pimlico', to: 'Victoria' }],
    ['Left Euston', { kind: 'left', station: 'Euston' }],
    ['Departed Stockwell', { kind: 'left', station: 'Stockwell' }],
    ['Leaving Oval', { kind: 'left', station: 'Oval' }],
    ['Approaching Oxford Circus', { kind: 'approaching', station: 'Oxford Circus' }],
    ['', { kind: 'unknown' }],
    ['In the sidings', { kind: 'unknown' }],
    ['North Acton Junction', { kind: 'unknown' }],
  ])('parses %j', (input, expected) => {
    expect(parseLocation(input)).toEqual(expected);
  });

  it('never throws on odd input', () => {
    expect(parseLocation(null)).toEqual({ kind: 'unknown' });
    expect(parseLocation(undefined)).toEqual({ kind: 'unknown' });
  });
});

describe('normalizeName', () => {
  it('matches feed names to route-sequence names', () => {
    expect(normalizeName("King's Cross St. Pancras Underground Station")).toBe(
      normalizeName('Kings Cross St Pancras'),
    );
    expect(normalizeName('Harrow & Wealdstone')).toBe(normalizeName('Harrow and Wealdstone'));
    expect(normalizeName('Heathrow Terminals 2 & 3 Underground Station')).toBe(
      normalizeName('Heathrow Terminals 2 and 3'),
    );
  });
});
