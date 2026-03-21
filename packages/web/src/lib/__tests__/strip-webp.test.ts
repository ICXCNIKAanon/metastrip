import { describe, it, expect } from 'vitest';
import { isWebp, stripWebp } from '../strip-webp';

// ---------------------------------------------------------------------------
// Test helper: build minimal synthetic WebP buffers
// ---------------------------------------------------------------------------

/**
 * Converts a 4-char ASCII string to a little-endian uint32 for use in chunk
 * headers.
 */
function fourCC(s: string): number {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>>
    0
  );
}

/** Concatenates multiple Uint8Array chunks into a single ArrayBuffer. */
function concat(parts: Uint8Array[]): ArrayBuffer {
  const total = parts.reduce((acc, p) => acc + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out.buffer;
}

/**
 * Encodes a single WebP/RIFF chunk:
 *   [4-byte FourCC LE] [4-byte data size LE] [data] [optional padding byte]
 */
function encodeChunk(type: string, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const paddedSize = data.byteLength + (data.byteLength & 1); // pad to even
  const out = new Uint8Array(8 + paddedSize);
  const view = new DataView(out.buffer);

  view.setUint32(0, fourCC(type), true); // FourCC, LE
  view.setUint32(4, data.byteLength, true); // data size (unpadded), LE

  out.set(data, 8);
  // padding byte is already 0x00 (Uint8Array default)

  return out;
}

/**
 * VP8X chunk data (10 bytes):
 *   byte 0: flags
 *   bytes 1-3: reserved
 *   bytes 4-6: canvas width minus one (3 bytes LE)
 *   bytes 7-9: canvas height minus one (3 bytes LE)
 *
 * Flag bits:
 *   bit 2 = ICC present
 *   bit 3 = alpha present
 *   bit 4 = EXIF present
 *   bit 5 = XMP present
 *   bit 6 = animation
 */
function makeVp8xData(flags: number): Uint8Array {
  const data = new Uint8Array(10);
  data[0] = flags & 0xff;
  // width-1 = 0 (1px wide), height-1 = 0 (1px tall)
  return data;
}

/**
 * Builds a minimal WebP buffer.
 *
 * Layout:
 *   RIFF header (12 bytes)
 *   VP8X chunk  (always present, configurable flags)
 *   VP8  chunk  (minimal lossy image data stub)
 *   ...optional extra chunks (EXIF, XMP , ICCP, etc.)
 *
 * The RIFF file size field is correctly computed from the actual chunk data.
 */
function buildWebp(options: {
  vp8xFlags?: number;
  extraChunks?: Array<{ type: string; data?: Uint8Array }>;
  vp8Data?: Uint8Array;
} = {}): ArrayBuffer {
  const {
    vp8xFlags = 0x00,
    extraChunks = [],
    vp8Data = new Uint8Array([0x30, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00]),
  } = options;

  // Build the inner chunks (everything after the 12-byte RIFF header)
  const innerParts: Uint8Array[] = [];

  // VP8X chunk
  innerParts.push(encodeChunk('VP8X', makeVp8xData(vp8xFlags)));

  // VP8 image data chunk
  innerParts.push(encodeChunk('VP8 ', vp8Data));

  // Extra chunks (EXIF, XMP, ICCP, etc.)
  for (const chunk of extraChunks) {
    innerParts.push(encodeChunk(chunk.type, chunk.data ?? new Uint8Array([0xde, 0xad, 0xbe, 0xef])));
  }

  // Compute total inner size (for the RIFF size field)
  const innerSize = innerParts.reduce((acc, p) => acc + p.byteLength, 0);

  // Build the 12-byte RIFF header
  const header = new Uint8Array(12);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, fourCC('RIFF'), true);           // "RIFF"
  headerView.setUint32(4, innerSize + 4, true);            // size = "WEBP" (4) + chunks
  headerView.setUint32(8, fourCC('WEBP'), true);           // "WEBP"

  return concat([header, ...innerParts]);
}

