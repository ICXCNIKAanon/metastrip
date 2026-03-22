import { describe, it, expect } from 'vitest';
import { isM4a, stripM4a } from '../strip-m4a';
import { isAvi, stripAvi } from '../strip-avi';
import { isMkv, stripMkv } from '../strip-mkv';
import { isEpub, stripEpub } from '../strip-epub';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Concatenates Uint8Array parts into a single ArrayBuffer. */
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

// ---------------------------------------------------------------------------
// M4A helpers
// ---------------------------------------------------------------------------

/** Builds an ISOBMFF box: [size 4B BE][type 4B][data] */
function makeBox(type: string, data: Uint8Array): Uint8Array {
  const size = 8 + data.length;
  const box = new Uint8Array(size);
  new DataView(box.buffer).setUint32(0, size, false);
  for (let i = 0; i < 4; i++) box[4 + i] = type.charCodeAt(i);
  box.set(data, 8);
  return box;
}

/** Builds a ftyp box with the given brand (4 chars). */
function makeFtyp(brand: string): Uint8Array {
  const data = new Uint8Array(8);
  for (let i = 0; i < 4; i++) data[i] = brand.charCodeAt(i);
  return makeBox('ftyp', data);
}

/** Builds a moov box with an optional udta child. */
function makeMoov(includeUdta = false): Uint8Array {
  const mvhd = makeBox('mvhd', new Uint8Array(108));
  let children = mvhd;
  if (includeUdta) {
    const udtaData = new TextEncoder().encode('metadata content here');
    const udta = makeBox('udta', udtaData);
    const all = new Uint8Array(mvhd.length + udta.length);
    all.set(mvhd, 0);
    all.set(udta, mvhd.length);
    children = all;
  }
  return makeBox('moov', children);
}

function makeMdat(): Uint8Array {
  const data = new Uint8Array(32);
  for (let i = 0; i < 32; i++) data[i] = i;
  return makeBox('mdat', data);
}

/** Builds a synthetic M4A buffer with the given ftyp brand. */
function buildM4a(brand: 'M4A ' | 'M4B ' | string, includeUdta = false): ArrayBuffer {
  return concat(makeFtyp(brand), makeMoov(includeUdta), makeMdat());
}

// ---------------------------------------------------------------------------
// AVI helpers
// ---------------------------------------------------------------------------

function fourCCLE(s: string): number {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>>
    0
  );
}

