import { describe, it, expect } from 'vitest';
import { isMp3, stripMp3 } from '../strip-mp3';
import { isWav, stripWav } from '../strip-wav';
import { isFlac, stripFlac } from '../strip-flac';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Concatenates multiple Uint8Array parts into a single Uint8Array. */
function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

/** Concatenates multiple Uint8Array parts into a single ArrayBuffer. */
function concat(parts: Uint8Array[]): ArrayBuffer {
  return concatBytes(parts).buffer;
}

/** Writes a little-endian uint32 into a Uint8Array at the given offset. */
function writeUint32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset]     = value & 0xFF;
  buf[offset + 1] = (value >>> 8) & 0xFF;
  buf[offset + 2] = (value >>> 16) & 0xFF;
  buf[offset + 3] = (value >>> 24) & 0xFF;
}

/** Reads a little-endian uint32 from an ArrayBuffer. */
function readUint32LE(buffer: ArrayBuffer, offset: number): number {
  return new DataView(buffer).getUint32(offset, true);
}

// ---------------------------------------------------------------------------
// MP3 helpers
// ---------------------------------------------------------------------------

/**
 * Builds a syncsafe integer (4 bytes, 7 bits per byte, MSB first) for ID3v2 size.
 */
function encodeSyncsafe(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[3] = value & 0x7F;
  out[2] = (value >> 7) & 0x7F;
  out[1] = (value >> 14) & 0x7F;
  out[0] = (value >> 21) & 0x7F;
  return out;
}

/**
 * Builds a minimal ID3v2 block.
 * @param tagData  The tag payload bytes (not including the 10-byte header).
 * @param hasFooter  Whether to set the footer flag (bit 4 of flags byte).
 */
function buildId3v2(tagData: Uint8Array, hasFooter = false): Uint8Array {
  const header = new Uint8Array(10);
  header[0] = 0x49; // 'I'
  header[1] = 0x44; // 'D'
  header[2] = 0x33; // '3'
  header[3] = 0x04; // version 2.4
  header[4] = 0x00; // revision 0
  header[5] = hasFooter ? 0x10 : 0x00; // flags
  const sizeBytes = encodeSyncsafe(tagData.byteLength);
  header[6] = sizeBytes[0]!;
  header[7] = sizeBytes[1]!;
  header[8] = sizeBytes[2]!;
  header[9] = sizeBytes[3]!;

  if (hasFooter) {
    // Footer is identical to header but starts with "3DI" instead of "ID3"
    const footer = new Uint8Array(10);
    footer[0] = 0x33; // '3'
    footer[1] = 0x44; // 'D'
    footer[2] = 0x49; // 'I'
    footer[3] = header[3]!;
    footer[4] = header[4]!;
    footer[5] = header[5]!;
    footer[6] = header[6]!;
    footer[7] = header[7]!;
    footer[8] = header[8]!;
    footer[9] = header[9]!;
    return concatBytes([header, tagData, footer]);
  }

  return concatBytes([header, tagData]);
}

/**
 * Builds an ID3v1 tag (128 bytes starting with "TAG").
 */
function buildId3v1(title = 'Test Song', artist = 'Test Artist'): Uint8Array {
  const tag = new Uint8Array(128);
  tag[0] = 0x54; // 'T'
  tag[1] = 0x41; // 'A'
  tag[2] = 0x47; // 'G'
  // Title (30 bytes)
  for (let i = 0; i < Math.min(title.length, 30); i++) tag[3 + i] = title.charCodeAt(i);
  // Artist (30 bytes)
  for (let i = 0; i < Math.min(artist.length, 30); i++) tag[33 + i] = artist.charCodeAt(i);
  return tag;
}

/** Minimal MPEG audio frame sync bytes */
const MPEG_SYNC = new Uint8Array([0xFF, 0xFB, 0x90, 0x00]);

/**
 * Builds a synthetic MP3 buffer with optional ID3v2, audio frames, and ID3v1.
 */
function buildMp3(options: {
  id3v2?: Uint8Array;
  audioData?: Uint8Array;
  id3v1?: Uint8Array;
} = {}): ArrayBuffer {
  const {
    id3v2,
    audioData = new Uint8Array([...MPEG_SYNC, 0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]),
    id3v1,
  } = options;

  const parts: Uint8Array[] = [];
  if (id3v2) parts.push(id3v2);
  parts.push(audioData);
  if (id3v1) parts.push(id3v1);
  return concat(parts);
}

