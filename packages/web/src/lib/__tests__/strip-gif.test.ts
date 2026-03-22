import { describe, it, expect } from 'vitest';
import { isGif, stripGif } from '../strip-gif';

// ---------------------------------------------------------------------------
// Test helper: build synthetic GIF buffers
// ---------------------------------------------------------------------------

/**
 * Concatenates multiple Uint8Array chunks into a single ArrayBuffer.
 */
function concat(chunks: Uint8Array[]): ArrayBuffer {
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/**
 * Encodes a sequence of GIF sub-blocks from a flat data array.
 * Splits data into sub-blocks of up to 255 bytes, terminated by 0x00.
 */
function encodeSubBlocks(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let i = 0;
  while (i < data.length) {
    const count = Math.min(255, data.length - i);
    parts.push(new Uint8Array([count]));
    parts.push(data.subarray(i, i + count));
    i += count;
  }
  parts.push(new Uint8Array([0x00])); // block terminator
  return concat(parts as Uint8Array[]).slice !== undefined
    ? (() => {
        const total = parts.reduce((a, c) => a + c.byteLength, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const p of parts) { out.set(p, off); off += p.byteLength; }
        return out;
      })()
    : new Uint8Array(0);
}

/**
 * Builds a minimal valid GIF89a buffer.
 *
 * Layout:
 *   Header (6 bytes: "GIF89a")
 *   Logical Screen Descriptor (7 bytes, no GCT)
 *   ...extra blocks passed by caller...
 *   Image Descriptor (0x2C, 10 bytes: 9 fixed + LZW min code size)
 *   Image data sub-blocks (minimal)
 *   Trailer (0x3B)
 */
function buildGif(extraBlocks: Uint8Array[] = []): ArrayBuffer {
  const parts: Uint8Array[] = [];

  // Header: "GIF89a"
  parts.push(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));

  // Logical Screen Descriptor: width=1, height=1, no GCT, bg=0, aspect=0
  parts.push(new Uint8Array([
    0x01, 0x00, // width = 1
    0x01, 0x00, // height = 1
    0x00,       // packed: no GCT, color resolution=1, no sort, GCT size=0
    0x00,       // background color index
    0x00,       // pixel aspect ratio
  ]));

  // Extra caller-supplied blocks
  for (const block of extraBlocks) {
    parts.push(block);
  }

  // Image Descriptor
  parts.push(new Uint8Array([
    0x2c,       // Image Descriptor introducer
    0x00, 0x00, // left
    0x00, 0x00, // top
    0x01, 0x00, // width = 1
    0x01, 0x00, // height = 1
    0x00,       // packed: no LCT, not interlaced
  ]));

  // LZW Minimum Code Size
  parts.push(new Uint8Array([0x02]));

  // Image data: minimal compressed pixel (LZW code size 2)
  // A real 1x1 image: one sub-block with a valid LZW stream
  parts.push(new Uint8Array([0x02, 0x4c, 0x01, 0x00]));

  // Trailer
  parts.push(new Uint8Array([0x3b]));

  return concat(parts);
}

/**
 * Builds a Comment Extension block (0x21 0xFE) with the given text.
 */
function buildCommentExtension(comment: string): Uint8Array {
  const data = new Uint8Array(comment.split('').map(c => c.charCodeAt(0)));
  const subBlocks = encodeSubBlocks(data);
  const out = new Uint8Array(2 + subBlocks.byteLength);
  out[0] = 0x21; // extension introducer
  out[1] = 0xfe; // comment label
  out.set(subBlocks, 2);
  return out;
}

/**
 * Builds an Application Extension block (0x21 0xFF).
 * appId should be 8 chars, authCode should be 3 chars.
 */
function buildApplicationExtension(appId: string, authCode: string, data: Uint8Array = new Uint8Array([0x01, 0x00, 0x00])): Uint8Array {
  // Fixed block: 0x0B length + 8 char app ID + 3 char auth code
  const fixedBlock = new Uint8Array(12); // 1 (count) + 11 (data)
  fixedBlock[0] = 0x0b; // block size = 11
  for (let i = 0; i < 8; i++) fixedBlock[1 + i] = appId.charCodeAt(i) || 0x20;
  for (let i = 0; i < 3; i++) fixedBlock[9 + i] = authCode.charCodeAt(i) || 0x20;

  const subBlocks = encodeSubBlocks(data);
  const out = new Uint8Array(2 + fixedBlock.byteLength + subBlocks.byteLength);
  out[0] = 0x21; // extension introducer
  out[1] = 0xff; // application extension label
  out.set(fixedBlock, 2);
  out.set(subBlocks, 2 + fixedBlock.byteLength);
  return out;
}

