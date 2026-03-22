import { describe, it, expect } from 'vitest';
import { isMp4, stripMp4 } from '../strip-mp4';

// ---------------------------------------------------------------------------
// Helpers
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

/** Reads a big-endian uint32 from an ArrayBuffer at the given offset. */
function readUint32BE(buffer: ArrayBuffer, offset: number): number {
  return new DataView(buffer).getUint32(offset, false);
}

/** Returns the 4-char type of the box at the given byte offset. */
function boxTypeAt(buffer: ArrayBuffer, offset: number): string {
  const bytes = new Uint8Array(buffer, offset, 8);
  return String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
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

/** Returns the size of the first top-level box with the given type, or -1. */
function topLevelBoxSize(buffer: ArrayBuffer, type: string): number {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  while (offset + 8 <= buffer.byteLength) {
    const size = view.getUint32(offset);
    const t = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    if (t === type) return size;
    if (size < 8) break;
    offset += size;
  }
  return -1;
}

/** Returns true if the moov box (assumed to be first or second box) contains a child with the given type. */
function moovContainsBox(buffer: ArrayBuffer, childType: string): boolean {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // Find moov
  let offset = 0;
  while (offset + 8 <= buffer.byteLength) {
    const size = view.getUint32(offset);
    const t = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    if (t === 'moov') {
      // Walk children
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
// Build helpers for synthetic MP4-like files
// ---------------------------------------------------------------------------

/** Minimal ftyp box with brand 'mp41' */
function makeFtyp(): Uint8Array {
  // ftyp: major brand (4) + minor version (4) + compatible brands (4 each)
  const data = new Uint8Array(8);
  data[0] = 0x6D; data[1] = 0x70; data[2] = 0x34; data[3] = 0x31; // 'mp41'
  data[4] = 0x00; data[5] = 0x00; data[6] = 0x00; data[7] = 0x00; // minor version
  return makeBox('ftyp', data);
}

/** Minimal mvhd box (movie header, 108 bytes of data) */
function makeMvhd(): Uint8Array {
  return makeBox('mvhd', new Uint8Array(108).fill(0x00));
}

/** Minimal trak box with some dummy data */
function makeTrak(): Uint8Array {
  return makeBox('trak', new Uint8Array(32).fill(0xAB));
}

/** A udta box with some user metadata */
function makeUdta(): Uint8Array {
  // ©nam atom inside udta
  const namData = new TextEncoder().encode('Test Video Title');
  const namBox = makeBox('\xA9nam', namData);
  return makeBox('udta', namBox);
}

/** A top-level meta box */
function makeMetaBox(): Uint8Array {
  return makeBox('meta', new Uint8Array(32).fill(0xBB));
}

/** A top-level uuid box (XMP container) */
function makeUuidBox(): Uint8Array {
  return makeBox('uuid', new Uint8Array(48).fill(0xCC));
}

/** A mdat box with dummy media data */
function makeMdat(size = 64): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = i & 0xFF;
  return makeBox('mdat', data);
}

/**
 * Builds a synthetic MP4 buffer.
 * Structure: ftyp + moov (mvhd + trak [+ udta]) + mdat
 */
function buildMp4(options: {
  includeUdta?: boolean;
  includeTopLevelMeta?: boolean;
  includeTopLevelUuid?: boolean;
  mdatSize?: number;
} = {}): ArrayBuffer {
  const {
    includeUdta = true,
    includeTopLevelMeta = false,
    includeTopLevelUuid = false,
    mdatSize = 64,
  } = options;

  const ftyp = makeFtyp();
  const mvhd = makeMvhd();
  const trak = makeTrak();
  const udta = includeUdta ? makeUdta() : null;

  // Build moov children
  const moovChildren: Uint8Array[] = [mvhd, trak];
  if (udta) moovChildren.push(udta);
  const moovChildData = new Uint8Array(moovChildren.reduce((s, c) => s + c.length, 0));
  let off = 0;
  for (const c of moovChildren) { moovChildData.set(c, off); off += c.length; }
  const moov = makeBox('moov', moovChildData);

  const mdat = makeMdat(mdatSize);

  const parts: Uint8Array[] = [ftyp, moov, mdat];
  if (includeTopLevelMeta) parts.push(makeMetaBox());
  if (includeTopLevelUuid) parts.push(makeUuidBox());

  return concat(...parts);
}

// ===========================================================================
// isMp4 Tests
// ===========================================================================

describe('isMp4 – detection', () => {
  it('returns true for a buffer with ftyp box', () => {
    const buf = buildMp4();
    expect(isMp4(buf)).toBe(true);
  });

  it('returns true for a buffer starting with moov box', () => {
    const mvhd = makeMvhd();
    const moov = makeBox('moov', mvhd);
    const buf = concat(moov);
    expect(isMp4(buf)).toBe(true);
  });

  it('returns true for a buffer starting with mdat', () => {
    const mdat = makeMdat();
    expect(isMp4(mdat.buffer)).toBe(true);
  });

  it('returns true for a buffer starting with wide', () => {
    const wide = makeBox('wide', new Uint8Array(4));
    expect(isMp4(wide.buffer)).toBe(true);
  });

  it('returns true for a buffer starting with free', () => {
    const free = makeBox('free', new Uint8Array(4));
    expect(isMp4(free.buffer)).toBe(true);
  });

  it('returns false for a JPEG buffer', () => {
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(isMp4(jpeg.buffer)).toBe(false);
  });

  it('returns false for an MP3 buffer', () => {
    const mp3 = new Uint8Array([0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(isMp4(mp3.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isMp4(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a buffer shorter than 12 bytes', () => {
    expect(isMp4(new Uint8Array(10).buffer)).toBe(false);
  });

  it('returns false for a PNG buffer', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
    expect(isMp4(png.buffer)).toBe(false);
  });
});

// ===========================================================================
// stripMp4 – udta removal
// ===========================================================================

describe('stripMp4 – removes udta box inside moov', () => {
  it('removes the udta box from inside moov', () => {
    const buf = buildMp4({ includeUdta: true });
    expect(moovContainsBox(buf, 'udta')).toBe(true); // sanity check

    const stripped = stripMp4(buf);
    expect(moovContainsBox(stripped, 'udta')).toBe(false);
  });

  it('output is smaller when udta is removed', () => {
    const buf = buildMp4({ includeUdta: true });
    const stripped = stripMp4(buf);
    expect(stripped.byteLength).toBeLessThan(buf.byteLength);
  });

  it('does not reduce size when there is no udta', () => {
    const buf = buildMp4({ includeUdta: false });
    const stripped = stripMp4(buf);
    // Size should be equal (nothing to remove)
    expect(stripped.byteLength).toBe(buf.byteLength);
  });
});

// ===========================================================================
// stripMp4 – preserves essential boxes
// ===========================================================================

describe('stripMp4 – preserves essential boxes', () => {
  it('preserves ftyp at top level', () => {
    const buf = buildMp4({ includeUdta: true });
    const stripped = stripMp4(buf);
    expect(hasTopLevelBox(stripped, 'ftyp')).toBe(true);
  });

  it('preserves moov at top level', () => {
    const buf = buildMp4({ includeUdta: true });
    const stripped = stripMp4(buf);
    expect(hasTopLevelBox(stripped, 'moov')).toBe(true);
  });

  it('preserves mdat at top level', () => {
    const buf = buildMp4({ includeUdta: true });
    const stripped = stripMp4(buf);
    expect(hasTopLevelBox(stripped, 'mdat')).toBe(true);
  });

  it('preserves mvhd inside moov', () => {
    const buf = buildMp4({ includeUdta: true });
    const stripped = stripMp4(buf);
    expect(moovContainsBox(stripped, 'mvhd')).toBe(true);
  });

  it('preserves trak inside moov', () => {
    const buf = buildMp4({ includeUdta: true });
    const stripped = stripMp4(buf);
    expect(moovContainsBox(stripped, 'trak')).toBe(true);
  });

  it('mdat bytes are bit-identical after stripping', () => {
    const mdatData = new Uint8Array(32);
    for (let i = 0; i < 32; i++) mdatData[i] = (i * 7) & 0xFF;
    const mdat = makeBox('mdat', mdatData);

    const mvhd = makeMvhd();
    const trak = makeTrak();
    const udta = makeUdta();
    const moovChildren = new Uint8Array(mvhd.length + trak.length + udta.length);
    moovChildren.set(mvhd, 0);
    moovChildren.set(trak, mvhd.length);
    moovChildren.set(udta, mvhd.length + trak.length);
    const moov = makeBox('moov', moovChildren);
    const ftyp = makeFtyp();
    const buf = concat(ftyp, moov, mdat);

    const stripped = stripMp4(buf);

    // Find mdat in output and check data bytes
    const sView = new DataView(stripped);
    const sBytes = new Uint8Array(stripped);
    let offset = 0;
    let found = false;
    while (offset + 8 <= stripped.byteLength) {
      const size = sView.getUint32(offset);
      const t = String.fromCharCode(sBytes[offset + 4]!, sBytes[offset + 5]!, sBytes[offset + 6]!, sBytes[offset + 7]!);
      if (t === 'mdat') {
        const outData = sBytes.slice(offset + 8, offset + size);
        expect(outData).toEqual(mdatData);
        found = true;
        break;
      }
      if (size < 8) break;
      offset += size;
    }
    expect(found).toBe(true);
  });
});

// ===========================================================================
// stripMp4 – moov size recalculation
// ===========================================================================

describe('stripMp4 – moov size recalculation', () => {
  it('moov box size is recalculated correctly after removing udta', () => {
    const buf = buildMp4({ includeUdta: true });
    const stripped = stripMp4(buf);

    const reportedMoovSize = topLevelBoxSize(stripped, 'moov');
    expect(reportedMoovSize).toBeGreaterThan(0);

    // Walk moov children and sum them up
    const sView = new DataView(stripped);
    const sBytes = new Uint8Array(stripped);
    let offset = 0;
    let moovOffset = -1;
    while (offset + 8 <= stripped.byteLength) {
      const size = sView.getUint32(offset);
      const t = String.fromCharCode(sBytes[offset + 4]!, sBytes[offset + 5]!, sBytes[offset + 6]!, sBytes[offset + 7]!);
      if (t === 'moov') { moovOffset = offset; break; }
      if (size < 8) break;
      offset += size;
    }
    expect(moovOffset).toBeGreaterThanOrEqual(0);

    // Sum children sizes
    let inner = moovOffset + 8;
    const moovEnd = moovOffset + reportedMoovSize;
    let childSum = 0;
    while (inner + 8 <= moovEnd) {
      const childSize = sView.getUint32(inner);
      if (childSize < 8) break;
      childSum += childSize;
      inner += childSize;
    }
    // moov header (8) + all children = reportedMoovSize
    expect(8 + childSum).toBe(reportedMoovSize);
  });
});

// ===========================================================================
// stripMp4 – top-level meta and uuid removal
// ===========================================================================

describe('stripMp4 – removes top-level meta and uuid boxes', () => {
  it('removes a top-level meta box', () => {
    const buf = buildMp4({ includeTopLevelMeta: true });
    expect(hasTopLevelBox(buf, 'meta')).toBe(true);

    const stripped = stripMp4(buf);
    expect(hasTopLevelBox(stripped, 'meta')).toBe(false);
  });

  it('removes a top-level uuid box', () => {
    const buf = buildMp4({ includeTopLevelUuid: true });
    expect(hasTopLevelBox(buf, 'uuid')).toBe(true);

    const stripped = stripMp4(buf);
    expect(hasTopLevelBox(stripped, 'uuid')).toBe(false);
  });

  it('removes both meta and uuid when both present', () => {
    const buf = buildMp4({ includeTopLevelMeta: true, includeTopLevelUuid: true });
    const stripped = stripMp4(buf);
    expect(hasTopLevelBox(stripped, 'meta')).toBe(false);
    expect(hasTopLevelBox(stripped, 'uuid')).toBe(false);
  });

  it('output is smaller when meta is removed', () => {
    const buf = buildMp4({ includeTopLevelMeta: true });
    const stripped = stripMp4(buf);
    expect(stripped.byteLength).toBeLessThan(buf.byteLength);
  });
});

// ===========================================================================
// stripMp4 – error handling
// ===========================================================================

describe('stripMp4 – error handling', () => {
  it('throws on a non-MP4 buffer shorter than 8 bytes', () => {
    expect(() => stripMp4(new Uint8Array(4).buffer)).toThrow(/not a valid MP4\/MOV/i);
  });

  it('throws on an empty buffer', () => {
    expect(() => stripMp4(new ArrayBuffer(0))).toThrow(/not a valid MP4\/MOV/i);
  });
});

// ===========================================================================
// stripMp4 – combined scenario (all boxes)
// ===========================================================================

describe('stripMp4 – combined stripping scenario', () => {
  it('removes udta, meta, and uuid in one pass while preserving ftyp, moov, mdat', () => {
    const buf = buildMp4({
      includeUdta: true,
      includeTopLevelMeta: true,
      includeTopLevelUuid: true,
    });

    const stripped = stripMp4(buf);

    expect(hasTopLevelBox(stripped, 'ftyp')).toBe(true);
    expect(hasTopLevelBox(stripped, 'moov')).toBe(true);
    expect(hasTopLevelBox(stripped, 'mdat')).toBe(true);
    expect(moovContainsBox(stripped, 'mvhd')).toBe(true);
    expect(moovContainsBox(stripped, 'trak')).toBe(true);
    expect(moovContainsBox(stripped, 'udta')).toBe(false);
    expect(hasTopLevelBox(stripped, 'meta')).toBe(false);
    expect(hasTopLevelBox(stripped, 'uuid')).toBe(false);
    expect(stripped.byteLength).toBeLessThan(buf.byteLength);
  });
});
