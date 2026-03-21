import { describe, it, expect } from 'vitest';
import { stripJpeg } from '../src/strip-jpeg';
import { stripPng } from '../src/strip-png';
import { stripWebp } from '../src/strip-webp';
import { detectFormat, isJpeg, isPng, isWebp } from '../src/detect';
import { validateOutput } from '../src/safety';

// ===========================================================================
// Shared helper: concat Uint8Arrays
// ===========================================================================

function concat(chunks: Uint8Array[]): Buffer {
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = Buffer.allocUnsafe(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

// ===========================================================================
// JPEG helpers
// ===========================================================================

interface MarkerSegment {
  marker: number;
  payload?: Uint8Array;
}

function encodeJpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const totalLength = 2 + payload.byteLength;
  const out = new Uint8Array(2 + 2 + payload.byteLength);
  out[0] = 0xff;
  out[1] = marker & 0xff;
  out[2] = (totalLength >> 8) & 0xff;
  out[3] = totalLength & 0xff;
  out.set(payload, 4);
  return out;
}

function buildJpeg(
  segments: MarkerSegment[],
  scanData: Uint8Array = new Uint8Array([0xab, 0xcd, 0xef])
): Buffer {
  const parts: Uint8Array[] = [];
  parts.push(new Uint8Array([0xff, 0xd8])); // SOI
  for (const seg of segments) {
    parts.push(encodeJpegSegment(seg.marker, seg.payload ?? new Uint8Array(0)));
  }
  // SOS (minimal)
  parts.push(encodeJpegSegment(0xffda, new Uint8Array([0x00])));
  parts.push(scanData);
  parts.push(new Uint8Array([0xff, 0xd9])); // EOI
  return concat(parts);
}

function findJpegMarker(buf: Buffer, marker: number): number {
  const hi = (marker >> 8) & 0xff;
  const lo = marker & 0xff;
  for (let i = 0; i < buf.byteLength - 1; i++) {
    if (buf[i] === hi && buf[i + 1] === lo) return i;
  }
  return -1;
}

function hasJpegMarker(buf: Buffer, marker: number): boolean {
  return findJpegMarker(buf, marker) !== -1;
}

// ===========================================================================
// PNG helpers
// ===========================================================================

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function encodePngChunk(type: string, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const typeBytes = new Uint8Array(type.split('').map((c) => c.charCodeAt(0)));
  const totalSize = 4 + 4 + data.byteLength + 4;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength, false);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.byteLength);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.byteLength, crc32(crcInput), false);
  return out;
}

function buildPng(extraChunks: Array<{ type: string; data?: Uint8Array }> = []): Buffer {
  const parts: Uint8Array[] = [];
  parts.push(PNG_SIG);
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, 1, false);
  ihdrView.setUint32(4, 1, false);
  ihdrData[8] = 8;
  parts.push(encodePngChunk('IHDR', ihdrData));
  for (const chunk of extraChunks) {
    parts.push(encodePngChunk(chunk.type, chunk.data ?? new Uint8Array(0)));
  }
  const idatData = new Uint8Array([0x78, 0x01, 0x62, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);
  parts.push(encodePngChunk('IDAT', idatData));
  parts.push(encodePngChunk('IEND'));
  return concat(parts);
}

function findPngChunk(buf: Buffer, type: string): number {
  const typeBytes = type.split('').map((c) => c.charCodeAt(0));
  let offset = 8;
  while (offset + 12 <= buf.byteLength) {
    const dataLen =
      ((buf[offset]! << 24) | (buf[offset + 1]! << 16) | (buf[offset + 2]! << 8) | buf[offset + 3]!) >>> 0;
    if (
      buf[offset + 4] === typeBytes[0] &&
      buf[offset + 5] === typeBytes[1] &&
      buf[offset + 6] === typeBytes[2] &&
      buf[offset + 7] === typeBytes[3]
    ) {
      return offset;
    }
    offset += 12 + dataLen;
  }
  return -1;
}

function hasPngChunk(buf: Buffer, type: string): boolean {
  return findPngChunk(buf, type) !== -1;
}

// ===========================================================================
// WebP helpers
// ===========================================================================

function fourCC(s: string): number {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>>
    0
  );
}

function encodeWebpChunk(type: string, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const paddedSize = data.byteLength + (data.byteLength & 1);
  const out = new Uint8Array(8 + paddedSize);
  const view = new DataView(out.buffer);
  view.setUint32(0, fourCC(type), true);
  view.setUint32(4, data.byteLength, true);
  out.set(data, 8);
  return out;
}

function makeVp8xData(flags: number): Uint8Array {
  const data = new Uint8Array(10);
  data[0] = flags & 0xff;
  return data;
}