/**
 * Searches for a chunk with the given 4-char type name in a WebP buffer
 * (after the 12-byte RIFF header). Returns the byte offset of the chunk's
 * FourCC, or -1 if not found.
 */
function findChunk(buffer: ArrayBuffer, type: string): number {
  const src = new Uint8Array(buffer);
  const cc = fourCC(type);
  let offset = 12; // skip RIFF header

  while (offset + 8 <= src.byteLength) {
    const view = new DataView(buffer);
    const chunkCC = view.getUint32(offset, true);
    const dataSize = view.getUint32(offset + 4, true);

    if (chunkCC === cc) return offset;

    const paddedDataSize = dataSize + (dataSize & 1);
    offset += 8 + paddedDataSize;
  }

  return -1;
}

/** Returns true if the given chunk type exists in the WebP buffer. */
function hasChunk(buffer: ArrayBuffer, type: string): boolean {
  return findChunk(buffer, type) !== -1;
}

/**
 * Reads the VP8X flags byte from the output buffer.
 * VP8X data starts 8 bytes after the VP8X chunk's FourCC position.
 * Returns -1 if VP8X chunk is not found.
 */
function getVp8xFlags(buffer: ArrayBuffer): number {
  const offset = findChunk(buffer, 'VP8X');
  if (offset === -1) return -1;
  // chunk header is 8 bytes; flags byte is first byte of data
  const src = new Uint8Array(buffer);
  return src[offset + 8]!;
}

/**
 * Reads the RIFF file size from bytes 4-7 of the buffer (little-endian).
 */
function getRiffSize(buffer: ArrayBuffer): number {
  return new DataView(buffer).getUint32(4, true);
}

// ---------------------------------------------------------------------------
// isWebp
// ---------------------------------------------------------------------------

