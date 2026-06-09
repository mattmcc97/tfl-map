/**
 * Parses TfL `currentLocation` strings such as "At Warren Street",
 * "Between Pimlico and Victoria", "Left Euston", "Approaching Oxford Circus",
 * "At Platform". Never throws: anything unrecognised comes back as 'unknown'.
 */

export type ParsedLocation =
  | { kind: 'atPlatform' }
  | { kind: 'at'; station: string }
  | { kind: 'left'; station: string }
  | { kind: 'approaching'; station: string }
  | { kind: 'between'; from: string; to: string }
  | { kind: 'unknown' };

/**
 * Normalises a station name for matching: case, punctuation and the
 * "Underground Station" suffix all vary between the arrivals feed and the
 * route sequences.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(underground|rail|dlr)\b/g, ' ')
    .replace(/\bstation\b/g, ' ')
    .replace(/\bplatform\b.*$/, ' ')
    .replace(/&/g, 'and')
    .replace(/[’'.’-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const RE_AT_PLATFORM = /^(at|in)\s+platform\b/i;
const RE_BETWEEN = /^between\s+(.+?)\s+and\s+(.+)$/i;
const RE_AT = /^at\s+(.+)$/i;
const RE_LEFT = /^(?:left|departed|leaving|just left)\s+(.+)$/i;
const RE_APPROACHING = /^(?:approaching|arriving at)\s+(.+)$/i;

export function parseLocation(raw: string | undefined | null): ParsedLocation {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'unknown' };

  if (RE_AT_PLATFORM.test(text)) return { kind: 'atPlatform' };

  const between = RE_BETWEEN.exec(text);
  if (between) return { kind: 'between', from: between[1], to: between[2] };

  const left = RE_LEFT.exec(text);
  if (left) return { kind: 'left', station: left[1] };

  const approaching = RE_APPROACHING.exec(text);
  if (approaching) return { kind: 'approaching', station: approaching[1] };

  const at = RE_AT.exec(text);
  if (at) return { kind: 'at', station: at[1] };

  return { kind: 'unknown' };
}