function buildWebp(options: {
  vp8xFlags?: number;
  extraChunks?: Array<{ type: string; data?: Uint8Array }>;
  vp8Data?: Uint8Array;
} = {}): Buffer {
  const {
    vp8xFlags = 0x00,
    extraChunks = [],
    vp8Data = new Uint8Array([0x30, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00]),
  } = options;

  const innerParts: Uint8Array[] = [];
  innerParts.push(encodeWebpChunk('VP8X', makeVp8xData(vp8xFlags)));
  innerParts.push(encodeWebpChunk('VP8 ', vp8Data));
  for (const chunk of extraChunks) {
    innerParts.push(encodeWebpChunk(chunk.type, chunk.data ?? new Uint8Array([0xde, 0xad, 0xbe, 0xef])));
  }

  const innerSize = innerParts.reduce((acc, p) => acc + p.byteLength, 0);
  const header = new Uint8Array(12);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, fourCC('RIFF'), true);
  headerView.setUint32(4, innerSize + 4, true);
  headerView.setUint32(8, fourCC('WEBP'), true);

  return concat([header, ...innerParts]);
}

function findWebpChunk(buf: Buffer, type: string): number {
  const cc = fourCC(type);
  let offset = 12;
  while (offset + 8 <= buf.byteLength) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const chunkCC = view.getUint32(offset, true);
    const dataSize = view.getUint32(offset + 4, true);
    if (chunkCC === cc) return offset;
    const paddedDataSize = dataSize + (dataSize & 1);
    offset += 8 + paddedDataSize;
  }
  return -1;
}

function hasWebpChunk(buf: Buffer, type: string): boolean {
  return findWebpChunk(buf, type) !== -1;
}

function getVp8xFlags(buf: Buffer): number {
  const offset = findWebpChunk(buf, 'VP8X');
  if (offset === -1) return -1;
  return buf[offset + 8]!;
}

function getRiffSize(buf: Buffer): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return view.getUint32(4, true);
}

// ===========================================================================
// detect.ts tests
// ===========================================================================

describe('detectFormat', () => {
  it('detects JPEG', () => {
    const buf = buildJpeg([]);
    expect(detectFormat(buf)).toBe('jpeg');
  });

  it('detects PNG', () => {
    const buf = buildPng();
    expect(detectFormat(buf)).toBe('png');
  });

  it('detects WebP', () => {
    const buf = buildWebp();
    expect(detectFormat(buf)).toBe('webp');
  });

  it('returns null for unknown format', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    expect(detectFormat(buf)).toBeNull();
  });

  it('returns null for empty buffer', () => {
    expect(detectFormat(Buffer.alloc(0))).toBeNull();
  });
});

describe('isJpeg (detect)', () => {
  it('returns true for a valid JPEG Buffer', () => {
    expect(isJpeg(buildJpeg([]))).toBe(true);
  });

  it('returns false for PNG magic bytes', () => {
    expect(isJpeg(buildPng())).toBe(false);
  });

  it('returns false for empty Buffer', () => {
    expect(isJpeg(Buffer.alloc(0))).toBe(false);
  });

  it('returns false for 1-byte Buffer', () => {
    expect(isJpeg(Buffer.from([0xff]))).toBe(false);
  });

  it('returns false for all-zero bytes', () => {
    expect(isJpeg(Buffer.alloc(8))).toBe(false);
  });
});

