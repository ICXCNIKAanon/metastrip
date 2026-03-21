import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { stripFile } from '../src/index';

// ===========================================================================
// Temp directory — must be inside process.cwd() so stripFile's path guard passes
// ===========================================================================

const TEST_DIR = path.join(process.cwd(), '__test_tmp__', `integration_${process.pid}`);

afterAll(() => {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

function setupTestDir(): void {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

setupTestDir();

// ===========================================================================
// Shared helper: concat Uint8Arrays → Buffer
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

interface MarkerSegment {
  marker: number;
  payload?: Uint8Array;
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
  parts.push(encodeJpegSegment(0xda, new Uint8Array([0x00])));
  parts.push(scanData);
  parts.push(new Uint8Array([0xff, 0xd9])); // EOI
  return concat(parts);
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

// ===========================================================================
// Integration tests
// ===========================================================================

describe('integration: stripFile on real files', () => {

  it('strips metadata from a JPEG file in-place', async () => {
    // Build a synthetic JPEG with a large APP1 (EXIF) marker
    const exifPayload = new Uint8Array(100).fill(0xaa);
    const jpegBuf = buildJpeg([{ marker: 0xe1, payload: exifPayload }]);
    const filePath = path.join(TEST_DIR, 'with-exif.jpg');
    fs.writeFileSync(filePath, jpegBuf);
    const originalSize = jpegBuf.byteLength;

    const result = await stripFile(filePath);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.metadataRemoved).toBe(true);

    // File on disk should be smaller
    const afterSize = fs.statSync(filePath).size;
    expect(afterSize).toBeLessThan(originalSize);

    // File should still be a valid JPEG (starts with SOI, ends with EOI)
    const afterBuf = fs.readFileSync(filePath);
    expect(afterBuf[0]).toBe(0xff);
    expect(afterBuf[1]).toBe(0xd8);
    expect(afterBuf[afterBuf.length - 2]).toBe(0xff);
    expect(afterBuf[afterBuf.length - 1]).toBe(0xd9);
  });

  it('skips non-image files gracefully', async () => {
    const filePath = path.join(TEST_DIR, 'readme.txt');
    const originalContent = 'This is a plain text file, not an image.\n';
    fs.writeFileSync(filePath, originalContent);

    const result = await stripFile(filePath);

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);

    // File content must be unchanged
    const afterContent = fs.readFileSync(filePath, 'utf8');
    expect(afterContent).toBe(originalContent);
  });

  it('handles already-clean JPEG files (no metadata markers)', async () => {
    // Build a JPEG with no strippable metadata segments
    const cleanJpeg = buildJpeg([]);
    const filePath = path.join(TEST_DIR, 'clean.jpg');
    fs.writeFileSync(filePath, cleanJpeg);
    const originalSize = cleanJpeg.byteLength;

    const result = await stripFile(filePath);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.metadataRemoved).toBe(false);

    // File should be unchanged on disk
    const afterSize = fs.statSync(filePath).size;
    expect(afterSize).toBe(originalSize);
    const afterBuf = fs.readFileSync(filePath);
    expect(afterBuf).toEqual(cleanJpeg);
  });

  it('strips PNG metadata (tEXt chunk) in-place', async () => {
    // Build a PNG with a tEXt chunk containing metadata
    const textData = new Uint8Array(Array.from('Comment\x00Hello from camera').map((c) => c.charCodeAt(0)));
    const pngBuf = buildPng([{ type: 'tEXt', data: textData }]);
    const filePath = path.join(TEST_DIR, 'with-text.png');
    fs.writeFileSync(filePath, pngBuf);
    const originalSize = pngBuf.byteLength;

    const result = await stripFile(filePath);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.metadataRemoved).toBe(true);

    // File should be smaller and still start with PNG signature
    const afterBuf = fs.readFileSync(filePath);
    expect(afterBuf.length).toBeLessThan(originalSize);
    const PNG_SIG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) {
      expect(afterBuf[i]).toBe(PNG_SIG_BYTES[i]);
    }
  });

  it('strips WebP metadata (EXIF chunk) in-place', async () => {
    // Build a WebP with an EXIF chunk
    const exifData = new Uint8Array(80).fill(0xee);
    const webpBuf = buildWebp({
      vp8xFlags: 0x10,
      extraChunks: [{ type: 'EXIF', data: exifData }],
    });
    const filePath = path.join(TEST_DIR, 'with-exif.webp');
    fs.writeFileSync(filePath, webpBuf);
    const originalSize = webpBuf.byteLength;

    const result = await stripFile(filePath);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.metadataRemoved).toBe(true);

    // File should be smaller and still start with RIFF....WEBP
    const afterBuf = fs.readFileSync(filePath);
    expect(afterBuf.length).toBeLessThan(originalSize);
    expect(afterBuf.toString('ascii', 0, 4)).toBe('RIFF');
    expect(afterBuf.toString('ascii', 8, 12)).toBe('WEBP');
  });
});