describe('isWebp', () => {
  it('returns true for a valid WebP buffer', () => {
    const buf = buildWebp();
    expect(isWebp(buf)).toBe(true);
  });

  it('returns false for a JPEG buffer (wrong magic bytes)', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(isWebp(jpeg.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isWebp(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a buffer shorter than 12 bytes', () => {
    expect(isWebp(new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer)).toBe(false);
  });

  it('returns false when RIFF header is present but WEBP tag is missing', () => {
    // "RIFF" + 4-byte size + "JPEG" — not a WebP
    const buf = new Uint8Array(12);
    const view = new DataView(buf.buffer);
    view.setUint32(0, fourCC('RIFF'), true);
    view.setUint32(4, 4, true);
    view.setUint32(8, fourCC('JPEG'), true);
    expect(isWebp(buf.buffer)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripWebp — removes EXIF chunk
// ---------------------------------------------------------------------------

describe('stripWebp – removes EXIF chunk', () => {
  it('removes an EXIF chunk', () => {
    const exifData = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const input = buildWebp({
      vp8xFlags: 0x10, // bit 4: EXIF present
      extraChunks: [{ type: 'EXIF', data: exifData }],
    });

    expect(hasChunk(input, 'EXIF')).toBe(true); // sanity check

    const output = stripWebp(input);
    expect(hasChunk(output, 'EXIF')).toBe(false);
  });

  it('output is smaller than input after removing EXIF', () => {
    const bigExif = new Uint8Array(200).fill(0xee);
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: bigExif }],
    });

    const output = stripWebp(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });
});

// ---------------------------------------------------------------------------
// stripWebp — removes XMP chunk
// ---------------------------------------------------------------------------

describe('stripWebp – removes XMP chunk', () => {
  it('removes an XMP  chunk (FourCC = "XMP " with trailing space)', () => {
    const xmpData = new Uint8Array(
      Array.from('<x:xmpmeta xmlns:x="adobe:ns:meta/"/>').map((c) => c.charCodeAt(0))
    );
    const input = buildWebp({
      vp8xFlags: 0x20, // bit 5: XMP present
      extraChunks: [{ type: 'XMP ', data: xmpData }],
    });

    expect(hasChunk(input, 'XMP ')).toBe(true); // sanity check

    const output = stripWebp(input);
    expect(hasChunk(output, 'XMP ')).toBe(false);
  });

  it('removes both EXIF and XMP in a single call', () => {
    const input = buildWebp({
      vp8xFlags: 0x30, // bits 4+5: EXIF + XMP present
      extraChunks: [
        { type: 'EXIF', data: new Uint8Array([0x49, 0x49, 0x2a, 0x00]) },
        { type: 'XMP ', data: new Uint8Array(Array.from('<x:xmpmeta/>').map((c) => c.charCodeAt(0))) },
      ],
    });

    const output = stripWebp(input);
    expect(hasChunk(output, 'EXIF')).toBe(false);
    expect(hasChunk(output, 'XMP ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripWebp — preserves image data
// ---------------------------------------------------------------------------

describe('stripWebp – preserves VP8 image data', () => {
  it('preserves VP8  chunk (lossy image data)', () => {
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01, 0x02]) }],
    });

    const output = stripWebp(input);
    expect(hasChunk(output, 'VP8 ')).toBe(true);
  });

  it('preserves VP8X chunk', () => {
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01, 0x02]) }],
    });

    const output = stripWebp(input);
    expect(hasChunk(output, 'VP8X')).toBe(true);
  });

  it('output is still detected as WebP by isWebp', () => {
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01, 0x02]) }],
    });

    const output = stripWebp(input);
    expect(isWebp(output)).toBe(true);
  });

  it('VP8 image data bytes are bit-identical after stripping', () => {
    const vp8Data = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe]);
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01]) }],
      vp8Data,
    });

    const output = stripWebp(input);

    // Find VP8 chunk in output and verify data bytes are intact.
    const vp8Offset = findChunk(output, 'VP8 ');
    expect(vp8Offset).toBeGreaterThan(-1);

    const outSrc = new Uint8Array(output);
    const dataView = new DataView(output);
    const vp8DataSize = dataView.getUint32(vp8Offset + 4, true);
    expect(vp8DataSize).toBe(vp8Data.byteLength);

    const outVp8Data = outSrc.subarray(vp8Offset + 8, vp8Offset + 8 + vp8DataSize);
    expect(outVp8Data).toEqual(vp8Data);
  });
});

// ---------------------------------------------------------------------------
// stripWebp — VP8X flags update
// ---------------------------------------------------------------------------