/**
 * Builds a Graphic Control Extension (0x21 0xF9) — should always be preserved.
 */
function buildGraphicControlExtension(delayCs = 10): Uint8Array {
  // Fixed block: 4 bytes
  return new Uint8Array([
    0x21, 0xf9, // GCE introducer + label
    0x04,       // block size = 4
    0x00,       // packed flags
    delayCs & 0xff, (delayCs >> 8) & 0xff, // delay
    0x00,       // transparent color index
    0x00,       // block terminator
  ]);
}

/**
 * Builds a NETSCAPE2.0 Application Extension (animation looping).
 */
function buildNetscapeExtension(loopCount = 0): Uint8Array {
  const data = new Uint8Array([0x01, loopCount & 0xff, (loopCount >> 8) & 0xff]);
  return buildApplicationExtension('NETSCAPE', '2.0', data);
}

/**
 * Returns true if the bytes sequence appears anywhere in the buffer.
 */
function containsBytes(buffer: ArrayBuffer, bytes: number[]): boolean {
  const view = new Uint8Array(buffer);
  outer: for (let i = 0; i <= view.byteLength - bytes.length; i++) {
    for (let j = 0; j < bytes.length; j++) {
      if (view[i + j] !== bytes[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Returns true if a Comment Extension (0x21 0xFE) appears in the buffer. */
function hasCommentExtension(buffer: ArrayBuffer): boolean {
  return containsBytes(buffer, [0x21, 0xfe]);
}

/** Returns true if a non-NETSCAPE Application Extension appears in the buffer. */
function hasApplicationExtension(buffer: ArrayBuffer): boolean {
  return containsBytes(buffer, [0x21, 0xff]);
}

/** Returns true if a Graphic Control Extension (0x21 0xF9) appears in the buffer. */
function hasGraphicControlExtension(buffer: ArrayBuffer): boolean {
  return containsBytes(buffer, [0x21, 0xf9]);
}

/** Returns true if "NETSCAPE" appears as bytes in the buffer. */
function hasNetscapeBytes(buffer: ArrayBuffer): boolean {
  const netscape = [0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45]; // "NETSCAPE"
  return containsBytes(buffer, netscape);
}

// ---------------------------------------------------------------------------
// isGif
// ---------------------------------------------------------------------------

describe('isGif', () => {
  it('returns true for a GIF89a buffer', () => {
    const buf = buildGif();
    expect(isGif(buf)).toBe(true);
  });

  it('returns true for a GIF87a buffer', () => {
    const buf = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x00, 0x00]);
    expect(isGif(buf.buffer)).toBe(true);
  });

  it('returns false for a JPEG buffer', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(isGif(jpeg.buffer)).toBe(false);
  });

  it('returns false for a PNG buffer', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isGif(png.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isGif(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a buffer shorter than 6 bytes', () => {
    expect(isGif(new Uint8Array([0x47, 0x49, 0x46, 0x38]).buffer)).toBe(false);
  });

  it('returns false for all-zero bytes', () => {
    expect(isGif(new Uint8Array(16).buffer)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripGif — Comment Extension removal
// ---------------------------------------------------------------------------

describe('stripGif – removes Comment Extension blocks', () => {
  it('removes a comment extension', () => {
    const comment = buildCommentExtension('Created with GIMP');
    const input = buildGif([comment]);
    expect(hasCommentExtension(input)).toBe(true); // sanity: present before
    const output = stripGif(input);
    expect(hasCommentExtension(output)).toBe(false);
  });

  it('removes a comment extension with long text', () => {
    const longComment = 'A'.repeat(300);
    const comment = buildCommentExtension(longComment);
    const input = buildGif([comment]);
    expect(hasCommentExtension(input)).toBe(true);
    const output = stripGif(input);
    expect(hasCommentExtension(output)).toBe(false);
  });

  it('removes multiple comment extensions', () => {
    const c1 = buildCommentExtension('Author: Jane Doe');
    const c2 = buildCommentExtension('Software: Photoshop');
    const input = buildGif([c1, c2]);
    expect(hasCommentExtension(input)).toBe(true);
    const output = stripGif(input);
    expect(hasCommentExtension(output)).toBe(false);
  });

  it('output is smaller than input when comment is removed', () => {
    const comment = buildCommentExtension('GPS: 37.7749,-122.4194');
    const input = buildGif([comment]);
    const output = stripGif(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });
});

// ---------------------------------------------------------------------------
// stripGif — Application Extension removal
// ---------------------------------------------------------------------------

describe('stripGif – removes non-NETSCAPE Application Extension blocks', () => {
  it('removes an XMP application extension', () => {
    const xmp = buildApplicationExtension('XMP Data', 'XMP', new Uint8Array([0x3c, 0x78, 0x6d, 0x70]));
    const input = buildGif([xmp]);
    expect(hasApplicationExtension(input)).toBe(true);
    const output = stripGif(input);
    // XMP data app extension should be stripped
    // We check the "XMP Data" identifier bytes are gone: [0x58, 0x4d, 0x50, 0x20]
    expect(containsBytes(output, [0x58, 0x4d, 0x50, 0x20])).toBe(false);
  });

  it('removes an arbitrary non-NETSCAPE application extension', () => {
    const app = buildApplicationExtension('ADOBE   ', '001', new Uint8Array([0x01, 0x00]));
    const input = buildGif([app]);
    expect(hasApplicationExtension(input)).toBe(true);
    const output = stripGif(input);
    // "ADOBE   " identifier bytes should be gone
    expect(containsBytes(output, [0x41, 0x44, 0x4f, 0x42, 0x45])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripGif — NETSCAPE preservation
// ---------------------------------------------------------------------------

describe('stripGif – preserves NETSCAPE2.0 Application Extension', () => {
  it('preserves NETSCAPE extension (animation looping)', () => {
    const netscape = buildNetscapeExtension(0); // infinite loop
    const input = buildGif([netscape]);
    expect(hasNetscapeBytes(input)).toBe(true);
    const output = stripGif(input);
    expect(hasNetscapeBytes(output)).toBe(true);
  });

  it('strips comment but keeps NETSCAPE extension in same GIF', () => {
    const comment = buildCommentExtension('Made with GifMaker Pro');
    const netscape = buildNetscapeExtension(3);
    const input = buildGif([comment, netscape]);
    const output = stripGif(input);
    expect(hasCommentExtension(output)).toBe(false);
    expect(hasNetscapeBytes(output)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stripGif — Graphic Control Extension preservation
// ---------------------------------------------------------------------------

describe('stripGif – preserves Graphic Control Extension', () => {
  it('preserves GCE (timing/transparency)', () => {
    const gce = buildGraphicControlExtension(50);
    const comment = buildCommentExtension('Strip me');
    const input = buildGif([gce, comment]);
    expect(hasGraphicControlExtension(input)).toBe(true);
    const output = stripGif(input);
    expect(hasGraphicControlExtension(output)).toBe(true);
    expect(hasCommentExtension(output)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripGif — structural preservation
// ---------------------------------------------------------------------------

describe('stripGif – preserves GIF structure', () => {
  it('output starts with GIF89a header', () => {
    const input = buildGif([buildCommentExtension('test')]);
    const output = new Uint8Array(stripGif(input));
    expect(output[0]).toBe(0x47); // G
    expect(output[1]).toBe(0x49); // I
    expect(output[2]).toBe(0x46); // F
    expect(output[3]).toBe(0x38); // 8
    expect(output[4]).toBe(0x39); // 9
    expect(output[5]).toBe(0x61); // a
  });

  it('output ends with trailer byte (0x3B)', () => {
    const input = buildGif([buildCommentExtension('test')]);
    const output = new Uint8Array(stripGif(input));
    expect(output[output.length - 1]).toBe(0x3b);
  });

  it('output is still detected as GIF by isGif', () => {
    const input = buildGif([buildCommentExtension('metadata here')]);
    const output = stripGif(input);
    expect(isGif(output)).toBe(true);
  });

  it('output contains the Image Descriptor (0x2C)', () => {
    const input = buildGif([buildCommentExtension('test')]);
    const output = stripGif(input);
    expect(containsBytes(output, [0x2c])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stripGif — output size
// ---------------------------------------------------------------------------

describe('stripGif – output size', () => {
  it('output equals input size when no strippable blocks are present', () => {
    const input = buildGif(); // no metadata blocks
    const output = stripGif(input);
    expect(output.byteLength).toBe(input.byteLength);
  });

  it('output is smaller than input when comment is stripped', () => {
    const comment = buildCommentExtension('A'.repeat(50));
    const input = buildGif([comment]);
    const output = stripGif(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });
});

// ---------------------------------------------------------------------------
// stripGif — error handling
// ---------------------------------------------------------------------------

describe('stripGif – error handling', () => {
  it('throws on non-GIF input (JPEG magic bytes)', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(() => stripGif(jpeg.buffer)).toThrow(/not a valid GIF/i);
  });

  it('throws on empty buffer', () => {
    expect(() => stripGif(new ArrayBuffer(0))).toThrow(/not a valid GIF/i);
  });

  it('throws on all-zero buffer', () => {
    expect(() => stripGif(new Uint8Array(32).buffer)).toThrow(/not a valid GIF/i);
  });

  it('throws on PNG magic bytes', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => stripGif(png.buffer)).toThrow(/not a valid GIF/i);
  });
});
