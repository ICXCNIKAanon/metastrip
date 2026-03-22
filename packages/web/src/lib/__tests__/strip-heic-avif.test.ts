import { describe, it, expect } from 'vitest';
import { isHeic, stripHeic } from '../strip-heic';
import { isAvif, stripAvif } from '../strip-avif';

// ---------------------------------------------------------------------------
// Helpers (same pattern as strip-mp4.test.ts)
// ---------------------------------------------------------------------------

/** Builds an ISOBMFF box: [size 4B BE][type 4B][data] */
function makeBox(type: string, data: Uint8Array): Uint8Array {
  const size = 8 + data.length;
  const box = new Uint8Array(size);
  new DataView(box.buffer).setUint32(0, size);
  box[4] = type.charCodeAt(0);
  box[5] = type.charCodeAt(1);
  box[6] = type.charCodeAt(2);
  box[7] = type.charCodeAt(3);
  box.set(data, 8);
  return box;
}

/** Concatenates Uint8Arrays into a single ArrayBuffer. */
function concat(...parts: Uint8Array[]): ArrayBuffer {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out.buffer;
}

/** Returns true if the buffer contains a top-level box with the given type. */
function hasTopLevelBox(buffer: ArrayBuffer, type: string): boolean {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  while (offset + 8 <= buffer.byteLength) {
    const size = view.getUint32(offset);
    const t = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    if (t === type) return true;
    if (size < 8) break;
    offset += size;
  }
  return false;
}