describe('stripWebp – VP8X flags update', () => {
  it('clears EXIF bit (bit 4) in VP8X flags after stripping EXIF', () => {
    const input = buildWebp({
      vp8xFlags: 0x10, // only EXIF bit set
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01, 0x02]) }],
    });

    const output = stripWebp(input);
    const flags = getVp8xFlags(output);
    expect(flags & (1 << 4)).toBe(0); // EXIF bit cleared
  });

  it('clears XMP bit (bit 5) in VP8X flags after stripping XMP', () => {
    const input = buildWebp({
      vp8xFlags: 0x20, // only XMP bit set
      extraChunks: [{ type: 'XMP ', data: new Uint8Array([0x3c, 0x78]) }],
    });

    const output = stripWebp(input);
    const flags = getVp8xFlags(output);
    expect(flags & (1 << 5)).toBe(0); // XMP bit cleared
  });

  it('clears both EXIF and XMP bits when both chunks are removed', () => {
    const input = buildWebp({
      vp8xFlags: 0x30, // bits 4+5: EXIF + XMP
      extraChunks: [
        { type: 'EXIF', data: new Uint8Array([0x01]) },
        { type: 'XMP ', data: new Uint8Array([0x02]) },
      ],
    });

    const output = stripWebp(input);
    const flags = getVp8xFlags(output);
    expect(flags & (1 << 4)).toBe(0); // EXIF bit cleared
    expect(flags & (1 << 5)).toBe(0); // XMP bit cleared
  });

  it('preserves ICC bit (bit 2) when EXIF/XMP are stripped', () => {
    // flags = ICC (bit 2) + EXIF (bit 4) = 0x14
    const input = buildWebp({
      vp8xFlags: 0x14,
      extraChunks: [
        { type: 'ICCP', data: new Uint8Array([0x00, 0x01, 0x02]) },
        { type: 'EXIF', data: new Uint8Array([0x49, 0x49]) },
      ],
    });

    const output = stripWebp(input);
    const flags = getVp8xFlags(output);
    expect(flags & (1 << 2)).toBe(1 << 2); // ICC bit preserved
    expect(flags & (1 << 4)).toBe(0);       // EXIF bit cleared
  });

  it('preserves alpha bit (bit 3) when EXIF/XMP are stripped', () => {
    // flags = alpha (bit 3) + EXIF (bit 4) = 0x18
    const input = buildWebp({
      vp8xFlags: 0x18,
      extraChunks: [
        { type: 'ALPH', data: new Uint8Array([0x00, 0x01]) },
        { type: 'EXIF', data: new Uint8Array([0x49, 0x49]) },
      ],
    });

    const output = stripWebp(input);
    const flags = getVp8xFlags(output);
    expect(flags & (1 << 3)).toBe(1 << 3); // alpha bit preserved
    expect(flags & (1 << 4)).toBe(0);       // EXIF bit cleared
  });

  it('preserves animation bit (bit 6) when EXIF/XMP are stripped', () => {
    // flags = animation (bit 6) + EXIF (bit 4) = 0x50
    const animData = new Uint8Array(6); // ANIM chunk data: background color (4) + loop count (2)
    const input = buildWebp({
      vp8xFlags: 0x50,
      extraChunks: [
        { type: 'ANIM', data: animData },
        { type: 'EXIF', data: new Uint8Array([0x01]) },
      ],
    });

    const output = stripWebp(input);
    const flags = getVp8xFlags(output);
    expect(flags & (1 << 6)).toBe(1 << 6); // animation bit preserved
    expect(flags & (1 << 4)).toBe(0);       // EXIF bit cleared
  });

  it('leaves VP8X flags unchanged when no EXIF or XMP chunks present', () => {
    const originalFlags = 0x04; // ICC only
    const input = buildWebp({
      vp8xFlags: originalFlags,
      extraChunks: [
        { type: 'ICCP', data: new Uint8Array([0x00, 0x01]) },
      ],
    });

    const output = stripWebp(input);
    const flags = getVp8xFlags(output);
    expect(flags).toBe(originalFlags);
  });
});

// ---------------------------------------------------------------------------
// stripWebp — RIFF file size header update
// ---------------------------------------------------------------------------

describe('stripWebp – RIFF file size header', () => {
  it('RIFF size field equals total file size minus 8 after stripping', () => {
    const exifData = new Uint8Array(50).fill(0xee);
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: exifData }],
    });

    const output = stripWebp(input);
    const riffSize = getRiffSize(output);
    expect(riffSize).toBe(output.byteLength - 8);
  });

  it('RIFF size field is correct when no metadata is stripped', () => {
    const input = buildWebp(); // no EXIF/XMP
    const output = stripWebp(input);
    const riffSize = getRiffSize(output);
    expect(riffSize).toBe(output.byteLength - 8);
  });

  it('RIFF size field is correct when both EXIF and XMP are stripped', () => {
    const input = buildWebp({
      vp8xFlags: 0x30,
      extraChunks: [
        { type: 'EXIF', data: new Uint8Array(30).fill(0x11) },
        { type: 'XMP ', data: new Uint8Array(40).fill(0x22) },
      ],
    });

    const output = stripWebp(input);
    const riffSize = getRiffSize(output);
    expect(riffSize).toBe(output.byteLength - 8);
  });
});

// ---------------------------------------------------------------------------
// stripWebp — ICCP handling
// ---------------------------------------------------------------------------