describe('isPng (detect)', () => {
  it('returns true for a valid PNG Buffer', () => {
    expect(isPng(buildPng())).toBe(true);
  });

  it('returns false for JPEG magic bytes', () => {
    expect(isPng(buildJpeg([]))).toBe(false);
  });

  it('returns false for empty Buffer', () => {
    expect(isPng(Buffer.alloc(0))).toBe(false);
  });

  it('returns false for shorter-than-8-byte Buffer', () => {
    expect(isPng(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('returns false when one signature byte is wrong', () => {
    const buf = Buffer.from(PNG_SIG);
    buf[0] = 0x00;
    expect(isPng(buf)).toBe(false);
  });
});

describe('isWebp (detect)', () => {
  it('returns true for a valid WebP Buffer', () => {
    expect(isWebp(buildWebp())).toBe(true);
  });

  it('returns false for JPEG magic bytes', () => {
    expect(isWebp(buildJpeg([]))).toBe(false);
  });

  it('returns false for empty Buffer', () => {
    expect(isWebp(Buffer.alloc(0))).toBe(false);
  });

  it('returns false for buffer shorter than 12 bytes', () => {
    expect(isWebp(Buffer.from([0x52, 0x49, 0x46, 0x46]))).toBe(false);
  });

  it('returns false when RIFF present but WEBP tag missing', () => {
    const buf = Buffer.alloc(12);
    const view = new DataView(buf.buffer);
    view.setUint32(0, fourCC('RIFF'), true);
    view.setUint32(4, 4, true);
    view.setUint32(8, fourCC('JPEG'), true);
    expect(isWebp(buf)).toBe(false);
  });
});

// ===========================================================================
// safety.ts tests
// ===========================================================================

describe('validateOutput', () => {
  it('validates correct JPEG output', () => {
    const buf = buildJpeg([]);
    expect(validateOutput(buf, 'jpeg')).toBe(true);
  });

  it('validates correct PNG output', () => {
    const buf = buildPng();
    expect(validateOutput(buf, 'png')).toBe(true);
  });

  it('validates correct WebP output', () => {
    const buf = buildWebp();
    expect(validateOutput(buf, 'webp')).toBe(true);
  });

  it('rejects empty buffer', () => {
    expect(validateOutput(Buffer.alloc(0), 'jpeg')).toBe(false);
    expect(validateOutput(Buffer.alloc(0), 'png')).toBe(false);
    expect(validateOutput(Buffer.alloc(0), 'webp')).toBe(false);
  });

  it('rejects wrong format (JPEG buffer checked as PNG)', () => {
    const jpegBuf = buildJpeg([]);
    expect(validateOutput(jpegBuf, 'png')).toBe(false);
  });

  it('rejects wrong format (PNG buffer checked as JPEG)', () => {
    const pngBuf = buildPng();
    expect(validateOutput(pngBuf, 'jpeg')).toBe(false);
  });

  it('rejects wrong format (WebP buffer checked as JPEG)', () => {
    const webpBuf = buildWebp();
    expect(validateOutput(webpBuf, 'jpeg')).toBe(false);
  });

  it('validates stripped JPEG output', () => {
    const input = buildJpeg([{ marker: 0xffe1, payload: new Uint8Array([0x45, 0x78]) }]);
    const { output } = stripJpeg(input);
    expect(validateOutput(output, 'jpeg')).toBe(true);
  });

  it('validates stripped PNG output', () => {
    const input = buildPng([{ type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }]);
    const { output } = stripPng(input);
    expect(validateOutput(output, 'png')).toBe(true);
  });

  it('validates stripped WebP output', () => {
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01, 0x02]) }],
    });
    const { output } = stripWebp(input);
    expect(validateOutput(output, 'webp')).toBe(true);
  });
});

// ===========================================================================
// strip-jpeg.ts tests
// ===========================================================================

describe('stripJpeg – output validity', () => {
  it('output begins with SOI marker', () => {
    const input = buildJpeg([]);
    const { output } = stripJpeg(input);
    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xd8);
  });

  it('output ends with EOI marker', () => {
    const input = buildJpeg([]);
    const { output } = stripJpeg(input);
    expect(output[output.length - 2]).toBe(0xff);
    expect(output[output.length - 1]).toBe(0xd9);
  });

  it('output is still a valid JPEG', () => {
    const input = buildJpeg([]);
    const { output } = stripJpeg(input);
    expect(isJpeg(output)).toBe(true);
  });
});

describe('stripJpeg – removes metadata markers', () => {
  it('removes APP1 (EXIF)', () => {
    const payload = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
    const input = buildJpeg([{ marker: 0xffe1, payload }]);
    expect(hasJpegMarker(input, 0xffe1)).toBe(true);
    const { output } = stripJpeg(input);
    expect(hasJpegMarker(output, 0xffe1)).toBe(false);
  });

  it('removes APP13 (IPTC)', () => {
    const payload = new Uint8Array([0x50, 0x68, 0x6f, 0x74, 0x6f, 0x73, 0x68, 0x6f, 0x70]);
    const input = buildJpeg([{ marker: 0xffed, payload }]);
    expect(hasJpegMarker(input, 0xffed)).toBe(true);
    const { output } = stripJpeg(input);
    expect(hasJpegMarker(output, 0xffed)).toBe(false);
  });

  it('removes COM (comment)', () => {
    const payload = new Uint8Array(Array.from('Created by Camera').map((c) => c.charCodeAt(0)));
    const input = buildJpeg([{ marker: 0xfffe, payload }]);
    expect(hasJpegMarker(input, 0xfffe)).toBe(true);
    const { output } = stripJpeg(input);
    expect(hasJpegMarker(output, 0xfffe)).toBe(false);
  });

  it('removes multiple metadata markers in one pass', () => {
    const input = buildJpeg([
      { marker: 0xffe1, payload: new Uint8Array([0x45, 0x78]) },
      { marker: 0xffed, payload: new Uint8Array([0x50, 0x68]) },
      { marker: 0xfffe, payload: new Uint8Array([0x48, 0x69]) },
    ]);
    const { output } = stripJpeg(input);
    expect(hasJpegMarker(output, 0xffe1)).toBe(false);
    expect(hasJpegMarker(output, 0xffed)).toBe(false);
    expect(hasJpegMarker(output, 0xfffe)).toBe(false);
  });
});

