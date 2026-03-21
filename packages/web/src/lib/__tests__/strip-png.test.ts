import { describe, it, expect } from 'vitest';
import { isPng, stripPng } from '../strip-png';

// ---------------------------------------------------------------------------
// CRC-32 implementation for building valid PNG chunks
// ---------------------------------------------------------------------------

/** Precomputed CRC-32 lookup table. */
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

/** Computes CRC-32 over the given byte range. */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Test helper: build minimal synthetic PNG buffers
// ---------------------------------------------------------------------------

/** The 8-byte PNG signature. */
const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngChunkDef {
  type: string;
  data?: Uint8Array;
}

/**
 * Encodes a single PNG chunk: length + type + data + CRC.
 * CRC covers the type and data bytes.
 */
function encodeChunk(type: string, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const typeBytes = new Uint8Array(type.split('').map((c) => c.charCodeAt(0)));
  const totalSize = 4 + 4 + data.byteLength + 4; // length + type + data + CRC
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // 4-byte data length (big-endian)
  view.setUint32(0, data.byteLength, false);

  // 4-byte type
  out.set(typeBytes, 4);

  // data
  out.set(data, 8);

  // CRC over type + data
  const crcInput = new Uint8Array(4 + data.byteLength);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.byteLength, crc32(crcInput), false);

  return out;
}

/**
 * Builds a syntactically valid PNG buffer with a minimal IHDR, caller-supplied
 * extra chunks, a minimal IDAT, and IEND.
 *
 * The IHDR encodes a 1×1 8-bit greyscale image. The IDAT contains a single
 * compressed scanline (raw zlib deflate of [0x00, 0x00] — filter byte + pixel).
 * These values are deliberately minimal and are never decoded during tests.
 */
function buildPng(extraChunks: PngChunkDef[] = []): ArrayBuffer {
  const parts: Uint8Array[] = [];

  // Signature
  parts.push(PNG_SIG);

  // IHDR: width=1, height=1, bit_depth=8, color_type=0 (greyscale),
  //       compression=0, filter=0, interlace=0
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, 1, false); // width
  ihdrView.setUint32(4, 1, false); // height
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 0;  // color type: greyscale
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method
  parts.push(encodeChunk('IHDR', ihdrData));

  // Extra caller-supplied chunks
  for (const chunk of extraChunks) {
    parts.push(encodeChunk(chunk.type, chunk.data ?? new Uint8Array(0)));
  }

  // IDAT: minimal valid zlib stream for a 1x1 greyscale image.
  // zlib header (0x78 0x01) + deflate of [0x00 (filter), 0x00 (pixel)] + adler32
  const idatData = new Uint8Array([
    0x78, 0x01, // zlib header: deflate, default compression
    0x62, 0x60, 0x00, 0x00, // deflate: literal block for [0x00, 0x00]
    0x00, 0x02, 0x00, 0x01, // adler32 checksum
  ]);
  parts.push(encodeChunk('IDAT', idatData));

  // IEND
  parts.push(encodeChunk('IEND'));

  return concat(parts);
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

/**
 * Searches for a PNG chunk with the given 4-char type name in the buffer
 * (after the 8-byte signature). Returns the byte offset of the chunk's
 * length field, or -1 if not found.
 */
function findChunkType(buffer: ArrayBuffer, type: string): number {
  const src = new Uint8Array(buffer);
  const typeBytes = type.split('').map((c) => c.charCodeAt(0));
  let offset = 8; // skip signature
  while (offset + 12 <= src.byteLength) {
    const dataLen =
      ((src[offset] << 24) |
        (src[offset + 1] << 16) |
        (src[offset + 2] << 8) |
        src[offset + 3]) >>>
      0;
    // Check type bytes
    if (
      src[offset + 4] === typeBytes[0] &&
      src[offset + 5] === typeBytes[1] &&
      src[offset + 6] === typeBytes[2] &&
      src[offset + 7] === typeBytes[3]
    ) {
      return offset;
    }
    offset += 12 + dataLen;
  }
  return -1;
}

/** Returns true if the given chunk type exists anywhere in the PNG buffer. */
function hasChunk(buffer: ArrayBuffer, type: string): boolean {
  return findChunkType(buffer, type) !== -1;
}

// ---------------------------------------------------------------------------
// isPng
// ---------------------------------------------------------------------------

