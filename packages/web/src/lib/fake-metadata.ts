/**
 * Shared fake metadata types and random generation.
 *
 * All decoy data is intentionally obvious (retro devices, famous landmarks)
 * to make it clear this is a privacy tool, not a deception tool.
 */

export interface FakeMetadata {
  gps: { lat: number; lon: number; name: string };
  device: { make: string; model: string };
  dateTime: string;
}

// ---------------------------------------------------------------------------
// Predefined fake data pools
// ---------------------------------------------------------------------------

const FAKE_LOCATIONS = [
  { lat: 48.8584, lon: 2.2945, name: 'Eiffel Tower, Paris' },
  { lat: 40.6892, lon: -74.0445, name: 'Statue of Liberty, New York' },
  { lat: 40.4319, lon: 116.5704, name: 'Great Wall of China' },
  { lat: -33.8568, lon: 151.2153, name: 'Sydney Opera House' },
  { lat: 27.1751, lon: 78.0421, name: 'Taj Mahal, India' },
  { lat: 41.8902, lon: 12.4922, name: 'Colosseum, Rome' },
  { lat: 51.5014, lon: -0.1419, name: 'Big Ben, London' },
  { lat: 35.6762, lon: 139.6503, name: 'Tokyo Tower, Japan' },
];

const FAKE_DEVICES = [
  { make: 'Nokia', model: '3310' },
  { make: 'Motorola', model: 'RAZR V3' },
  { make: 'BlackBerry', model: 'Bold 9000' },
  { make: 'Sony Ericsson', model: 'W810i' },
  { make: 'Palm', model: 'Treo 650' },
  { make: 'HTC', model: 'Dream' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a cryptographically random integer in [0, max).
 * Uses crypto.getRandomValues() for proper randomness.
 */
function secureRandomInt(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

/**
 * Generates a random set of fake metadata values.
 * Each call produces a different combination of location, device, and date.
 */
export function getRandomFakeMetadata(): FakeMetadata {
  const loc = FAKE_LOCATIONS[secureRandomInt(FAKE_LOCATIONS.length)];
  const dev = FAKE_DEVICES[secureRandomInt(FAKE_DEVICES.length)];

  const year = 2020 + secureRandomInt(4);
  const month = String(secureRandomInt(12) + 1).padStart(2, '0');
  const day = String(secureRandomInt(28) + 1).padStart(2, '0');

  return {
    gps: loc,
    device: dev,
    dateTime: `${year}:${month}:${day} 12:00:00`,
  };
}

/**
 * Formats fake metadata into a short human-readable summary string.
 * E.g. "Nokia 3310 · Eiffel Tower, Paris · 2021-06-15"
 */
export function formatFakeMetadataSummary(fake: FakeMetadata): string {
  const device = `${fake.device.make} ${fake.device.model}`;
  const location = fake.gps.name;
  const date = fake.dateTime.split(' ')[0].replace(/:/g, '-');
  return `${device} · ${location} · ${date}`;
}