describe('stripJpeg – preserves required markers', () => {
  it('preserves APP0 (JFIF)', () => {
    const jfifPayload = new Uint8Array([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    const input = buildJpeg([{ marker: 0xffe0, payload: jfifPayload }]);
    const { output } = stripJpeg(input);
    expect(hasJpegMarker(output, 0xffe0)).toBe(true);
  });

  it('preserves APP2 (ICC) always', () => {
    const iccPayload = new Uint8Array([0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00]);
    const input = buildJpeg([{ marker: 0xffe2, payload: iccPayload }]);
    const { output } = stripJpeg(input);
    expect(hasJpegMarker(output, 0xffe2)).toBe(true);
  });

  it('preserves APP0 even when APP1 is present', () => {
    const jfifPayload = new Uint8Array([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    const exifPayload = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
    const input = buildJpeg([
      { marker: 0xffe0, payload: jfifPayload },
      { marker: 0xffe1, payload: exifPayload },
    ]);
    const { output } = stripJpeg(input);
    expect(hasJpegMarker(output, 0xffe0)).toBe(true);
    expect(hasJpegMarker(output, 0xffe1)).toBe(false);
  });
});

describe('stripJpeg – scan data preserved', () => {
  it('scan data is bit-identical after stripping', () => {
    const scanData = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]);
    const input = buildJpeg(
      [{ marker: 0xffe1, payload: new Uint8Array([0x45, 0x78]) }],
      scanData
    );
    const { output } = stripJpeg(input);
    const sosOffset = findJpegMarker(output, 0xffda);
    expect(sosOffset).toBeGreaterThan(-1);
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
    const sosSegLen = view.getUint16(sosOffset + 2);
    const scanStart = sosOffset + 2 + sosSegLen;
    const outputScan = output.subarray(scanStart, scanStart + scanData.byteLength);
    expect(Buffer.from(outputScan)).toEqual(Buffer.from(scanData));
  });
});

describe('stripJpeg – output size', () => {
  it('output is smaller than input when metadata is present', () => {
    const bigPayload = new Uint8Array(50).fill(0xaa);
    const input = buildJpeg([
      { marker: 0xffe1, payload: bigPayload },
      { marker: 0xffed, payload: bigPayload },
    ]);
    const { output } = stripJpeg(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('output size equals input when no strippable markers are present', () => {
    const input = buildJpeg([]);
    const { output } = stripJpeg(input);
    expect(output.byteLength).toBe(input.byteLength);
  });
});

describe('stripJpeg – category tracking', () => {
  it('returns GPS, device, timestamps categories for APP1', () => {
    const input = buildJpeg([{ marker: 0xffe1, payload: new Uint8Array([0x45, 0x78]) }]);
    const { categories } = stripJpeg(input);
    expect(categories).toContain('GPS');
    expect(categories).toContain('device');
    expect(categories).toContain('timestamps');
  });

  it('returns IPTC category for APP13', () => {
    const input = buildJpeg([{ marker: 0xffed, payload: new Uint8Array([0x50]) }]);
    const { categories } = stripJpeg(input);
    expect(categories).toContain('IPTC');
  });

  it('returns comments category for COM', () => {
    const input = buildJpeg([{ marker: 0xfffe, payload: new Uint8Array([0x48, 0x69]) }]);
    const { categories } = stripJpeg(input);
    expect(categories).toContain('comments');
  });

  it('returns empty categories when no metadata markers present', () => {
    const input = buildJpeg([]);
    const { categories } = stripJpeg(input);
    expect(categories).toEqual([]);
  });

  it('deduplicates categories when multiple APP1 segments present', () => {
    const input = buildJpeg([
      { marker: 0xffe1, payload: new Uint8Array([0x45, 0x78]) },
      { marker: 0xffe1, payload: new Uint8Array([0x68, 0x74]) },
    ]);
    const { categories } = stripJpeg(input);
    const gpsCounts = categories.filter((c) => c === 'GPS').length;
    expect(gpsCounts).toBe(1);
  });

  it('returns combined categories for mixed metadata', () => {
    const input = buildJpeg([
      { marker: 0xffe1, payload: new Uint8Array([0x45, 0x78]) },
      { marker: 0xffed, payload: new Uint8Array([0x50]) },
      { marker: 0xfffe, payload: new Uint8Array([0x48, 0x69]) },
    ]);
    const { categories } = stripJpeg(input);
    expect(categories).toContain('GPS');
    expect(categories).toContain('IPTC');
    expect(categories).toContain('comments');
  });

  it('ICC preservation does not appear in categories', () => {
    const iccPayload = new Uint8Array([0x49, 0x43, 0x43, 0x5f]);
    const input = buildJpeg([{ marker: 0xffe2, payload: iccPayload }]);
    const { categories } = stripJpeg(input);
    expect(categories).toEqual([]);
  });
});

describe('stripJpeg – error handling', () => {
  it('throws on non-JPEG input', () => {
    const png = buildPng();
    expect(() => stripJpeg(png)).toThrow(/not a valid JPEG/i);
  });

  it('throws on empty Buffer', () => {
    expect(() => stripJpeg(Buffer.alloc(0))).toThrow(/not a valid JPEG/i);
  });

  it('throws on all-zero buffer', () => {
    expect(() => stripJpeg(Buffer.alloc(16))).toThrow(/not a valid JPEG/i);
  });
});

// ===========================================================================
// strip-png.ts tests
// ===========================================================================

describe('stripPng – output validity', () => {
  it('output starts with PNG signature', () => {
    const input = buildPng();
    const { output } = stripPng(input);
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) {
      expect(output[i]).toBe(sig[i]);
    }
  });

  it('output is still detected as PNG', () => {
    const input = buildPng([{ type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }]);
    const { output } = stripPng(input);
    expect(isPng(output)).toBe(true);
  });
});

describe('stripPng – removes metadata chunks', () => {
  it('removes tEXt chunk', () => {
    const data = new Uint8Array(Array.from('Comment\x00Hello').map((c) => c.charCodeAt(0)));
    const input = buildPng([{ type: 'tEXt', data }]);
    expect(hasPngChunk(input, 'tEXt')).toBe(true);
    const { output } = stripPng(input);
    expect(hasPngChunk(output, 'tEXt')).toBe(false);
  });

  it('removes iTXt chunk', () => {
    const data = new Uint8Array(Array.from('XML:com.adobe.xmp\x00\x00\x00\x00\x00<x/>').map((c) => c.charCodeAt(0)));
    const input = buildPng([{ type: 'iTXt', data }]);
    expect(hasPngChunk(input, 'iTXt')).toBe(true);
    const { output } = stripPng(input);
    expect(hasPngChunk(output, 'iTXt')).toBe(false);
  });

  it('removes zTXt chunk', () => {
    const data = new Uint8Array([0x41, 0x00, 0x00, 0x78, 0x9c, 0x4b, 0xcb, 0x2f, 0x02, 0x00]);
    const input = buildPng([{ type: 'zTXt', data }]);
    expect(hasPngChunk(input, 'zTXt')).toBe(true);
    const { output } = stripPng(input);
    expect(hasPngChunk(output, 'zTXt')).toBe(false);
  });

  it('removes eXIf chunk', () => {
    const data = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const input = buildPng([{ type: 'eXIf', data }]);
    expect(hasPngChunk(input, 'eXIf')).toBe(true);
    const { output } = stripPng(input);
    expect(hasPngChunk(output, 'eXIf')).toBe(false);
  });

  it('removes multiple metadata chunks in one pass', () => {
    const input = buildPng([
      { type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) },
      { type: 'iTXt', data: new Uint8Array([0x63, 0x00, 0x64]) },
      { type: 'zTXt', data: new Uint8Array([0x65, 0x00, 0x00, 0x78, 0x9c]) },
      { type: 'eXIf', data: new Uint8Array([0x49, 0x49, 0x2a, 0x00]) },
    ]);
    const { output } = stripPng(input);
    expect(hasPngChunk(output, 'tEXt')).toBe(false);
    expect(hasPngChunk(output, 'iTXt')).toBe(false);
    expect(hasPngChunk(output, 'zTXt')).toBe(false);
    expect(hasPngChunk(output, 'eXIf')).toBe(false);
  });
});

describe('stripPng – preserves critical chunks', () => {
  it('preserves IHDR', () => {
    const input = buildPng([{ type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }]);
    const { output } = stripPng(input);
    expect(hasPngChunk(output, 'IHDR')).toBe(true);
  });

  it('preserves IDAT', () => {
    const input = buildPng([{ type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }]);
    const { output } = stripPng(input);
    expect(hasPngChunk(output, 'IDAT')).toBe(true);
  });

  it('preserves IEND', () => {
    const input = buildPng([{ type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }]);
    const { output } = stripPng(input);
    expect(hasPngChunk(output, 'IEND')).toBe(true);
  });

  it('preserves iCCP (ICC profile) always', () => {
    const iccpData = new Uint8Array([0x73, 0x52, 0x47, 0x42, 0x00, 0x00, 0x78, 0x9c, 0x01, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01]);
    const input = buildPng([{ type: 'iCCP', data: iccpData }]);
    expect(hasPngChunk(input, 'iCCP')).toBe(true);
    const { output } = stripPng(input);
    expect(hasPngChunk(output, 'iCCP')).toBe(true);
  });
});

describe('stripPng – output size', () => {
  it('output is smaller than input when metadata chunks are present', () => {
    const bigData = new Uint8Array(100).fill(0xaa);
    const input = buildPng([
      { type: 'tEXt', data: bigData },
      { type: 'iTXt', data: bigData },
    ]);
    const { output } = stripPng(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('output size equals input when no strippable chunks are present', () => {
    const input = buildPng();
    const { output } = stripPng(input);
    expect(output.byteLength).toBe(input.byteLength);
  });
});

describe('stripPng – category tracking', () => {
  it('returns "text metadata" category for tEXt', () => {
    const input = buildPng([{ type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }]);
    const { categories } = stripPng(input);
    expect(categories).toContain('text metadata');
  });

  it('returns "text metadata" category for iTXt', () => {
    const input = buildPng([{ type: 'iTXt', data: new Uint8Array([0x63, 0x00, 0x64]) }]);
    const { categories } = stripPng(input);
    expect(categories).toContain('text metadata');
  });

  it('returns "text metadata" category for zTXt', () => {
    const input = buildPng([{ type: 'zTXt', data: new Uint8Array([0x65, 0x00, 0x00, 0x78, 0x9c]) }]);
    const { categories } = stripPng(input);
    expect(categories).toContain('text metadata');
  });

  it('returns GPS, device, timestamps categories for eXIf', () => {
    const input = buildPng([{ type: 'eXIf', data: new Uint8Array([0x49, 0x49, 0x2a, 0x00]) }]);
    const { categories } = stripPng(input);
    expect(categories).toContain('GPS');
    expect(categories).toContain('device');
    expect(categories).toContain('timestamps');
  });

  it('returns empty categories when no metadata chunks present', () => {
    const input = buildPng();
    const { categories } = stripPng(input);
    expect(categories).toEqual([]);
  });

  it('deduplicates categories when multiple text chunks present', () => {
    const input = buildPng([
      { type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) },
      { type: 'iTXt', data: new Uint8Array([0x63, 0x00, 0x64]) },
    ]);
    const { categories } = stripPng(input);
    const count = categories.filter((c) => c === 'text metadata').length;
    expect(count).toBe(1);
  });

  it('ICC preservation does not appear in categories', () => {
    const iccpData = new Uint8Array([0x73, 0x52, 0x47, 0x42, 0x00, 0x00, 0x78, 0x9c, 0x01, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01]);
    const input = buildPng([{ type: 'iCCP', data: iccpData }]);
    const { categories } = stripPng(input);
    expect(categories).toEqual([]);
  });
});

describe('stripPng – error handling', () => {
  it('throws on non-PNG input (JPEG)', () => {
    const jpeg = buildJpeg([]);
    expect(() => stripPng(jpeg)).toThrow(/not a valid PNG/i);
  });

  it('throws on empty Buffer', () => {
    expect(() => stripPng(Buffer.alloc(0))).toThrow(/not a valid PNG/i);
  });

  it('throws on all-zero buffer', () => {
    expect(() => stripPng(Buffer.alloc(32))).toThrow(/not a valid PNG/i);
  });
});

// ===========================================================================
// strip-webp.ts tests
// ===========================================================================

describe('stripWebp – output validity', () => {
  it('output is still detected as WebP', () => {
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01, 0x02]) }],
    });
    const { output } = stripWebp(input);
    expect(isWebp(output)).toBe(true);
  });
});

