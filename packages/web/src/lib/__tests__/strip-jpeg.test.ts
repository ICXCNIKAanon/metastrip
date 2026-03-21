import { describe, it, expect } from 'vitest';
import { isJpeg, stripJpeg } from '../strip-jpeg';

// ---------------------------------------------------------------------------
// Test helper: build minimal synthetic JPEG buffers
// ---------------------------------------------------------------------------

/**
 * A "marker segment" as understood by buildJpeg.
 */
interface MarkerSegment {
  /** 2-byte marker, e.g. 0xFFE1 */
  marker: number;
  /** Payload bytes (the part AFTER the 2-byte length field) */
  payload?: Uint8Array;
}

/**
 * Builds a syntactically valid JPEG buffer from explicit marker segments plus
 * optional scan data.
 *
 * Layout produced:
 *   SOI | ...segments... | SOS segment | scan data | EOI
 *
 * The SOS segment and EOI are always appended so that the parser stops
 * correctly and scan data is included verbatim in any strip operation.
 */
function buildJpeg(
  segments: MarkerSegment[],
  scanData: Uint8Array = new Uint8Array([0xab, 0xcd, 0xef])
): ArrayBuffer {
  const parts: Uint8Array[] = [];

  // SOI
  parts.push(new Uint8Array([0xff, 0xd8]));

  // Encode each caller-supplied segment.
  for (const seg of segments) {
    parts.push(encodeSegment(seg.marker, seg.payload ?? new Uint8Array(0)));
  }

  // SOS segment (minimal — just marker + length + 1 dummy byte).
  // SOS payload typically contains component selectors; we use 1 byte of dummy
  // data so the length field is valid (length = 2 + 1 = 3).
  parts.push(encodeSegment(0xffda, new Uint8Array([0x00])));

  // Raw scan data (copied verbatim by stripper).
  parts.push(scanData);

  // EOI
  parts.push(new Uint8Array([0xff, 0xd9]));

  return concat(parts);
}

/** Encodes a single marker segment: 0xFF marker_byte length_hi length_lo ...payload */
function encodeSegment(marker: number, payload: Uint8Array): Uint8Array {
  const totalLength = 2 + payload.byteLength; // length field includes itself
  const out = new Uint8Array(2 + 2 + payload.byteLength);
  out[0] = 0xff;
  out[1] = marker & 0xff;
  out[2] = (totalLength >> 8) & 0xff;
  out[3] = totalLength & 0xff;
  out.set(payload, 4);
  return out;
}

/** Concatenates multiple Uint8Array chunks into a single ArrayBuffer. */
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

/** Returns the byte offset of the FIRST occurrence of a 2-byte marker inside an ArrayBuffer, or -1. */
function findMarker(buffer: ArrayBuffer, marker: number): number {
  const view = new Uint8Array(buffer);
  const hi = (marker >> 8) & 0xff;
  const lo = marker & 0xff;
  for (let i = 0; i < view.byteLength - 1; i++) {
    if (view[i] === hi && view[i + 1] === lo) return i;
  }
  return -1;
}

/** Helper: check whether a specific marker appears anywhere in the buffer. */
function hasMarker(buffer: ArrayBuffer, marker: number): boolean {
  return findMarker(buffer, marker) !== -1;
}

// ---------------------------------------------------------------------------
// isJpeg
// ---------------------------------------------------------------------------