/** Builds a RIFF chunk: [FourCC 4B LE][size 4B LE][data][pad] */
function makeRiffChunk(type: string, data: Uint8Array): Uint8Array {
  const paddedSize = data.length + (data.length & 1);
  const out = new Uint8Array(8 + paddedSize);
  const view = new DataView(out.buffer);
  view.setUint32(0, fourCCLE(type), true);
  view.setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

/** Builds a LIST chunk with the given sub-type and contents. */
function makeListChunk(listType: string, contents: Uint8Array): Uint8Array {
  const inner = new Uint8Array(4 + contents.length);
  for (let i = 0; i < 4; i++) inner[i] = listType.charCodeAt(i);
  inner.set(contents, 4);
  return makeRiffChunk('LIST', inner);
}

/** Builds a LIST/INFO chunk with an INAM (title) sub-chunk. */
function makeListInfo(title = 'Test Title'): Uint8Array {
  const inamData = new Uint8Array(title.length + 1);
  for (let i = 0; i < title.length; i++) inamData[i] = title.charCodeAt(i);
  const inamChunk = makeRiffChunk('INAM', inamData);
  return makeListChunk('INFO', inamChunk);
}

/** Builds a LIST/movi chunk with dummy frame data. */
function makeListMovi(): Uint8Array {
  const frameData = new Uint8Array([0x00, 0xDC, 0xAA, 0xBB, 0xCC, 0xDD]);
  const frame = makeRiffChunk('00dc', frameData);
  return makeListChunk('movi', frame);
}

/** Builds a JUNK chunk. */
function makeJunk(size = 16): Uint8Array {
  return makeRiffChunk('JUNK', new Uint8Array(size).fill(0x00));
}

/**
 * Builds a synthetic AVI buffer.
 * Structure: RIFF header + LIST/hdrl + LIST/movi [+ LIST/INFO] [+ JUNK]
 */
function buildAvi(options: {
  includeListInfo?: boolean;
  includeJunk?: boolean;
} = {}): ArrayBuffer {
  const { includeListInfo = true, includeJunk = false } = options;

  const hdrlContent = new Uint8Array([0x61, 0x76, 0x69, 0x68]); // fake hdrl
  const hdrl = makeListChunk('hdrl', makeRiffChunk('avih', hdrlContent));
  const movi = makeListMovi();

  const innerParts: Uint8Array[] = [hdrl, movi];
  if (includeListInfo) innerParts.push(makeListInfo('Secret AVI Title'));
  if (includeJunk) innerParts.push(makeJunk(32));

  const innerSize = innerParts.reduce((acc, p) => acc + p.length, 0);
  const riffHeader = new Uint8Array(12);
  const riffView = new DataView(riffHeader.buffer);
  riffView.setUint32(0, fourCCLE('RIFF'), true);
  riffView.setUint32(4, innerSize + 4, true); // size includes 'AVI ' tag
  // 'AVI '
  riffHeader[8] = 0x41; riffHeader[9] = 0x56; riffHeader[10] = 0x49; riffHeader[11] = 0x20;

  return concat(riffHeader, ...innerParts);
}

/** Returns true if the AVI buffer contains a LIST chunk with the given sub-type. */
function aviHasListType(buffer: ArrayBuffer, listType: string): boolean {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const cc = fourCCLE('LIST');
  const ltCC = fourCCLE(listType);
  let offset = 12;
  while (offset + 12 <= buffer.byteLength) {
    const chunkCC = view.getUint32(offset, true);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkCC === cc) {
      const lt = view.getUint32(offset + 8, true);
      if (lt === ltCC) return true;
    }
    const paddedSize = chunkSize + (chunkSize & 1);
    offset += 8 + paddedSize;
    if (chunkSize === 0) break;
  }
  return false;
}

/** Returns true if the AVI buffer contains a top-level chunk with the given FourCC. */
function aviHasChunk(buffer: ArrayBuffer, type: string): boolean {
  const view = new DataView(buffer);
  const cc = fourCCLE(type);
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const chunkCC = view.getUint32(offset, true);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkCC === cc) return true;
    const paddedSize = chunkSize + (chunkSize & 1);
    offset += 8 + paddedSize;
    if (chunkSize === 0) break;
  }
  return false;
}

// ---------------------------------------------------------------------------
// MKV helpers
// ---------------------------------------------------------------------------

/**
 * Encodes a value as an EBML element ID (raw VINT with marker bit set).
 * For 4-byte IDs used in Matroska, the marker bit is in position 0x10000000.
 */
function encodeEbmlId(id: number, numBytes: number): Uint8Array {
  const out = new Uint8Array(numBytes);
  for (let i = numBytes - 1; i >= 0; i--) {
    out[i] = id & 0xFF;
    id >>>= 8;
  }
  return out;
}

/**
 * Encodes a size as an EBML VINT with the given byte width.
 */
function encodeEbmlSize(value: number, width: number): Uint8Array {
  const out = new Uint8Array(width);
  out[0] = (0x80 >> (width - 1));
  let remaining = value;
  for (let i = width - 1; i >= 0; i--) {
    out[i]! |= (remaining & 0xFF);
    remaining >>>= 8;
  }
  return out;
}

/**
 * Builds a raw EBML element: ID bytes + size VINT + data bytes.
 */
function makeEbmlElement(idBytes: Uint8Array, data: Uint8Array): Uint8Array {
  const sizeVint = encodeEbmlSize(data.length, data.length < 127 ? 1 : 2);
  const out = new Uint8Array(idBytes.length + sizeVint.length + data.length);
  out.set(idBytes, 0);
  out.set(sizeVint, idBytes.length);
  out.set(data, idBytes.length + sizeVint.length);
  return out;
}