describe('stripWebp – removes EXIF chunk', () => {
  it('removes an EXIF chunk', () => {
    const exifData = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: exifData }],
    });
    expect(hasWebpChunk(input, 'EXIF')).toBe(true);
    const { output } = stripWebp(input);
    expect(hasWebpChunk(output, 'EXIF')).toBe(false);
  });

  it('output is smaller after removing EXIF', () => {
    const bigExif = new Uint8Array(200).fill(0xee);
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: bigExif }],
    });
    const { output } = stripWebp(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });
});

describe('stripWebp – removes XMP chunk', () => {
  it('removes an XMP chunk', () => {
    const xmpData = new Uint8Array(Array.from('<x:xmpmeta/>').map((c) => c.charCodeAt(0)));
    const input = buildWebp({
      vp8xFlags: 0x20,
      extraChunks: [{ type: 'XMP ', data: xmpData }],
    });
    expect(hasWebpChunk(input, 'XMP ')).toBe(true);
    const { output } = stripWebp(input);
    expect(hasWebpChunk(output, 'XMP ')).toBe(false);
  });

  it('removes both EXIF and XMP in a single call', () => {
    const input = buildWebp({
      vp8xFlags: 0x30,
      extraChunks: [
        { type: 'EXIF', data: new Uint8Array([0x49, 0x49, 0x2a, 0x00]) },
        { type: 'XMP ', data: new Uint8Array(Array.from('<x:xmpmeta/>').map((c) => c.charCodeAt(0))) },
      ],
    });
    const { output } = stripWebp(input);
    expect(hasWebpChunk(output, 'EXIF')).toBe(false);
    expect(hasWebpChunk(output, 'XMP ')).toBe(false);
  });
});