/** Returns true if the moov box contains a child with the given type. */
function moovContainsBox(buffer: ArrayBuffer, childType: string): boolean {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  while (offset + 8 <= buffer.byteLength) {
    const size = view.getUint32(offset);
    const t = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    if (t === 'moov') {
      let inner = offset + 8;
      const moovEnd = offset + size;
      while (inner + 8 <= moovEnd) {
        const childSize = view.getUint32(inner);
        const ct = String.fromCharCode(bytes[inner + 4]!, bytes[inner + 5]!, bytes[inner + 6]!, bytes[inner + 7]!);
        if (ct === childType) return true;
        if (childSize < 8) break;
        inner += childSize;
      }
      return false;
    }
    if (size < 8) break;
    offset += size;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Build helpers for synthetic HEIC/AVIF files
// ---------------------------------------------------------------------------

/** Builds a ftyp box with the given major brand (4 chars). */
function makeFtyp(brand: string): Uint8Array {
  const data = new Uint8Array(8);
  // major brand (4 bytes)
  data[0] = brand.charCodeAt(0);
  data[1] = brand.charCodeAt(1);
  data[2] = brand.charCodeAt(2);
  data[3] = brand.charCodeAt(3);
  // minor version (4 bytes, zero)
  data[4] = 0x00; data[5] = 0x00; data[6] = 0x00; data[7] = 0x00;
  return makeBox('ftyp', data);
}

/** Minimal mvhd box */
function makeMvhd(): Uint8Array {
  return makeBox('mvhd', new Uint8Array(108).fill(0x00));
}

/** A udta box with some user metadata */
function makeUdta(): Uint8Array {
  const namData = new TextEncoder().encode('Test Image Title');
  const namBox = makeBox('\xA9nam', namData);
  return makeBox('udta', namBox);
}

/** A mdat box with dummy pixel data */
function makeMdat(size = 32): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = i & 0xFF;
  return makeBox('mdat', data);
}

/**
 * Builds a synthetic HEIC/AVIF buffer.
 * Structure: ftyp(brand) + moov(mvhd [+ udta]) + mdat
 */
function buildContainer(brand: string, includeUdta = true): ArrayBuffer {
  const ftyp = makeFtyp(brand);
  const mvhd = makeMvhd();
  const moovChildren: Uint8Array[] = [mvhd];
  if (includeUdta) moovChildren.push(makeUdta());

  const moovChildData = new Uint8Array(moovChildren.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of moovChildren) { moovChildData.set(c, off); off += c.length; }
  const moov = makeBox('moov', moovChildData);

  const mdat = makeMdat();
  return concat(ftyp, moov, mdat);
}

// ===========================================================================
// isHeic – detection tests
// ===========================================================================

describe('isHeic – detection', () => {
  it('returns true for brand "heic"', () => {
    expect(isHeic(buildContainer('heic'))).toBe(true);
  });

  it('returns true for brand "heix"', () => {
    expect(isHeic(buildContainer('heix'))).toBe(true);
  });

  it('returns true for brand "mif1"', () => {
    expect(isHeic(buildContainer('mif1'))).toBe(true);
  });

  it('returns true for brand "hevc"', () => {
    expect(isHeic(buildContainer('hevc'))).toBe(true);
  });

  it('returns true for brand "hevx"', () => {
    expect(isHeic(buildContainer('hevx'))).toBe(true);
  });

  it('returns false for AVIF brand "avif"', () => {
    expect(isHeic(buildContainer('avif'))).toBe(false);
  });

  it('returns false for AVIF brand "avis"', () => {
    expect(isHeic(buildContainer('avis'))).toBe(false);
  });

  it('returns false for MP4 brand "mp41"', () => {
    const data = new Uint8Array(8);
    data[0] = 0x6D; data[1] = 0x70; data[2] = 0x34; data[3] = 0x31; // mp41
    const ftyp = makeBox('ftyp', data);
    expect(isHeic(ftyp.buffer)).toBe(false);
  });

  it('returns false for JPEG', () => {
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(isHeic(jpeg.buffer)).toBe(false);
  });

  it('returns false for PNG', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    expect(isHeic(png.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isHeic(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a buffer shorter than 12 bytes', () => {
    expect(isHeic(new Uint8Array(10).buffer)).toBe(false);
  });

  it('returns false when no ftyp box at bytes 4-7', () => {
    const noFtyp = makeBox('moov', new Uint8Array(16));
    expect(isHeic(noFtyp.buffer)).toBe(false);
  });
});

// ===========================================================================
// isAvif – detection tests
// ===========================================================================

describe('isAvif – detection', () => {
  it('returns true for brand "avif"', () => {
    expect(isAvif(buildContainer('avif'))).toBe(true);
  });

  it('returns true for brand "avis"', () => {
    expect(isAvif(buildContainer('avis'))).toBe(true);
  });

  it('returns false for HEIC brand "heic"', () => {
    expect(isAvif(buildContainer('heic'))).toBe(false);
  });

  it('returns false for HEIC brand "heix"', () => {
    expect(isAvif(buildContainer('heix'))).toBe(false);
  });

  it('returns false for HEIC brand "mif1"', () => {
    expect(isAvif(buildContainer('mif1'))).toBe(false);
  });

  it('returns false for MP4 brand "mp41"', () => {
    const data = new Uint8Array(8);
    data[0] = 0x6D; data[1] = 0x70; data[2] = 0x34; data[3] = 0x31; // mp41
    const ftyp = makeBox('ftyp', data);
    expect(isAvif(ftyp.buffer)).toBe(false);
  });

  it('returns false for JPEG', () => {
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(isAvif(jpeg.buffer)).toBe(false);
  });

  it('returns false for PNG', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    expect(isAvif(png.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isAvif(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a buffer shorter than 12 bytes', () => {
    expect(isAvif(new Uint8Array(10).buffer)).toBe(false);
  });

  it('returns false when no ftyp box at bytes 4-7', () => {
    const noFtyp = makeBox('moov', new Uint8Array(16));
    expect(isAvif(noFtyp.buffer)).toBe(false);
  });
});

// ===========================================================================
// stripHeic – stripping tests
// ===========================================================================

describe('stripHeic – removes udta from moov', () => {
  it('removes udta from moov in a heic container', () => {
    const buf = buildContainer('heic', true);
    expect(moovContainsBox(buf, 'udta')).toBe(true); // sanity check

    const stripped = stripHeic(buf);
    expect(moovContainsBox(stripped, 'udta')).toBe(false);
  });

  it('output is smaller when udta is removed', () => {
    const buf = buildContainer('heic', true);
    const stripped = stripHeic(buf);
    expect(stripped.byteLength).toBeLessThan(buf.byteLength);
  });

  it('does not reduce size when there is no udta', () => {
    const buf = buildContainer('heic', false);
    const stripped = stripHeic(buf);
    expect(stripped.byteLength).toBe(buf.byteLength);
  });

  it('preserves ftyp at top level after stripping', () => {
    const buf = buildContainer('heic', true);
    const stripped = stripHeic(buf);
    expect(hasTopLevelBox(stripped, 'ftyp')).toBe(true);
  });

  it('preserves moov at top level after stripping', () => {
    const buf = buildContainer('heic', true);
    const stripped = stripHeic(buf);
    expect(hasTopLevelBox(stripped, 'moov')).toBe(true);
  });

  it('preserves mdat at top level after stripping', () => {
    const buf = buildContainer('heic', true);
    const stripped = stripHeic(buf);
    expect(hasTopLevelBox(stripped, 'mdat')).toBe(true);
  });

  it('preserves mvhd inside moov after stripping', () => {
    const buf = buildContainer('heic', true);
    const stripped = stripHeic(buf);
    expect(moovContainsBox(stripped, 'mvhd')).toBe(true);
  });

  it('works on heix brand too', () => {
    const buf = buildContainer('heix', true);
    const stripped = stripHeic(buf);
    expect(moovContainsBox(stripped, 'udta')).toBe(false);
    expect(hasTopLevelBox(stripped, 'ftyp')).toBe(true);
  });

  it('works on mif1 brand too', () => {
    const buf = buildContainer('mif1', true);
    const stripped = stripHeic(buf);
    expect(moovContainsBox(stripped, 'udta')).toBe(false);
    expect(hasTopLevelBox(stripped, 'ftyp')).toBe(true);
  });
});

// ===========================================================================
// stripAvif – stripping tests
// ===========================================================================

describe('stripAvif – removes udta from moov', () => {
  it('removes udta from moov in an avif container', () => {
    const buf = buildContainer('avif', true);
    expect(moovContainsBox(buf, 'udta')).toBe(true); // sanity check

    const stripped = stripAvif(buf);
    expect(moovContainsBox(stripped, 'udta')).toBe(false);
  });

  it('output is smaller when udta is removed', () => {
    const buf = buildContainer('avif', true);
    const stripped = stripAvif(buf);
    expect(stripped.byteLength).toBeLessThan(buf.byteLength);
  });

  it('does not reduce size when there is no udta', () => {
    const buf = buildContainer('avif', false);
    const stripped = stripAvif(buf);
    expect(stripped.byteLength).toBe(buf.byteLength);
  });

  it('preserves ftyp at top level after stripping', () => {
    const buf = buildContainer('avif', true);
    const stripped = stripAvif(buf);
    expect(hasTopLevelBox(stripped, 'ftyp')).toBe(true);
  });

  it('preserves moov at top level after stripping', () => {
    const buf = buildContainer('avif', true);
    const stripped = stripAvif(buf);
    expect(hasTopLevelBox(stripped, 'moov')).toBe(true);
  });

  it('preserves mdat at top level after stripping', () => {
    const buf = buildContainer('avif', true);
    const stripped = stripAvif(buf);
    expect(hasTopLevelBox(stripped, 'mdat')).toBe(true);
  });

  it('preserves mvhd inside moov after stripping', () => {
    const buf = buildContainer('avif', true);
    const stripped = stripAvif(buf);
    expect(moovContainsBox(stripped, 'mvhd')).toBe(true);
  });

  it('works on avis brand too', () => {
    const buf = buildContainer('avis', true);
    const stripped = stripAvif(buf);
    expect(moovContainsBox(stripped, 'udta')).toBe(false);
    expect(hasTopLevelBox(stripped, 'ftyp')).toBe(true);
  });
});

// ===========================================================================
// Cross-format non-detection
// ===========================================================================

describe('cross-format detection sanity checks', () => {
  it('isHeic does not detect avif brand', () => {
    const buf = buildContainer('avif', false);
    expect(isHeic(buf)).toBe(false);
  });

  it('isAvif does not detect heic brand', () => {
    const buf = buildContainer('heic', false);
    expect(isAvif(buf)).toBe(false);
  });

  it('isHeic does not detect avis brand', () => {
    const buf = buildContainer('avis', false);
    expect(isHeic(buf)).toBe(false);
  });

  it('isAvif does not detect heix brand', () => {
    const buf = buildContainer('heix', false);
    expect(isAvif(buf)).toBe(false);
  });
});