/** Builds a minimal EBML header element (required at start of all MKV/WebM files). */
function makeEbmlHeader(): Uint8Array {
  // EBML header ID: 0x1A45DFA3 (4-byte ID)
  const idBytes = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3]);
  // Minimal EBML header content: EBMLVersion=1, DocType="matroska"
  const content = new Uint8Array([
    // EBMLVersion: ID 0x4286, size 1, value 1
    0x42, 0x86, 0x81, 0x01,
    // EBMLReadVersion: ID 0x42F7, size 1, value 1
    0x42, 0xF7, 0x81, 0x01,
    // EBMLMaxIDLength: ID 0x42F2, size 1, value 4
    0x42, 0xF2, 0x81, 0x04,
    // EBMLMaxSizeLength: ID 0x42F3, size 1, value 8
    0x42, 0xF3, 0x81, 0x08,
    // DocType: ID 0x4282, size 8, value "matroska"
    0x42, 0x82, 0x88, 0x6D, 0x61, 0x74, 0x72, 0x6F, 0x73, 0x6B, 0x61,
    // DocTypeVersion: ID 0x4287, size 1, value 4
    0x42, 0x87, 0x81, 0x04,
    // DocTypeReadVersion: ID 0x4285, size 1, value 2
    0x42, 0x85, 0x81, 0x02,
  ]);
  return makeEbmlElement(idBytes, content);
}

/** Builds a minimal Tracks element (0x1654AE6B) with dummy content. */
function makeTracksElement(): Uint8Array {
  const idBytes = new Uint8Array([0x16, 0x54, 0xAE, 0x6B]);
  const data = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]); // dummy track data
  return makeEbmlElement(idBytes, data);
}

/** Builds a minimal Cluster element (0x1F43B675) with dummy data. */
function makeClusterElement(): Uint8Array {
  const idBytes = new Uint8Array([0x1F, 0x43, 0xB6, 0x75]);
  const data = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  return makeEbmlElement(idBytes, data);
}

/** Builds a Tags element (0x1254C367) with a dummy tag. */
function makeTagsElement(): Uint8Array {
  const idBytes = new Uint8Array([0x12, 0x54, 0xC3, 0x67]);
  // Simple Tag with a title
  const tagData = new TextEncoder().encode('Title\x00Test Video\x00');
  return makeEbmlElement(idBytes, tagData);
}

/**
 * Builds a synthetic Segment element (0x18538067) with the given children.
 */
function makeSegmentElement(children: Uint8Array[]): Uint8Array {
  const idBytes = new Uint8Array([0x18, 0x53, 0x80, 0x67]);
  const total = children.reduce((acc, c) => acc + c.length, 0);
  const content = new Uint8Array(total);
  let offset = 0;
  for (const c of children) { content.set(c, offset); offset += c.length; }
  return makeEbmlElement(idBytes, content);
}

/**
 * Builds a synthetic MKV buffer.
 * Structure: EBML header + Segment(Tracks + [Tags] + Cluster)
 */
function buildMkv(options: { includeTags?: boolean } = {}): ArrayBuffer {
  const { includeTags = true } = options;

  const ebmlHeader = makeEbmlHeader();
  const tracks = makeTracksElement();
  const cluster = makeClusterElement();

  const segChildren: Uint8Array[] = [tracks];
  if (includeTags) segChildren.push(makeTagsElement());
  segChildren.push(cluster);

  const segment = makeSegmentElement(segChildren);

  return concat(ebmlHeader, segment);
}

/** Returns true if the MKV buffer contains a Tags element (0x1254C367). */
function mkvHasTags(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  // Search for the 4-byte Tags ID pattern anywhere in the buffer
  for (let i = 0; i < bytes.length - 3; i++) {
    if (
      bytes[i] === 0x12 &&
      bytes[i + 1] === 0x54 &&
      bytes[i + 2] === 0xC3 &&
      bytes[i + 3] === 0x67
    ) {
      return true;
    }
  }
  return false;
}

/** Returns true if the MKV buffer contains a Tracks element (0x1654AE6B). */
function mkvHasTracks(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length - 3; i++) {
    if (
      bytes[i] === 0x16 &&
      bytes[i + 1] === 0x54 &&
      bytes[i + 2] === 0xAE &&
      bytes[i + 3] === 0x6B
    ) {
      return true;
    }
  }
  return false;
}