describe('stripWebp – preserves image data', () => {
  it('preserves VP8 chunk', () => {
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01, 0x02]) }],
    });
    const { output } = stripWebp(input);
    expect(hasWebpChunk(output, 'VP8 ')).toBe(true);
  });

  it('preserves VP8X chunk', () => {
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01, 0x02]) }],
    });
    const { output } = stripWebp(input);
    expect(hasWebpChunk(output, 'VP8X')).toBe(true);
  });

  it('preserves ICCP (ICC profile) always', () => {
    const input = buildWebp({
      vp8xFlags: 0x14,
      extraChunks: [
        { type: 'ICCP', data: new Uint8Array([0x00, 0x01, 0x02]) },
        { type: 'EXIF', data: new Uint8Array([0x49, 0x49]) },
      ],
    });
    const { output } = stripWebp(input);
    expect(hasWebpChunk(output, 'ICCP')).toBe(true);
  });

  it('VP8 image data bytes are bit-identical after stripping', () => {
    const vp8Data = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe]);
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01]) }],
      vp8Data,
    });
    const { output } = stripWebp(input);
    const vp8Offset = findWebpChunk(output, 'VP8 ');
    expect(vp8Offset).toBeGreaterThan(-1);
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
    const vp8DataSize = view.getUint32(vp8Offset + 4, true);
    expect(vp8DataSize).toBe(vp8Data.byteLength);
    const outVp8Data = output.subarray(vp8Offset + 8, vp8Offset + 8 + vp8DataSize);
    expect(Buffer.from(outVp8Data)).toEqual(Buffer.from(vp8Data));
  });
});