describe('isJpeg', () => {
  it('returns true for a valid JPEG buffer', () => {
    const buf = buildJpeg([]);
    expect(isJpeg(buf)).toBe(true);
  });

  it('returns false for a PNG buffer (wrong magic bytes)', () => {
    // PNG magic: 0x89 0x50 0x4E 0x47 ...
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isJpeg(png.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isJpeg(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a 1-byte buffer', () => {
    expect(isJpeg(new Uint8Array([0xff]).buffer)).toBe(false);
  });

  it('returns false for all-zero bytes', () => {
    expect(isJpeg(new Uint8Array(8).buffer)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripJpeg — basic output shape
// ---------------------------------------------------------------------------

describe('stripJpeg – output validity', () => {
  it('output begins with SOI marker', () => {
    const input = buildJpeg([]);
    const output = new Uint8Array(stripJpeg(input));
    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xd8);
  });

  it('output ends with EOI marker', () => {
    const input = buildJpeg([]);
    const output = new Uint8Array(stripJpeg(input));
    expect(output[output.length - 2]).toBe(0xff);
    expect(output[output.length - 1]).toBe(0xd9);
  });

  it('output is still a valid JPEG (isJpeg returns true)', () => {
    const input = buildJpeg([]);
    expect(isJpeg(stripJpeg(input))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stripJpeg — metadata removal
// ---------------------------------------------------------------------------

describe('stripJpeg – removes metadata markers', () => {
  it('removes APP1 (EXIF)', () => {
    const exifPayload = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
    const input = buildJpeg([{ marker: 0xffe1, payload: exifPayload }]);

    expect(hasMarker(input, 0xffe1)).toBe(true); // sanity: present before

    const output = stripJpeg(input);
    expect(hasMarker(output, 0xffe1)).toBe(false);
  });

  it('removes APP1 (XMP)', () => {
    const xmpPayload = new Uint8Array(
      Array.from('http://ns.adobe.com/xap/1.0/\0<xmpmeta/>').map((c) =>
        c.charCodeAt(0)
      )
    );
    const input = buildJpeg([{ marker: 0xffe1, payload: xmpPayload }]);
    const output = stripJpeg(input);
    expect(hasMarker(output, 0xffe1)).toBe(false);
  });

  it('removes APP13 (IPTC)', () => {
    const iptcPayload = new Uint8Array([0x50, 0x68, 0x6f, 0x74, 0x6f, 0x73, 0x68, 0x6f, 0x70]); // "Photoshop"
    const input = buildJpeg([{ marker: 0xffed, payload: iptcPayload }]);

    expect(hasMarker(input, 0xffed)).toBe(true);

    const output = stripJpeg(input);
    expect(hasMarker(output, 0xffed)).toBe(false);
  });

  it('removes COM (comment)', () => {
    const commentPayload = new Uint8Array(
      Array.from('Created by Camera').map((c) => c.charCodeAt(0))
    );
    const input = buildJpeg([{ marker: 0xfffe, payload: commentPayload }]);

    expect(hasMarker(input, 0xfffe)).toBe(true);

    const output = stripJpeg(input);
    expect(hasMarker(output, 0xfffe)).toBe(false);
  });

  it('removes APP3 through APP12', () => {
    for (let i = 3; i <= 12; i++) {
      const marker = 0xffe0 | i;
      const input = buildJpeg([{ marker, payload: new Uint8Array([0x01, 0x02]) }]);
      const output = stripJpeg(input);
      expect(hasMarker(output, marker)).toBe(
        false
      );
    }
  });

  it('removes APP14 and APP15', () => {
    for (const marker of [0xffee, 0xffef]) {
      const input = buildJpeg([{ marker, payload: new Uint8Array([0x01]) }]);
      const output = stripJpeg(input);
      expect(hasMarker(output, marker)).toBe(false);
    }
  });

  it('removes multiple metadata markers in one pass', () => {
    const input = buildJpeg([
      { marker: 0xffe1, payload: new Uint8Array([0x45, 0x78]) }, // APP1/EXIF
      { marker: 0xffed, payload: new Uint8Array([0x50, 0x68]) }, // APP13/IPTC
      { marker: 0xfffe, payload: new Uint8Array([0x48, 0x69]) }, // COM
    ]);

    const output = stripJpeg(input);
    expect(hasMarker(output, 0xffe1)).toBe(false);
    expect(hasMarker(output, 0xffed)).toBe(false);
    expect(hasMarker(output, 0xfffe)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripJpeg — preserves required markers
// ---------------------------------------------------------------------------

describe('stripJpeg – preserves required markers', () => {
  it('preserves APP0 (JFIF)', () => {
    const jfifPayload = new Uint8Array([
      0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
      0x01, 0x01, // version 1.1
      0x00, // aspect ratio units
      0x00, 0x01, // Xdensity
      0x00, 0x01, // Ydensity
      0x00, 0x00, // thumbnail dimensions
    ]);
    const input = buildJpeg([{ marker: 0xffe0, payload: jfifPayload }]);
    const output = stripJpeg(input);
    expect(hasMarker(output, 0xffe0)).toBe(true);
  });

  it('preserves APP2 (ICC) by default', () => {
    const iccPayload = new Uint8Array([0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00]); // "ICC_PROFILE\0"
    const input = buildJpeg([{ marker: 0xffe2, payload: iccPayload }]);
    const output = stripJpeg(input);
    expect(hasMarker(output, 0xffe2)).toBe(true);
  });

  it('removes APP2 (ICC) when preserveIcc is false', () => {
    const iccPayload = new Uint8Array([0x49, 0x43, 0x43, 0x5f]);
    const input = buildJpeg([{ marker: 0xffe2, payload: iccPayload }]);
    const output = stripJpeg(input, { preserveIcc: false });
    expect(hasMarker(output, 0xffe2)).toBe(false);
  });

  it('preserves APP0 even when APP1 is present', () => {
    const jfifPayload = new Uint8Array([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    const exifPayload = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
    const input = buildJpeg([
      { marker: 0xffe0, payload: jfifPayload },
      { marker: 0xffe1, payload: exifPayload },
    ]);
    const output = stripJpeg(input);
    expect(hasMarker(output, 0xffe0)).toBe(true);
    expect(hasMarker(output, 0xffe1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripJpeg — scan data integrity
// ---------------------------------------------------------------------------

describe('stripJpeg – scan data preserved byte-for-byte', () => {
  it('scan data is bit-identical after stripping', () => {
    const scanData = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]);
    const input = buildJpeg(
      [{ marker: 0xffe1, payload: new Uint8Array([0x45, 0x78]) }],
      scanData
    );

    const output = new Uint8Array(stripJpeg(input));

    // Find scan data start in output: locate SOS marker then skip its segment.
    const sosOffset = findMarker(stripJpeg(input), 0xffda);
    expect(sosOffset).toBeGreaterThan(-1);

    const outView = new DataView(stripJpeg(input));
    const sosSegLen = outView.getUint16(sosOffset + 2); // length field
    const scanStart = sosOffset + 2 + sosSegLen;

    // The scan data in the output should match the original scanData bytes.
    const outputScan = output.subarray(scanStart, scanStart + scanData.byteLength);
    expect(outputScan).toEqual(scanData);
  });

  it('scan data containing 0xFF bytes is preserved intact', () => {
    // 0xFF bytes inside scan data are significant (stuffed bytes 0xFF 0x00).
    const scanData = new Uint8Array([0xff, 0x00, 0xde, 0xad, 0xff, 0x00, 0xbe, 0xef]);
    const input = buildJpeg([], scanData);
    const output = new Uint8Array(stripJpeg(input));

    // Locate scan data in output.
    const sosOffset = findMarker(input, 0xffda);
    const inputView = new DataView(input);
    const sosSegLen = inputView.getUint16(sosOffset + 2);
    const scanStart = sosOffset + 2 + sosSegLen;

    // Input scan data position (stripped input has same SOS position since no
    // metadata was removed, so reuse same offsets for the stripped output).
    const outputSosOffset = findMarker(stripJpeg(input), 0xffda);
    const outputView = new DataView(stripJpeg(input));
    const outputSosSegLen = outputView.getUint16(outputSosOffset + 2);
    const outputScanStart = outputSosOffset + 2 + outputSosSegLen;

    const outputScan = output.subarray(outputScanStart, outputScanStart + scanData.byteLength);
    expect(outputScan).toEqual(scanData);
  });
});

// ---------------------------------------------------------------------------
// stripJpeg — size reduction
// ---------------------------------------------------------------------------

describe('stripJpeg – output size', () => {
  it('output is smaller than input when metadata is present', () => {
    // Add 50-byte payloads for APP1 and APP13.
    const bigPayload = new Uint8Array(50).fill(0xaa);
    const input = buildJpeg([
      { marker: 0xffe1, payload: bigPayload },
      { marker: 0xffed, payload: bigPayload },
    ]);

    const output = stripJpeg(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('output size equals input when no strippable markers are present', () => {
    const input = buildJpeg([]); // Only SOS + EOI, no metadata
    const output = stripJpeg(input);
    // No metadata to remove — sizes must match.
    expect(output.byteLength).toBe(input.byteLength);
  });
});

// ---------------------------------------------------------------------------
// stripJpeg — error handling
// ---------------------------------------------------------------------------

describe('stripJpeg – error handling', () => {
  it('throws on non-JPEG input (PNG magic bytes)', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => stripJpeg(png.buffer)).toThrow(/not a valid JPEG/i);
  });

  it('throws on empty buffer', () => {
    expect(() => stripJpeg(new ArrayBuffer(0))).toThrow(/not a valid JPEG/i);
  });

  it('throws on all-zero buffer', () => {
    expect(() => stripJpeg(new Uint8Array(16).buffer)).toThrow(/not a valid JPEG/i);
  });

  it('throws on truncated segment (claims length beyond buffer)', () => {
    // Build a JPEG where APP1 claims a length larger than the buffer.
    const soi = new Uint8Array([0xff, 0xd8]);
    // APP1 marker with length = 0x00FF (255 bytes) but no actual payload.
    const truncatedApp1 = new Uint8Array([0xff, 0xe1, 0x00, 0xff]);
    const buf = concat([soi, truncatedApp1]);
    expect(() => stripJpeg(buf)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// stripJpeg — real-world-like scenario
// ---------------------------------------------------------------------------

describe('stripJpeg – combined scenario', () => {
  it('strips all metadata markers and preserves structure in one call', () => {
    const jfifPayload = new Uint8Array([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    const iccPayload = new Uint8Array([0x49, 0x43, 0x43, 0x5f, 0x50, 0x52]);
    const exifPayload = new Uint8Array(30).fill(0x45); // large EXIF block
    const iptcPayload = new Uint8Array(30).fill(0x50); // large IPTC block
    const commentPayload = new Uint8Array(Array.from('GPS: 37.7749,-122.4194').map(c => c.charCodeAt(0)));
    const scanData = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

    const input = buildJpeg(
      [
        { marker: 0xffe0, payload: jfifPayload },   // JFIF — keep
        { marker: 0xffe1, payload: exifPayload },   // EXIF — strip
        { marker: 0xffe2, payload: iccPayload },    // ICC  — keep
        { marker: 0xffed, payload: iptcPayload },   // IPTC — strip
        { marker: 0xfffe, payload: commentPayload }, // COM  — strip
      ],
      scanData
    );

    const output = stripJpeg(input);

    // Stripped markers gone.
    expect(hasMarker(output, 0xffe1)).toBe(false);
    expect(hasMarker(output, 0xffed)).toBe(false);
    expect(hasMarker(output, 0xfffe)).toBe(false);

    // Preserved markers present.
    expect(hasMarker(output, 0xffe0)).toBe(true);
    expect(hasMarker(output, 0xffe2)).toBe(true);

    // Output is smaller.
    expect(output.byteLength).toBeLessThan(input.byteLength);

    // Still a valid JPEG.
    expect(isJpeg(output)).toBe(true);
  });
});