describe('isPng', () => {
  it('returns true for a valid PNG buffer', () => {
    const buf = buildPng();
    expect(isPng(buf)).toBe(true);
  });

  it('returns false for a JPEG buffer (wrong magic bytes)', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(isPng(jpeg.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isPng(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a buffer shorter than 8 bytes', () => {
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBe(false);
  });

  it('returns false for all-zero bytes', () => {
    expect(isPng(new Uint8Array(16).buffer)).toBe(false);
  });

  it('returns false when signature is almost correct but one byte is wrong', () => {
    const almostPng = new Uint8Array(PNG_SIG);
    almostPng[0] = 0x00; // corrupt first byte
    expect(isPng(almostPng.buffer)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripPng — removes metadata chunks
// ---------------------------------------------------------------------------

describe('stripPng – removes tEXt chunks', () => {
  it('removes a tEXt chunk', () => {
    const textData = new Uint8Array(
      Array.from('Comment\x00Created with ImageMagick').map((c) => c.charCodeAt(0))
    );
    const input = buildPng([{ type: 'tEXt', data: textData }]);

    expect(hasChunk(input, 'tEXt')).toBe(true); // sanity: present before

    const output = stripPng(input);
    expect(hasChunk(output, 'tEXt')).toBe(false);
  });
});

describe('stripPng – removes iTXt chunks', () => {
  it('removes an iTXt chunk (often carries XMP)', () => {
    const itxtData = new Uint8Array(
      Array.from('XML:com.adobe.xmp\x00\x00\x00\x00\x00<xmpmeta/>').map((c) =>
        c.charCodeAt(0)
      )
    );
    const input = buildPng([{ type: 'iTXt', data: itxtData }]);

    expect(hasChunk(input, 'iTXt')).toBe(true);

    const output = stripPng(input);
    expect(hasChunk(output, 'iTXt')).toBe(false);
  });
});

describe('stripPng – removes zTXt chunks', () => {
  it('removes a zTXt chunk', () => {
    const ztxtData = new Uint8Array([
      // keyword "Author\0" + compression method 0 + compressed data
      0x41, 0x75, 0x74, 0x68, 0x6f, 0x72, 0x00, // "Author\0"
      0x00, // compression method
      0x78, 0x9c, 0x4b, 0xcb, 0x2f, 0x02, 0x00, // compressed "Foo"
    ]);
    const input = buildPng([{ type: 'zTXt', data: ztxtData }]);

    expect(hasChunk(input, 'zTXt')).toBe(true);

    const output = stripPng(input);
    expect(hasChunk(output, 'zTXt')).toBe(false);
  });
});

describe('stripPng – removes eXIf chunks', () => {
  it('removes an eXIf chunk', () => {
    // Minimal EXIF stub: just a byte pattern
    const exifData = new Uint8Array([
      0x49, 0x49, // Little-endian TIFF header ("II")
      0x2a, 0x00, // TIFF magic
      0x08, 0x00, 0x00, 0x00, // IFD0 offset
    ]);
    const input = buildPng([{ type: 'eXIf', data: exifData }]);

    expect(hasChunk(input, 'eXIf')).toBe(true);

    const output = stripPng(input);
    expect(hasChunk(output, 'eXIf')).toBe(false);
  });
});

describe('stripPng – removes multiple metadata chunks in one pass', () => {
  it('strips tEXt, iTXt, zTXt, and eXIf in a single call', () => {
    const input = buildPng([
      { type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }, // "a\0b"
      { type: 'iTXt', data: new Uint8Array([0x63, 0x00, 0x64]) },
      { type: 'zTXt', data: new Uint8Array([0x65, 0x00, 0x00, 0x78, 0x9c]) },
      { type: 'eXIf', data: new Uint8Array([0x49, 0x49, 0x2a, 0x00]) },
    ]);

    const output = stripPng(input);
    expect(hasChunk(output, 'tEXt')).toBe(false);
    expect(hasChunk(output, 'iTXt')).toBe(false);
    expect(hasChunk(output, 'zTXt')).toBe(false);
    expect(hasChunk(output, 'eXIf')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripPng — preserves critical chunks
// ---------------------------------------------------------------------------

describe('stripPng – preserves IHDR, IDAT, IEND', () => {
  it('preserves IHDR chunk', () => {
    const input = buildPng([{ type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }]);
    const output = stripPng(input);
    expect(hasChunk(output, 'IHDR')).toBe(true);
  });

  it('preserves IDAT chunk', () => {
    const input = buildPng([{ type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }]);
    const output = stripPng(input);
    expect(hasChunk(output, 'IDAT')).toBe(true);
  });

  it('preserves IEND chunk', () => {
    const input = buildPng([{ type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }]);
    const output = stripPng(input);
    expect(hasChunk(output, 'IEND')).toBe(true);
  });

  it('output starts with the PNG signature', () => {
    const input = buildPng();
    const output = new Uint8Array(stripPng(input));
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) {
      expect(output[i]).toBe(sig[i]);
    }
  });

  it('output is still detected as PNG by isPng', () => {
    const input = buildPng([{ type: 'tEXt', data: new Uint8Array([0x61, 0x00, 0x62]) }]);
    expect(isPng(stripPng(input))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stripPng — iCCP handling
// ---------------------------------------------------------------------------

describe('stripPng – iCCP handling', () => {
  it('preserves iCCP by default', () => {
    const iccpData = new Uint8Array([
      0x73, 0x52, 0x47, 0x42, 0x00, // "sRGB\0" (profile name + null)
      0x00,                          // compression method
      0x78, 0x9c, 0x01, 0x00, 0x00, 0xff, 0xff, // minimal compressed profile
      0x00, 0x00, 0x00, 0x01,        // adler32
    ]);
    const input = buildPng([{ type: 'iCCP', data: iccpData }]);

    expect(hasChunk(input, 'iCCP')).toBe(true);

    const output = stripPng(input);
    expect(hasChunk(output, 'iCCP')).toBe(true);
  });

  it('removes iCCP when preserveIcc is false', () => {
    const iccpData = new Uint8Array([
      0x73, 0x52, 0x47, 0x42, 0x00,
      0x00,
      0x78, 0x9c, 0x01, 0x00, 0x00, 0xff, 0xff,
      0x00, 0x00, 0x00, 0x01,
    ]);
    const input = buildPng([{ type: 'iCCP', data: iccpData }]);
    const output = stripPng(input, { preserveIcc: false });
    expect(hasChunk(output, 'iCCP')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripPng — output is smaller when metadata removed
// ---------------------------------------------------------------------------

describe('stripPng – output size', () => {
  it('output is smaller than input when metadata chunks are present', () => {
    const bigData = new Uint8Array(100).fill(0xaa);
    const input = buildPng([
      { type: 'tEXt', data: bigData },
      { type: 'iTXt', data: bigData },
    ]);

    const output = stripPng(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('output size equals input when no strippable chunks are present', () => {
    const input = buildPng(); // only IHDR + IDAT + IEND
    const output = stripPng(input);
    expect(output.byteLength).toBe(input.byteLength);
  });
});

// ---------------------------------------------------------------------------
// stripPng — error handling
// ---------------------------------------------------------------------------

describe('stripPng – error handling', () => {
  it('throws on non-PNG input (JPEG magic bytes)', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(() => stripPng(jpeg.buffer)).toThrow(/not a valid PNG/i);
  });

  it('throws on empty buffer', () => {
    expect(() => stripPng(new ArrayBuffer(0))).toThrow(/not a valid PNG/i);
  });

  it('throws on all-zero buffer', () => {
    expect(() => stripPng(new Uint8Array(32).buffer)).toThrow(/not a valid PNG/i);
  });

  it('throws when a chunk claims length beyond the buffer', () => {
    // Valid signature + IHDR + a chunk with an enormous claimed data length
    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const ihdrData = new Uint8Array(13);
    const ihdrView = new DataView(ihdrData.buffer);
    ihdrView.setUint32(0, 1, false);
    ihdrView.setUint32(4, 1, false);
    ihdrData[8] = 8;
    const ihdrChunk = encodeChunk('IHDR', ihdrData);

    // A tEXt chunk where the length field claims 0x7fffffff bytes of data
    const fakeLenChunk = new Uint8Array(12);
    const fakeView = new DataView(fakeLenChunk.buffer);
    fakeView.setUint32(0, 0x7fffffff, false); // enormous length
    fakeLenChunk[4] = 0x74; // 't'
    fakeLenChunk[5] = 0x45; // 'E'
    fakeLenChunk[6] = 0x58; // 'X'
    fakeLenChunk[7] = 0x74; // 't'
    // No actual data bytes follow

    const buf = concat([sig, ihdrChunk, fakeLenChunk]);
    expect(() => stripPng(buf)).toThrow();
  });
});