describe('stripWebp – VP8X flags update', () => {
  it('clears EXIF bit (bit 4) after stripping EXIF', () => {
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x01, 0x02]) }],
    });
    const { output } = stripWebp(input);
    expect(getVp8xFlags(output) & (1 << 4)).toBe(0);
  });

  it('clears XMP bit (bit 5) after stripping XMP', () => {
    const input = buildWebp({
      vp8xFlags: 0x20,
      extraChunks: [{ type: 'XMP ', data: new Uint8Array([0x3c, 0x78]) }],
    });
    const { output } = stripWebp(input);
    expect(getVp8xFlags(output) & (1 << 5)).toBe(0);
  });

  it('clears both EXIF and XMP bits when both chunks are removed', () => {
    const input = buildWebp({
      vp8xFlags: 0x30,
      extraChunks: [
        { type: 'EXIF', data: new Uint8Array([0x01]) },
        { type: 'XMP ', data: new Uint8Array([0x02]) },
      ],
    });
    const { output } = stripWebp(input);
    const flags = getVp8xFlags(output);
    expect(flags & (1 << 4)).toBe(0);
    expect(flags & (1 << 5)).toBe(0);
  });

  it('preserves ICC bit (bit 2) when EXIF/XMP are stripped', () => {
    const input = buildWebp({
      vp8xFlags: 0x14,
      extraChunks: [
        { type: 'ICCP', data: new Uint8Array([0x00, 0x01]) },
        { type: 'EXIF', data: new Uint8Array([0x49, 0x49]) },
      ],
    });
    const { output } = stripWebp(input);
    const flags = getVp8xFlags(output);
    expect(flags & (1 << 2)).toBe(1 << 2);
    expect(flags & (1 << 4)).toBe(0);
  });
});