describe('stripWebp – ICCP handling', () => {
  it('preserves ICCP chunk by default', () => {
    const input = buildWebp({
      vp8xFlags: 0x14, // ICC + EXIF bits
      extraChunks: [
        { type: 'ICCP', data: new Uint8Array([0x00, 0x01, 0x02]) },
        { type: 'EXIF', data: new Uint8Array([0x49, 0x49]) },
      ],
    });

    const output = stripWebp(input);
    expect(hasChunk(output, 'ICCP')).toBe(true);
  });

  it('removes ICCP when preserveIcc is false', () => {
    const input = buildWebp({
      vp8xFlags: 0x14,
      extraChunks: [
        { type: 'ICCP', data: new Uint8Array([0x00, 0x01, 0x02]) },
        { type: 'EXIF', data: new Uint8Array([0x49, 0x49]) },
      ],
    });

    const output = stripWebp(input, { preserveIcc: false });
    expect(hasChunk(output, 'ICCP')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripWebp — error handling
// ---------------------------------------------------------------------------

describe('stripWebp – error handling', () => {
  it('throws on non-WebP input (JPEG magic bytes)', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(() => stripWebp(jpeg.buffer)).toThrow(/not a valid WebP/i);
  });

  it('throws on empty buffer', () => {
    expect(() => stripWebp(new ArrayBuffer(0))).toThrow(/not a valid WebP/i);
  });

  it('throws on all-zero buffer', () => {
    expect(() => stripWebp(new Uint8Array(32).buffer)).toThrow(/not a valid WebP/i);
  });

  it('throws when RIFF header is present but WEBP tag is wrong', () => {
    const buf = new Uint8Array(12);
    const view = new DataView(buf.buffer);
    view.setUint32(0, fourCC('RIFF'), true);
    view.setUint32(4, 4, true);
    view.setUint32(8, fourCC('WAVE'), true); // AVI/WAV, not WebP
    expect(() => stripWebp(buf.buffer)).toThrow(/not a valid WebP/i);
  });
});

// ---------------------------------------------------------------------------
// stripWebp — combined real-world-like scenario
// ---------------------------------------------------------------------------

describe('stripWebp – combined scenario', () => {
  it('strips EXIF and XMP, preserves VP8 data, updates flags and RIFF size', () => {
    const vp8Data = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);
    const exifData = new Uint8Array(40).fill(0xee);
    const xmpData = new Uint8Array(
      Array.from('<x:xmpmeta xmlns:x="adobe:ns:meta/"/>').map((c) => c.charCodeAt(0))
    );
    const iccData = new Uint8Array(20).fill(0xcc);

    // flags: ICC(2) + EXIF(4) + XMP(5) = 0x34
    const input = buildWebp({
      vp8xFlags: 0x34,
      vp8Data,
      extraChunks: [
        { type: 'ICCP', data: iccData },
        { type: 'EXIF', data: exifData },
        { type: 'XMP ', data: xmpData },
      ],
    });

    const output = stripWebp(input);

    // Metadata chunks removed
    expect(hasChunk(output, 'EXIF')).toBe(false);
    expect(hasChunk(output, 'XMP ')).toBe(false);

    // Image / profile chunks preserved
    expect(hasChunk(output, 'VP8X')).toBe(true);
    expect(hasChunk(output, 'VP8 ')).toBe(true);
    expect(hasChunk(output, 'ICCP')).toBe(true);

    // Output is still a valid WebP
    expect(isWebp(output)).toBe(true);

    // Output is smaller
    expect(output.byteLength).toBeLessThan(input.byteLength);

    // RIFF size is correctly updated
    expect(getRiffSize(output)).toBe(output.byteLength - 8);

    // VP8X flags: EXIF and XMP bits cleared, ICC bit preserved
    const flags = getVp8xFlags(output);
    expect(flags & (1 << 4)).toBe(0);       // EXIF cleared
    expect(flags & (1 << 5)).toBe(0);       // XMP cleared
    expect(flags & (1 << 2)).toBe(1 << 2);  // ICC preserved
  });
});