// ---------------------------------------------------------------------------
// WAV helpers
// ---------------------------------------------------------------------------

/** Converts a 4-char ASCII string to a little-endian uint32. */
function wavFourCC(s: string): number {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>> 0
  );
}

/** Builds a WAV chunk: [FourCC 4B LE][size 4B LE][data][optional pad byte] */
function buildWavChunk(type: string, data: Uint8Array): Uint8Array {
  const paddedSize = data.byteLength + (data.byteLength & 1);
  const out = new Uint8Array(8 + paddedSize);
  const view = new DataView(out.buffer);
  view.setUint32(0, wavFourCC(type), true);
  view.setUint32(4, data.byteLength, true);
  out.set(data, 8);
  return out;
}

/** Builds a LIST/INFO chunk with one INAM sub-chunk. */
function buildListInfo(title = 'Test Track'): Uint8Array {
  // INAM sub-chunk
  const inamData = new Uint8Array(title.length + 1); // null-terminated
  for (let i = 0; i < title.length; i++) inamData[i] = title.charCodeAt(i);
  const inamChunk = buildWavChunk('INAM', inamData);

  // LIST chunk: type "INFO" (4 bytes) + sub-chunks
  const listData = new Uint8Array(4 + inamChunk.byteLength);
  listData[0] = 0x49; listData[1] = 0x4E; listData[2] = 0x46; listData[3] = 0x4F; // 'INFO'
  listData.set(inamChunk, 4);
  return buildWavChunk('LIST', listData);
}

/** Builds a fmt  chunk (PCM, 44100 Hz, stereo, 16-bit). */
function buildFmtChunk(): Uint8Array {
  const fmt = new Uint8Array(16);
  const view = new DataView(fmt.buffer);
  view.setUint16(0, 1, true);    // PCM = 1
  view.setUint16(2, 2, true);    // channels = 2
  view.setUint32(4, 44100, true); // sample rate
  view.setUint32(8, 176400, true); // byte rate
  view.setUint16(12, 4, true);   // block align
  view.setUint16(14, 16, true);  // bits per sample
  return buildWavChunk('fmt ', fmt);
}

/** Builds a data chunk with the given audio sample bytes. */
function buildDataChunk(samples: Uint8Array = new Uint8Array([0x00, 0x01, 0x02, 0x03])): Uint8Array {
  return buildWavChunk('data', samples);
}

/**
 * Builds a synthetic WAV buffer.
 */
function buildWav(options: {
  extraChunks?: Uint8Array[];
  audioSamples?: Uint8Array;
} = {}): ArrayBuffer {
  const { extraChunks = [], audioSamples } = options;

  const fmtChunk = buildFmtChunk();
  const dataChunk = buildDataChunk(audioSamples);

  // Inner content: "WAVE" (4) + fmt  + data + extra chunks
  const innerParts: Uint8Array[] = [
    new Uint8Array([0x57, 0x41, 0x56, 0x45]), // 'WAVE'
    fmtChunk,
    dataChunk,
    ...extraChunks,
  ];
  const innerSize = innerParts.reduce((acc, p) => acc + p.byteLength, 0);

  // RIFF header: "RIFF" (4) + size (4) + content
  const header = new Uint8Array(8);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, wavFourCC('RIFF'), true);
  headerView.setUint32(4, innerSize, true);

  return concat([header, ...innerParts]);
}

/** Returns true if a WAV buffer contains a chunk with the given FourCC. */
function wavHasChunk(buffer: ArrayBuffer, type: string): boolean {
  const view = new DataView(buffer);
  const cc = wavFourCC(type);
  let offset = 12; // skip RIFF header
  while (offset + 8 <= buffer.byteLength) {
    const chunkCC = view.getUint32(offset, true);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkCC === cc) return true;
    offset += 8 + chunkSize + (chunkSize & 1);
  }
  return false;
}

// ---------------------------------------------------------------------------
// FLAC helpers
// ---------------------------------------------------------------------------