describe('stripWebp – RIFF file size header', () => {
  it('RIFF size field equals total file size minus 8 after stripping', () => {
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array(50).fill(0xee) }],
    });
    const { output } = stripWebp(input);
    expect(getRiffSize(output)).toBe(output.byteLength - 8);
  });

  it('RIFF size field is correct when no metadata is stripped', () => {
    const input = buildWebp();
    const { output } = stripWebp(input);
    expect(getRiffSize(output)).toBe(output.byteLength - 8);
  });
});

describe('stripWebp – category tracking', () => {
  it('returns GPS, device, timestamps categories for EXIF', () => {
    const input = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: new Uint8Array([0x49, 0x49]) }],
    });
    const { categories } = stripWebp(input);
    expect(categories).toContain('GPS');
    expect(categories).toContain('device');
    expect(categories).toContain('timestamps');
  });

  it('returns XMP category for XMP chunk', () => {
    const input = buildWebp({
      vp8xFlags: 0x20,
      extraChunks: [{ type: 'XMP ', data: new Uint8Array([0x3c, 0x78]) }],
    });
    const { categories } = stripWebp(input);
    expect(categories).toContain('XMP');
  });

  it('returns empty categories when no metadata chunks present', () => {
    const input = buildWebp();
    const { categories } = stripWebp(input);
    expect(categories).toEqual([]);
  });

  it('returns combined categories for EXIF and XMP', () => {
    const input = buildWebp({
      vp8xFlags: 0x30,
      extraChunks: [
        { type: 'EXIF', data: new Uint8Array([0x49, 0x49]) },
        { type: 'XMP ', data: new Uint8Array([0x3c, 0x78]) },
      ],
    });
    const { categories } = stripWebp(input);
    expect(categories).toContain('GPS');
    expect(categories).toContain('XMP');
  });

  it('ICC preservation does not appear in categories', () => {
    const input = buildWebp({
      vp8xFlags: 0x04,
      extraChunks: [{ type: 'ICCP', data: new Uint8Array([0x00, 0x01]) }],
    });
    const { categories } = stripWebp(input);
    expect(categories).toEqual([]);
  });
});

describe('stripWebp – error handling', () => {
  it('throws on non-WebP input (JPEG)', () => {
    const jpeg = buildJpeg([]);
    expect(() => stripWebp(jpeg)).toThrow(/not a valid WebP/i);
  });

  it('throws on empty Buffer', () => {
    expect(() => stripWebp(Buffer.alloc(0))).toThrow(/not a valid WebP/i);
  });

  it('throws on all-zero buffer', () => {
    expect(() => stripWebp(Buffer.alloc(32))).toThrow(/not a valid WebP/i);
  });

  it('throws when RIFF present but WEBP tag is wrong', () => {
    const buf = Buffer.alloc(12);
    const view = new DataView(buf.buffer);
    view.setUint32(0, fourCC('RIFF'), true);
    view.setUint32(4, 4, true);
    view.setUint32(8, fourCC('WAVE'), true);
    expect(() => stripWebp(buf)).toThrow(/not a valid WebP/i);
  });
});

// ===========================================================================
// Cross-format: ICC always preserved
// ===========================================================================

describe('ICC profiles always preserved', () => {
  it('JPEG: APP2 (ICC) is preserved', () => {
    const iccPayload = new Uint8Array([0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00]);
    const input = buildJpeg([
      { marker: 0xffe2, payload: iccPayload },
      { marker: 0xffe1, payload: new Uint8Array([0x45, 0x78]) },
    ]);
    const { output } = stripJpeg(input);
    expect(hasJpegMarker(output, 0xffe2)).toBe(true);
    expect(hasJpegMarker(output, 0xffe1)).toBe(false);
  });

  it('PNG: iCCP is preserved', () => {
    const iccpData = new Uint8Array([0x73, 0x52, 0x47, 0x42, 0x00, 0x00, 0x78, 0x9c, 0x01, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01]);
    const input = buildPng([
      { type: 'iCCP', data: iccpData },
      { type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) },
    ]);
    const { output } = stripPng(input);
    expect(hasPngChunk(output, 'iCCP')).toBe(true);
    expect(hasPngChunk(output, 'tEXt')).toBe(false);
  });

  it('WebP: ICCP is preserved', () => {
    const input = buildWebp({
      vp8xFlags: 0x14,
      extraChunks: [
        { type: 'ICCP', data: new Uint8Array([0x00, 0x01, 0x02]) },
        { type: 'EXIF', data: new Uint8Array([0x49, 0x49]) },
      ],
    });
    const { output } = stripWebp(input);
    expect(hasWebpChunk(output, 'ICCP')).toBe(true);
    expect(hasWebpChunk(output, 'EXIF')).toBe(false);
  });
});