/** Returns true if the MKV buffer contains a Cluster element (0x1F43B675). */
function mkvHasCluster(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length - 3; i++) {
    if (
      bytes[i] === 0x1F &&
      bytes[i + 1] === 0x43 &&
      bytes[i + 2] === 0xB6 &&
      bytes[i + 3] === 0x75
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// EPUB helpers
// ---------------------------------------------------------------------------
import JSZip from 'jszip';

/** Builds a minimal OPF content string with configurable Dublin Core fields. */
function buildOpfContent(options: {
  includeCreator?: boolean;
  includePublisher?: boolean;
  includeDate?: boolean;
  includeRights?: boolean;
} = {}): string {
  const {
    includeCreator = true,
    includePublisher = true,
    includeDate = true,
    includeRights = true,
  } = options;

  const dcFields: string[] = [
    '<dc:identifier id="uid">urn:uuid:test-12345</dc:identifier>',
    '<dc:title>Test Book Title</dc:title>',
    '<dc:language>en</dc:language>',
  ];
  if (includeCreator) dcFields.push('<dc:creator id="creator1">Jane Author</dc:creator>');
  if (includePublisher) dcFields.push('<dc:publisher>Test Publisher Corp</dc:publisher>');
  if (includeDate) dcFields.push('<dc:date>2024-01-15</dc:date>');
  if (includeRights) dcFields.push('<dc:rights>Copyright 2024 Test Publisher</dc:rights>');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${dcFields.join('\n    ')}
    <meta name="calibre:series" content="Test Series"/>
    <meta name="calibre:series_index" content="1"/>
  </metadata>
  <manifest>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="toc"/>
  </spine>
</package>`;
}

/** Builds a synthetic EPUB ZIP buffer with one OPF file. */
async function buildEpub(opfContent?: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  // EPUB requires uncompressed mimetype as the first file
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
  zip.file('OEBPS/content.opf', opfContent ?? buildOpfContent());
  zip.file('OEBPS/toc.xhtml', '<html><body><p>Content</p></body></html>');

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

// ===========================================================================
// M4A Tests
// ===========================================================================

describe('isM4a – detection', () => {
  it('returns true for a buffer with ftyp brand "M4A "', () => {
    expect(isM4a(buildM4a('M4A '))).toBe(true);
  });

  it('returns true for a buffer with ftyp brand "M4B "', () => {
    expect(isM4a(buildM4a('M4B '))).toBe(true);
  });

  it('returns false for a generic MP4 (mp41 brand)', () => {
    expect(isM4a(buildM4a('mp41'))).toBe(false);
  });

  it('returns false for a buffer shorter than 12 bytes', () => {
    expect(isM4a(new ArrayBuffer(8))).toBe(false);
  });

  it('returns false for a JPEG buffer', () => {
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(isM4a(jpeg.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isM4a(new ArrayBuffer(0))).toBe(false);
  });
});

describe('stripM4a – delegates to stripMp4', () => {
  it('removes udta box from M4A file (same as MP4 stripping)', () => {
    const buf = buildM4a('M4A ', true);
    const stripped = stripM4a(buf);
    // udta should be gone; file should be smaller
    expect(stripped.byteLength).toBeLessThan(buf.byteLength);
  });

  it('preserves ftyp box after stripping', () => {
    const buf = buildM4a('M4A ', true);
    const stripped = stripM4a(buf);
    const bytes = new Uint8Array(stripped);
    const ftypType = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
    expect(ftypType).toBe('ftyp');
  });

  it('preserves moov box after stripping', () => {
    const buf = buildM4a('M4A ', false);
    const stripped = stripM4a(buf);
    const view = new DataView(stripped);
    const bytes = new Uint8Array(stripped);
    let offset = 0;
    let foundMoov = false;
    while (offset + 8 <= stripped.byteLength) {
      const size = view.getUint32(offset, false);
      const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
      if (type === 'moov') { foundMoov = true; break; }
      if (size < 8) break;
      offset += size;
    }
    expect(foundMoov).toBe(true);
  });

  it('handles M4A with no metadata gracefully', () => {
    const buf = buildM4a('M4A ', false);
    const stripped = stripM4a(buf);
    expect(stripped.byteLength).toBe(buf.byteLength);
  });
});

// ===========================================================================
// AVI Tests
// ===========================================================================

describe('isAvi – detection', () => {
  it('returns true for a valid AVI buffer', () => {
    expect(isAvi(buildAvi())).toBe(true);
  });

  it('returns false for a WAV buffer (RIFF/WAVE)', () => {
    const wav = new Uint8Array(12);
    new DataView(wav.buffer).setUint32(0, fourCCLE('RIFF'), true);
    new DataView(wav.buffer).setUint32(8, fourCCLE('WAVE'), true);
    expect(isAvi(wav.buffer)).toBe(false);
  });

  it('returns false for a JPEG buffer', () => {
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(isAvi(jpeg.buffer)).toBe(false);
  });

  it('returns false for a buffer shorter than 12 bytes', () => {
    expect(isAvi(new ArrayBuffer(8))).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isAvi(new ArrayBuffer(0))).toBe(false);
  });
});

describe('stripAvi – removes LIST/INFO chunk', () => {
  it('removes LIST/INFO metadata chunk', () => {
    const buf = buildAvi({ includeListInfo: true });
    expect(aviHasListType(buf, 'INFO')).toBe(true);

    const stripped = stripAvi(buf);
    expect(aviHasListType(stripped, 'INFO')).toBe(false);
  });

  it('output is smaller after removing LIST/INFO', () => {
    const buf = buildAvi({ includeListInfo: true });
    const stripped = stripAvi(buf);
    expect(stripped.byteLength).toBeLessThan(buf.byteLength);
  });

  it('does not reduce size when there is no LIST/INFO', () => {
    const buf = buildAvi({ includeListInfo: false });
    const stripped = stripAvi(buf);
    // Same size expected (nothing to remove)
    expect(stripped.byteLength).toBe(buf.byteLength);
  });
});

describe('stripAvi – removes JUNK chunk', () => {
  it('removes JUNK padding chunk', () => {
    const buf = buildAvi({ includeListInfo: false, includeJunk: true });
    expect(aviHasChunk(buf, 'JUNK')).toBe(true);

    const stripped = stripAvi(buf);
    expect(aviHasChunk(stripped, 'JUNK')).toBe(false);
  });
});

describe('stripAvi – preserves video data', () => {
  it('preserves LIST/movi chunk (video/audio frames)', () => {
    const buf = buildAvi({ includeListInfo: true });
    const stripped = stripAvi(buf);
    expect(aviHasListType(stripped, 'movi')).toBe(true);
  });

  it('preserves LIST/hdrl chunk (stream headers)', () => {
    const buf = buildAvi({ includeListInfo: true });
    const stripped = stripAvi(buf);
    expect(aviHasListType(stripped, 'hdrl')).toBe(true);
  });

  it('output is still detected as AVI after stripping', () => {
    const buf = buildAvi({ includeListInfo: true });
    const stripped = stripAvi(buf);
    expect(isAvi(stripped)).toBe(true);
  });
});

describe('stripAvi – RIFF size update', () => {
  it('RIFF size field equals total file size minus 8 after stripping', () => {
    const buf = buildAvi({ includeListInfo: true });
    const stripped = stripAvi(buf);
    const riffSize = new DataView(stripped).getUint32(4, true);
    expect(riffSize).toBe(stripped.byteLength - 8);
  });
});

describe('stripAvi – error handling', () => {
  it('throws on a non-AVI buffer', () => {
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(() => stripAvi(jpeg.buffer)).toThrow(/not a valid AVI/i);
  });

  it('throws on an empty buffer', () => {
    expect(() => stripAvi(new ArrayBuffer(0))).toThrow(/not a valid AVI/i);
  });
});

// ===========================================================================
// MKV Tests
// ===========================================================================

describe('isMkv – detection', () => {
  it('returns true for a valid MKV buffer (EBML magic)', () => {
    expect(isMkv(buildMkv())).toBe(true);
  });

  it('returns true for a buffer starting with 0x1A45DFA3', () => {
    const bytes = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x00, 0x00]);
    expect(isMkv(bytes.buffer)).toBe(true);
  });

  it('returns false for a JPEG buffer', () => {
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    expect(isMkv(jpeg.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isMkv(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a buffer shorter than 4 bytes', () => {
    expect(isMkv(new Uint8Array([0x1A, 0x45, 0xDF]).buffer)).toBe(false);
  });

  it('returns false for an MP4 buffer', () => {
    const mp4 = makeFtyp('mp41');
    expect(isMkv(mp4.buffer)).toBe(false);
  });
});

describe('stripMkv – removes Tags element', () => {
  it('removes the Tags element from the Segment', () => {
    const buf = buildMkv({ includeTags: true });
    expect(mkvHasTags(buf)).toBe(true); // sanity check

    const stripped = stripMkv(buf);
    expect(mkvHasTags(stripped)).toBe(false);
  });

  it('output is smaller after removing Tags', () => {
    const buf = buildMkv({ includeTags: true });
    const stripped = stripMkv(buf);
    expect(stripped.byteLength).toBeLessThan(buf.byteLength);
  });

  it('does not reduce size when there are no Tags', () => {
    const buf = buildMkv({ includeTags: false });
    const stripped = stripMkv(buf);
    expect(stripped.byteLength).toBe(buf.byteLength);
  });
});

describe('stripMkv – preserves essential elements', () => {
  it('preserves Tracks element', () => {
    const buf = buildMkv({ includeTags: true });
    const stripped = stripMkv(buf);
    expect(mkvHasTracks(stripped)).toBe(true);
  });

  it('preserves Cluster element (audio/video data)', () => {
    const buf = buildMkv({ includeTags: true });
    const stripped = stripMkv(buf);
    expect(mkvHasCluster(stripped)).toBe(true);
  });

  it('output still has EBML magic after stripping', () => {
    const buf = buildMkv({ includeTags: true });
    const stripped = stripMkv(buf);
    expect(isMkv(stripped)).toBe(true);
  });
});

describe('stripMkv – error handling', () => {
  it('throws on a non-MKV buffer', () => {
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    expect(() => stripMkv(jpeg.buffer)).toThrow(/not a valid MKV\/WebM/i);
  });

  it('throws on an empty buffer', () => {
    expect(() => stripMkv(new ArrayBuffer(0))).toThrow(/not a valid MKV\/WebM/i);
  });
});

// ===========================================================================
// EPUB Tests
// ===========================================================================

describe('isEpub – detection', () => {
  it('returns true for a valid EPUB buffer', async () => {
    const buf = await buildEpub();
    expect(isEpub(buf)).toBe(true);
  });

  it('returns false for a non-ZIP buffer', () => {
    const notZip = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
    expect(isEpub(notZip.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isEpub(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a buffer shorter than 58 bytes', () => {
    expect(isEpub(new ArrayBuffer(40))).toBe(false);
  });
});

describe('stripEpub – removes dc:creator', () => {
  it('removes dc:creator element from the OPF file', async () => {
    const buf = await buildEpub(buildOpfContent({ includeCreator: true }));
    const stripped = await stripEpub(buf);

    // Load the stripped ZIP and verify
    const strippedZip = await JSZip.loadAsync(stripped);
    const opfFile = strippedZip.file('OEBPS/content.opf');
    expect(opfFile).not.toBeNull();
    const content = await opfFile!.async('string');
    expect(content).not.toMatch(/dc:creator/i);
    expect(content).not.toContain('Jane Author');
  });

  it('output is smaller after removing creator metadata', async () => {
    const buf = await buildEpub(buildOpfContent({ includeCreator: true }));
    const stripped = await stripEpub(buf);
    // Decompressed content should be smaller even if compressed size varies
    const origZip = await JSZip.loadAsync(buf);
    const strippedZip = await JSZip.loadAsync(stripped);
    const origOpf = await origZip.file('OEBPS/content.opf')!.async('string');
    const strippedOpf = await strippedZip.file('OEBPS/content.opf')!.async('string');
    expect(strippedOpf.length).toBeLessThan(origOpf.length);
  });
});

describe('stripEpub – removes dc:publisher and dc:date', () => {
  it('removes dc:publisher', async () => {
    const buf = await buildEpub(buildOpfContent({ includePublisher: true }));
    const stripped = await stripEpub(buf);
    const zip = await JSZip.loadAsync(stripped);
    const content = await zip.file('OEBPS/content.opf')!.async('string');
    expect(content).not.toMatch(/dc:publisher/i);
    expect(content).not.toContain('Test Publisher Corp');
  });

  it('removes dc:date', async () => {
    const buf = await buildEpub(buildOpfContent({ includeDate: true }));
    const stripped = await stripEpub(buf);
    const zip = await JSZip.loadAsync(stripped);
    const content = await zip.file('OEBPS/content.opf')!.async('string');
    expect(content).not.toMatch(/dc:date/i);
    expect(content).not.toContain('2024-01-15');
  });

  it('removes dc:rights', async () => {
    const buf = await buildEpub(buildOpfContent({ includeRights: true }));
    const stripped = await stripEpub(buf);
    const zip = await JSZip.loadAsync(stripped);
    const content = await zip.file('OEBPS/content.opf')!.async('string');
    expect(content).not.toMatch(/dc:rights/i);
  });
});

describe('stripEpub – removes calibre meta elements', () => {
  it('removes <meta name="calibre:series" content="..."/> elements', async () => {
    const buf = await buildEpub();
    const stripped = await stripEpub(buf);
    const zip = await JSZip.loadAsync(stripped);
    const content = await zip.file('OEBPS/content.opf')!.async('string');
    expect(content).not.toContain('calibre:series');
  });
});

describe('stripEpub – preserves required fields', () => {
  it('preserves dc:identifier', async () => {
    const buf = await buildEpub();
    const stripped = await stripEpub(buf);
    const zip = await JSZip.loadAsync(stripped);
    const content = await zip.file('OEBPS/content.opf')!.async('string');
    expect(content).toContain('dc:identifier');
    expect(content).toContain('urn:uuid:test-12345');
  });

  it('preserves dc:title', async () => {
    const buf = await buildEpub();
    const stripped = await stripEpub(buf);
    const zip = await JSZip.loadAsync(stripped);
    const content = await zip.file('OEBPS/content.opf')!.async('string');
    expect(content).toContain('dc:title');
    expect(content).toContain('Test Book Title');
  });

  it('preserves dc:language', async () => {
    const buf = await buildEpub();
    const stripped = await stripEpub(buf);
    const zip = await JSZip.loadAsync(stripped);
    const content = await zip.file('OEBPS/content.opf')!.async('string');
    expect(content).toContain('dc:language');
  });

  it('preserves manifest and spine elements', async () => {
    const buf = await buildEpub();
    const stripped = await stripEpub(buf);
    const zip = await JSZip.loadAsync(stripped);
    const content = await zip.file('OEBPS/content.opf')!.async('string');
    expect(content).toContain('<manifest>');
    expect(content).toContain('<spine>');
  });

  it('preserves non-OPF files (HTML content, container.xml)', async () => {
    const buf = await buildEpub();
    const stripped = await stripEpub(buf);
    const zip = await JSZip.loadAsync(stripped);
    expect(zip.file('META-INF/container.xml')).not.toBeNull();
    expect(zip.file('OEBPS/toc.xhtml')).not.toBeNull();
    expect(zip.file('mimetype')).not.toBeNull();
  });
});

describe('stripEpub – combined scenario', () => {
  it('strips all private metadata while preserving required EPUB structure', async () => {
    const buf = await buildEpub(buildOpfContent({
      includeCreator: true,
      includePublisher: true,
      includeDate: true,
      includeRights: true,
    }));

    const stripped = await stripEpub(buf);
    const zip = await JSZip.loadAsync(stripped);
    const content = await zip.file('OEBPS/content.opf')!.async('string');

    // Private fields removed
    expect(content).not.toMatch(/dc:creator/i);
    expect(content).not.toMatch(/dc:publisher/i);
    expect(content).not.toMatch(/dc:date/i);
    expect(content).not.toMatch(/dc:rights/i);
    expect(content).not.toContain('calibre:series');

    // Required fields preserved
    expect(content).toContain('dc:identifier');
    expect(content).toContain('dc:title');
    expect(content).toContain('dc:language');
    expect(content).toContain('<manifest>');
    expect(content).toContain('<spine>');

    // All non-OPF files still present
    expect(zip.file('META-INF/container.xml')).not.toBeNull();
    expect(zip.file('OEBPS/toc.xhtml')).not.toBeNull();
  });
});