/** Builds a FLAC metadata block. */
function buildFlacBlock(type: number, data: Uint8Array, isLast = false): Uint8Array {
  const header = new Uint8Array(4);
  header[0] = (isLast ? 0x80 : 0x00) | (type & 0x7F);
  header[1] = (data.byteLength >> 16) & 0xFF;
  header[2] = (data.byteLength >> 8) & 0xFF;
  header[3] = data.byteLength & 0xFF;
  return concatBytes([header, data]);
}

/** Builds a minimal STREAMINFO block (34 bytes of data). */
function buildStreamInfo(isLast = false): Uint8Array {
  // 34 bytes: all zeros except a few fields — enough to be structurally valid
  const data = new Uint8Array(34);
  const view = new DataView(data.buffer);
  // min/max block size
  view.setUint16(0, 4096, false);
  view.setUint16(2, 4096, false);
  // sample rate 44100 is encoded in bits 80–99 — keep zeros for the test
  return buildFlacBlock(0, data, isLast);
}

/** Builds a VORBIS_COMMENT block with some tag data. */
function buildVorbisComment(tags: string[], isLast = false): Uint8Array {
  // vendor string: "test"
  const vendor = new TextEncoder().encode('test');
  const data = new Uint8Array(4 + vendor.byteLength + 4 + tags.reduce((acc, t) => acc + 4 + t.length, 0));
  const view = new DataView(data.buffer);
  let pos = 0;
  view.setUint32(pos, vendor.byteLength, true); pos += 4;
  data.set(vendor, pos); pos += vendor.byteLength;
  view.setUint32(pos, tags.length, true); pos += 4;
  for (const tag of tags) {
    const encoded = new TextEncoder().encode(tag);
    view.setUint32(pos, encoded.byteLength, true); pos += 4;
    data.set(encoded, pos); pos += encoded.byteLength;
  }
  return buildFlacBlock(4, data, isLast);
}

/** Builds a PICTURE block (type 6) with dummy data. */
function buildPictureBlock(isLast = false): Uint8Array {
  const data = new Uint8Array(32).fill(0xAB); // fake picture data
  return buildFlacBlock(6, data, isLast);
}

/** Builds a synthetic FLAC buffer. */
function buildFlac(options: {
  metadataBlocks?: Uint8Array[];
  audioFrames?: Uint8Array;
} = {}): ArrayBuffer {
  const {
    metadataBlocks = [buildStreamInfo(true)],
    audioFrames = new Uint8Array([0xFF, 0xF8, 0x00, 0x00, 0xDE, 0xAD, 0xBE, 0xEF]),
  } = options;

  const magic = new Uint8Array([0x66, 0x4C, 0x61, 0x43]); // 'fLaC'
  return concat([magic, ...metadataBlocks, audioFrames]);
}

/** Returns true if the FLAC buffer contains a metadata block of the given type. */
function flacHasBlock(buffer: ArrayBuffer, type: number): boolean {
  const bytes = new Uint8Array(buffer);
  let offset = 4; // skip magic
  while (offset + 4 <= bytes.byteLength) {
    const headerByte = bytes[offset]!;
    const isLast = (headerByte & 0x80) !== 0;
    const blockType = headerByte & 0x7F;
    const blockLen = (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (blockType === type) return true;
    if (isLast) break;
    offset += 4 + blockLen;
  }
  return false;
}

/** Reads the block length of the first block of the given type. Returns -1 if not found. */
function flacBlockLen(buffer: ArrayBuffer, type: number): number {
  const bytes = new Uint8Array(buffer);
  let offset = 4;
  while (offset + 4 <= bytes.byteLength) {
    const headerByte = bytes[offset]!;
    const isLast = (headerByte & 0x80) !== 0;
    const blockType = headerByte & 0x7F;
    const blockLen = (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (blockType === type) return blockLen;
    if (isLast) break;
    offset += 4 + blockLen;
  }
  return -1;
}

// ===========================================================================
// MP3 Tests
// ===========================================================================

describe('isMp3', () => {
  it('returns true for a buffer starting with ID3 tag', () => {
    const id3v2 = buildId3v2(new Uint8Array([0x00, 0x01, 0x02]));
    expect(isMp3(id3v2.buffer)).toBe(true);
  });

  it('returns true for a buffer starting with MPEG frame sync', () => {
    expect(isMp3(new Uint8Array([0xFF, 0xFB, 0x90, 0x00]).buffer)).toBe(true);
  });

  it('returns false for a JPEG buffer', () => {
    expect(isMp3(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]).buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isMp3(new ArrayBuffer(0))).toBe(false);
  });
});

describe('stripMp3 – removes ID3v2 from start', () => {
  it('removes an ID3v2 header, leaving audio frames', () => {
    const tagData = new Uint8Array(20).fill(0xAA); // 20 bytes of fake tag data
    const id3v2 = buildId3v2(tagData);
    const audioData = new Uint8Array([...MPEG_SYNC, 0x01, 0x02, 0x03, 0x04]);
    const input = buildMp3({ id3v2, audioData });

    const output = stripMp3(input);
    const outBytes = new Uint8Array(output);

    // Should start with MPEG sync word
    expect(outBytes[0]).toBe(0xFF);
    expect(outBytes[1]).toBe(0xFB);
  });

  it('output is smaller than input after removing ID3v2', () => {
    const tagData = new Uint8Array(100).fill(0xBB);
    const id3v2 = buildId3v2(tagData);
    const input = buildMp3({ id3v2 });

    const output = stripMp3(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('audio frame bytes are bit-identical after stripping ID3v2', () => {
    const tagData = new Uint8Array(10).fill(0xCC);
    const id3v2 = buildId3v2(tagData);
    const audioData = new Uint8Array([...MPEG_SYNC, 0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]);
    const input = buildMp3({ id3v2, audioData });

    const output = stripMp3(input);
    expect(new Uint8Array(output)).toEqual(audioData);
  });

  it('handles ID3v2 with footer flag set', () => {
    const tagData = new Uint8Array(8).fill(0xDD);
    const id3v2WithFooter = buildId3v2(tagData, true);
    const audioData = new Uint8Array([...MPEG_SYNC, 0x11, 0x22]);
    const input = buildMp3({ id3v2: id3v2WithFooter, audioData });

    const output = stripMp3(input);
    const outBytes = new Uint8Array(output);
    expect(outBytes[0]).toBe(0xFF);
    expect(outBytes[1]).toBe(0xFB);
  });
});

describe('stripMp3 – removes ID3v1 from end', () => {
  it('removes an ID3v1 tag from the end', () => {
    const id3v1 = buildId3v1();
    const audioData = new Uint8Array([...MPEG_SYNC, 0x55, 0x66, 0x77]);
    const input = buildMp3({ audioData, id3v1 });

    const output = stripMp3(input);
    const outBytes = new Uint8Array(output);

    // Must NOT end with "TAG"
    expect(outBytes[outBytes.length - 128]).not.toBe(0x54);
    // Should start with MPEG sync
    expect(outBytes[0]).toBe(0xFF);
  });

  it('output excludes ID3v1 bytes', () => {
    const id3v1 = buildId3v1();
    const audioData = new Uint8Array([...MPEG_SYNC, 0xAA, 0xBB]);
    const input = buildMp3({ audioData, id3v1 });

    const output = stripMp3(input);
    expect(output.byteLength).toBe(audioData.byteLength);
    expect(new Uint8Array(output)).toEqual(audioData);
  });
});

describe('stripMp3 – removes both ID3v2 and ID3v1', () => {
  it('strips both tags, preserving only audio frames', () => {
    const tagData = new Uint8Array(15).fill(0xFF);
    const id3v2 = buildId3v2(tagData);
    const id3v1 = buildId3v1('My Song', 'My Artist');
    const audioData = new Uint8Array([...MPEG_SYNC, 0x10, 0x20, 0x30]);
    const input = buildMp3({ id3v2, audioData, id3v1 });

    const output = stripMp3(input);
    expect(new Uint8Array(output)).toEqual(audioData);
  });
});

describe('stripMp3 – no tags present', () => {
  it('returns identical data when no ID3 tags are present', () => {
    const audioData = new Uint8Array([...MPEG_SYNC, 0xAA, 0xBB, 0xCC]);
    const input = buildMp3({ audioData });
    const output = stripMp3(input);
    expect(new Uint8Array(output)).toEqual(audioData);
  });
});

// ===========================================================================
// WAV Tests
// ===========================================================================

describe('isWav', () => {
  it('returns true for a valid WAV buffer', () => {
    expect(isWav(buildWav())).toBe(true);
  });

  it('returns false for an MP3 buffer', () => {
    const mp3 = new Uint8Array([0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(isWav(mp3.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isWav(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false when RIFF header present but not WAVE', () => {
    const buf = new Uint8Array(12);
    new DataView(buf.buffer).setUint32(0, wavFourCC('RIFF'), true);
    new DataView(buf.buffer).setUint32(8, wavFourCC('AVI '), true);
    expect(isWav(buf.buffer)).toBe(false);
  });
});

describe('stripWav – removes LIST/INFO chunk', () => {
  it('removes a LIST/INFO chunk containing title metadata', () => {
    const listInfo = buildListInfo('Secret Title');
    const input = buildWav({ extraChunks: [listInfo] });

    expect(wavHasChunk(input, 'LIST')).toBe(true); // sanity check

    const output = stripWav(input);
    expect(wavHasChunk(output, 'LIST')).toBe(false);
  });

  it('output is smaller after removing LIST/INFO', () => {
    const listInfo = buildListInfo('A Very Long Track Title That Adds Bytes');
    const input = buildWav({ extraChunks: [listInfo] });
    const output = stripWav(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });
});

describe('stripWav – removes id3  chunk', () => {
  it('removes an embedded id3  chunk', () => {
    const id3Data = new Uint8Array(50).fill(0x55);
    const id3Chunk = buildWavChunk('id3 ', id3Data);
    const input = buildWav({ extraChunks: [id3Chunk] });

    expect(wavHasChunk(input, 'id3 ')).toBe(true);

    const output = stripWav(input);
    expect(wavHasChunk(output, 'id3 ')).toBe(false);
  });
});

describe('stripWav – removes bext chunk', () => {
  it('removes a bext (Broadcast Wave Extension) chunk', () => {
    const bextData = new Uint8Array(602).fill(0xBB); // bext is always ≥ 602 bytes
    const bextChunk = buildWavChunk('bext', bextData);
    const input = buildWav({ extraChunks: [bextChunk] });

    expect(wavHasChunk(input, 'bext')).toBe(true);

    const output = stripWav(input);
    expect(wavHasChunk(output, 'bext')).toBe(false);
  });
});

describe('stripWav – preserves audio data', () => {
  it('preserves the fmt  chunk', () => {
    const listInfo = buildListInfo('Remove Me');
    const input = buildWav({ extraChunks: [listInfo] });
    const output = stripWav(input);
    expect(wavHasChunk(output, 'fmt ')).toBe(true);
  });

  it('preserves the data chunk', () => {
    const listInfo = buildListInfo('Remove Me');
    const input = buildWav({ extraChunks: [listInfo] });
    const output = stripWav(input);
    expect(wavHasChunk(output, 'data')).toBe(true);
  });

  it('audio sample bytes are bit-identical after stripping', () => {
    const samples = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE]);
    const listInfo = buildListInfo('Metadata');
    const input = buildWav({ extraChunks: [listInfo], audioSamples: samples });

    const output = stripWav(input);

    // Find data chunk in output and verify sample bytes
    const view = new DataView(output);
    let offset = 12;
    let found = false;
    while (offset + 8 <= output.byteLength) {
      const cc = view.getUint32(offset, true);
      const size = view.getUint32(offset + 4, true);
      if (cc === wavFourCC('data')) {
        const outBytes = new Uint8Array(output, offset + 8, size);
        expect(outBytes).toEqual(samples);
        found = true;
        break;
      }
      offset += 8 + size + (size & 1);
    }
    expect(found).toBe(true);
  });

  it('output is still detected as WAV by isWav', () => {
    const listInfo = buildListInfo('Test');
    const input = buildWav({ extraChunks: [listInfo] });
    const output = stripWav(input);
    expect(isWav(output)).toBe(true);
  });
});

describe('stripWav – RIFF size header update', () => {
  it('RIFF size field equals total file size minus 8 after stripping', () => {
    const listInfo = buildListInfo('Big Metadata');
    const input = buildWav({ extraChunks: [listInfo] });
    const output = stripWav(input);
    const riffSize = readUint32LE(output, 4);
    expect(riffSize).toBe(output.byteLength - 8);
  });

  it('RIFF size field is correct when no metadata is stripped', () => {
    const input = buildWav();
    const output = stripWav(input);
    const riffSize = readUint32LE(output, 4);
    expect(riffSize).toBe(output.byteLength - 8);
  });
});

describe('stripWav – error handling', () => {
  it('throws on a non-WAV buffer', () => {
    const mp3 = new Uint8Array([0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(() => stripWav(mp3.buffer)).toThrow(/not a valid WAV/i);
  });

  it('throws on an empty buffer', () => {
    expect(() => stripWav(new ArrayBuffer(0))).toThrow(/not a valid WAV/i);
  });
});

// ===========================================================================
// FLAC Tests
// ===========================================================================

describe('isFlac', () => {
  it('returns true for a valid FLAC buffer', () => {
    expect(isFlac(buildFlac())).toBe(true);
  });

  it('returns false for an MP3 buffer', () => {
    expect(isFlac(new Uint8Array([0xFF, 0xFB, 0x90, 0x00]).buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isFlac(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a buffer shorter than 4 bytes', () => {
    expect(isFlac(new Uint8Array([0x66, 0x4C, 0x61]).buffer)).toBe(false);
  });
});

describe('stripFlac – removes VORBIS_COMMENT', () => {
  it('replaces VORBIS_COMMENT with an empty block', () => {
    const streaminfo = buildStreamInfo(false);
    const vorbis = buildVorbisComment(['ARTIST=Test Artist', 'TITLE=Test Song'], true);
    const audioFrames = new Uint8Array([0xFF, 0xF8, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04]);
    const input = buildFlac({ metadataBlocks: [streaminfo, vorbis], audioFrames });

    const output = stripFlac(input);

    // VORBIS_COMMENT block should still exist (type 4 preserved as empty)
    expect(flacHasBlock(output, 4)).toBe(true);
    // But its data length should be minimal (8 bytes: empty vendor + 0 comments)
    expect(flacBlockLen(output, 4)).toBe(8);
  });

  it('output is smaller after stripping non-empty vorbis comment', () => {
    const streaminfo = buildStreamInfo(false);
    const vorbis = buildVorbisComment(
      ['ARTIST=Very Long Artist Name', 'TITLE=Very Long Track Title', 'ALBUM=Very Long Album Name'],
      true
    );
    const input = buildFlac({ metadataBlocks: [streaminfo, vorbis] });
    const output = stripFlac(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });
});

describe('stripFlac – removes PICTURE block', () => {
  it('removes a PICTURE block entirely', () => {
    const streaminfo = buildStreamInfo(false);
    const vorbis = buildVorbisComment(['ARTIST=Test'], false);
    const picture = buildPictureBlock(true);
    const input = buildFlac({ metadataBlocks: [streaminfo, vorbis, picture] });

    const output = stripFlac(input);
    expect(flacHasBlock(output, 6)).toBe(false);
  });

  it('removes PICTURE even when it is the only metadata after STREAMINFO', () => {
    const streaminfo = buildStreamInfo(false);
    const picture = buildPictureBlock(true);
    const input = buildFlac({ metadataBlocks: [streaminfo, picture] });

    const output = stripFlac(input);
    expect(flacHasBlock(output, 6)).toBe(false);
  });
});

describe('stripFlac – preserves STREAMINFO', () => {
  it('always preserves STREAMINFO block (type 0)', () => {
    const streaminfo = buildStreamInfo(false);
    const vorbis = buildVorbisComment(['TITLE=Strip Me'], false);
    const picture = buildPictureBlock(true);
    const input = buildFlac({ metadataBlocks: [streaminfo, vorbis, picture] });

    const output = stripFlac(input);
    expect(flacHasBlock(output, 0)).toBe(true);
  });

  it('STREAMINFO data bytes are bit-identical after stripping', () => {
    const siData = new Uint8Array(34);
    siData[0] = 0x12; siData[1] = 0x34; siData[33] = 0xAB; // marker bytes
    const streaminfo = buildFlacBlock(0, siData, false);
    const vorbis = buildVorbisComment(['ARTIST=Test'], true);
    const input = buildFlac({ metadataBlocks: [streaminfo, vorbis] });

    const output = stripFlac(input);

    // Find STREAMINFO in output and verify data bytes
    const bytes = new Uint8Array(output);
    let offset = 4; // skip magic
    while (offset + 4 <= bytes.byteLength) {
      const hdr = bytes[offset]!;
      const blockType = hdr & 0x7F;
      const blockLen = (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
      if (blockType === 0) {
        const outSiData = bytes.slice(offset + 4, offset + 4 + blockLen);
        expect(outSiData).toEqual(siData);
        break;
      }
      offset += 4 + blockLen;
      if (hdr & 0x80) break;
    }
  });
});

describe('stripFlac – is-last flag correction', () => {
  it('sets is-last flag on the last kept metadata block', () => {
    const streaminfo = buildStreamInfo(false);
    const vorbis = buildVorbisComment(['TITLE=Test'], false);
    // PICTURE is last in input — after removal, vorbis comment should be last
    const picture = buildPictureBlock(true);
    const input = buildFlac({ metadataBlocks: [streaminfo, vorbis, picture] });

    const output = stripFlac(input);

    // Walk metadata blocks and find the last one (is-last bit set)
    const bytes = new Uint8Array(output);
    let offset = 4;
    let lastType = -1;
    while (offset + 4 <= bytes.byteLength) {
      const hdr = bytes[offset]!;
      const isLast = (hdr & 0x80) !== 0;
      const blockType = hdr & 0x7F;
      const blockLen = (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
      if (isLast) { lastType = blockType; break; }
      offset += 4 + blockLen;
    }
    // The last kept block should be the vorbis comment (type 4), not PICTURE (type 6)
    expect(lastType).toBe(4);
  });
});

describe('stripFlac – preserves audio frames', () => {
  it('audio frame bytes at end are preserved after stripping', () => {
    const streaminfo = buildStreamInfo(false);
    const vorbis = buildVorbisComment(['ARTIST=Test'], true);
    const audioFrames = new Uint8Array([0xFF, 0xF8, 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56]);
    const input = buildFlac({ metadataBlocks: [streaminfo, vorbis], audioFrames });

    const output = stripFlac(input);
    const outBytes = new Uint8Array(output);

    // Audio frames should appear at the end
    const suffix = outBytes.slice(outBytes.length - audioFrames.length);
    expect(suffix).toEqual(audioFrames);
  });

  it('output is still detected as FLAC by isFlac', () => {
    const streaminfo = buildStreamInfo(false);
    const vorbis = buildVorbisComment(['TITLE=Test'], true);
    const input = buildFlac({ metadataBlocks: [streaminfo, vorbis] });

    const output = stripFlac(input);
    expect(isFlac(output)).toBe(true);
  });
});

describe('stripFlac – error handling', () => {
  it('throws on a non-FLAC buffer', () => {
    const mp3 = new Uint8Array([0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(() => stripFlac(mp3.buffer)).toThrow(/not a valid FLAC/i);
  });

  it('throws on an empty buffer', () => {
    expect(() => stripFlac(new ArrayBuffer(0))).toThrow(/not a valid FLAC/i);
  });
});

describe('stripFlac – combined scenario', () => {
  it('strips vorbis comment and picture, preserves streaminfo and audio', () => {
    const streaminfo = buildStreamInfo(false);
    const vorbis = buildVorbisComment(['ARTIST=Alice', 'TITLE=Wonderland', 'ALBUM=Dreams'], false);
    const picture = buildPictureBlock(true);
    const audioFrames = new Uint8Array([0xFF, 0xF8, 0x00, 0x00, 0xCA, 0xFE, 0xBA, 0xBE]);
    const input = buildFlac({ metadataBlocks: [streaminfo, vorbis, picture], audioFrames });

    const output = stripFlac(input);

    // STREAMINFO preserved
    expect(flacHasBlock(output, 0)).toBe(true);
    // VORBIS_COMMENT replaced with empty (still present as type 4)
    expect(flacHasBlock(output, 4)).toBe(true);
    expect(flacBlockLen(output, 4)).toBe(8);
    // PICTURE removed
    expect(flacHasBlock(output, 6)).toBe(false);
    // Still a valid FLAC
    expect(isFlac(output)).toBe(true);
    // Output smaller than input
    expect(output.byteLength).toBeLessThan(input.byteLength);
    // Audio frames intact at end
    const outBytes = new Uint8Array(output);
    const suffix = outBytes.slice(outBytes.length - audioFrames.length);
    expect(suffix).toEqual(audioFrames);
  });
});
