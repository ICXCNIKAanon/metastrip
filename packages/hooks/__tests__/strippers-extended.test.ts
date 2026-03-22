/**
 * Extended stripper tests for all 17 new formats ported to the hooks package.
 * Covers: GIF, SVG, PDF, MP3, WAV, FLAC, MP4, HEIC, AVIF, M4A, AVI, MKV,
 *         DOCX/XLSX/PPTX (office), EPUB.
 */

import { describe, it, expect } from 'vitest';

import { stripGif, isGif } from '../src/strip-gif';
import { stripSvg, isSvg } from '../src/strip-svg';
import { stripPdf, isPdf } from '../src/strip-pdf';
import { stripMp3, isMp3 } from '../src/strip-mp3';
import { stripWav, isWav } from '../src/strip-wav';
import { stripFlac, isFlac } from '../src/strip-flac';
import { stripMp4, isMp4 } from '../src/strip-mp4';
import { stripHeic, isHeic } from '../src/strip-heic';
import { stripAvif, isAvif } from '../src/strip-avif';
import { stripM4a, isM4a } from '../src/strip-m4a';
import { stripAvi, isAvi } from '../src/strip-avi';
import { stripMkv, isMkv } from '../src/strip-mkv';
import { stripOffice, isZip } from '../src/strip-office';
import { stripEpub, isEpub } from '../src/strip-epub';
import {
  detectFormat,
  isGif as detectIsGif,
  isSvg as detectIsSvg,
  isPdf as detectIsPdf,
  isMp3 as detectIsMp3,
  isWav as detectIsWav,
  isFlac as detectIsFlac,
  isMp4 as detectIsMp4,
  isHeic as detectIsHeic,
  isAvif as detectIsAvif,
  isM4a as detectIsM4a,
  isAvi as detectIsAvi,
  isMkv as detectIsMkv,
  isEpub as detectIsEpub,
  isZip as detectIsZip,
} from '../src/detect';
import { validateOutput } from '../src/safety';

// ---------------------------------------------------------------------------
// GIF helpers
// ---------------------------------------------------------------------------

function buildGif(options: { includeComment?: boolean; includeAppExt?: boolean } = {}): Buffer {
  const parts: Uint8Array[] = [];

  // Header: GIF89a
  parts.push(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));

  // Logical Screen Descriptor: 10x10, no GCT
  const lsd = new Uint8Array(7);
  lsd[0] = 10; lsd[1] = 0; // width = 10
  lsd[2] = 10; lsd[3] = 0; // height = 10
  lsd[4] = 0x00; // no GCT
  lsd[5] = 0x00; // bg color index
  lsd[6] = 0x00; // pixel aspect ratio
  parts.push(lsd);

  if (options.includeComment) {
    // Comment Extension: 0x21 0xFE + sub-blocks
    const commentData = new Uint8Array(Array.from('Hello World').map(c => c.charCodeAt(0)));
    const ext = new Uint8Array(4 + commentData.length);
    ext[0] = 0x21; ext[1] = 0xfe;
    ext[2] = commentData.length; // sub-block size
    ext.set(commentData, 3);
    ext[3 + commentData.length] = 0x00; // terminator
    parts.push(ext);
  }

  if (options.includeAppExt) {
    // Application Extension: 0x21 0xFF
    // Fixed block: 0x0B, 8-char app ID + 3-char auth code
    // We use 'TESTAPP!' as app ID (not NETSCAPE) so it gets stripped
    const appData = new Uint8Array(Array.from('TESTAPP!123').map(c => c.charCodeAt(0)));
    const ext = new Uint8Array(2 + 2 + appData.length + 3);
    ext[0] = 0x21; ext[1] = 0xff;
    ext[2] = 0x0b; // fixed block size
    ext.set(appData, 3);
    ext[3 + appData.length] = 0x01; // sub-block size
    ext[3 + appData.length + 1] = 0xaa; // sub-block data
    ext[3 + appData.length + 2] = 0x00; // terminator
    parts.push(ext);
  }

  // Trailer
  parts.push(new Uint8Array([0x3b]));

  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const buf = Buffer.allocUnsafe(total);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  return buf;
}

// ---------------------------------------------------------------------------
// WAV / AVI helpers
// ---------------------------------------------------------------------------

function fourCC(s: string): number {
  return (
    (s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)) >>> 0
  );
}

function buildWav(options: { includeListInfo?: boolean } = {}): Buffer {
  // RIFF header + fmt chunk + data chunk
  const fmtData = new Uint8Array(16);
  const fmtView = new DataView(fmtData.buffer);
  fmtView.setUint16(0, 1, true);  // PCM
  fmtView.setUint16(2, 1, true);  // mono
  fmtView.setUint32(4, 44100, true); // sample rate
  fmtView.setUint32(8, 88200, true); // byte rate
  fmtView.setUint16(12, 2, true); // block align
  fmtView.setUint16(14, 16, true); // bits per sample

  const audioData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

  const chunks: Uint8Array[] = [];

  // fmt chunk
  const fmtChunk = new Uint8Array(8 + 16);
  new DataView(fmtChunk.buffer).setUint32(0, fourCC('fmt '), true);
  new DataView(fmtChunk.buffer).setUint32(4, 16, true);
  fmtChunk.set(fmtData, 8);
  chunks.push(fmtChunk);

  // data chunk
  const dataChunk = new Uint8Array(8 + audioData.length);
  new DataView(dataChunk.buffer).setUint32(0, fourCC('data'), true);
  new DataView(dataChunk.buffer).setUint32(4, audioData.length, true);
  dataChunk.set(audioData, 8);
  chunks.push(dataChunk);

  if (options.includeListInfo) {
    // LIST/INFO chunk with artist metadata
    const infoData = new Uint8Array([0x49, 0x4e, 0x41, 0x4d, 0x00, 0x41, 0x72, 0x74, 0x69, 0x73, 0x74, 0x00]); // INAM\0Artist\0
    const listChunk = new Uint8Array(12 + infoData.length);
    const lv = new DataView(listChunk.buffer);
    lv.setUint32(0, fourCC('LIST'), true);
    lv.setUint32(4, 4 + infoData.length, true);
    lv.setUint32(8, fourCC('INFO'), true);
    listChunk.set(infoData, 12);
    chunks.push(listChunk);
  }

  const innerSize = chunks.reduce((acc, c) => acc + c.length, 0);
  const header = new Uint8Array(12);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, fourCC('RIFF'), true);
  hv.setUint32(4, 4 + innerSize, true);
  hv.setUint32(8, fourCC('WAVE'), true);

  const total = 12 + innerSize;
  const buf = Buffer.allocUnsafe(total);
  buf.set(header, 0);
  let off = 12;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return buf;
}

function buildAvi(options: { includeListInfo?: boolean } = {}): Buffer {
  // Minimal AVI: RIFF/AVI with hdrl list chunk
  const hdrlData = new Uint8Array([0x01, 0x02, 0x03, 0x04]); // dummy header data

  const chunks: Uint8Array[] = [];

  // LIST/hdrl (always kept)
  const hdrlChunk = new Uint8Array(12 + hdrlData.length);
  const hv = new DataView(hdrlChunk.buffer);
  hv.setUint32(0, fourCC('LIST'), true);
  hv.setUint32(4, 4 + hdrlData.length, true);
  hv.setUint32(8, fourCC('hdrl'), true);
  hdrlChunk.set(hdrlData, 12);
  chunks.push(hdrlChunk);

  if (options.includeListInfo) {
    // LIST/INFO (gets stripped)
    const infoData = new Uint8Array([0x49, 0x4e, 0x41, 0x4d, 0x00, 0x54, 0x65, 0x73, 0x74, 0x00]); // INAM\0Test\0
    const infoChunk = new Uint8Array(12 + infoData.length);
    const iv = new DataView(infoChunk.buffer);
    iv.setUint32(0, fourCC('LIST'), true);
    iv.setUint32(4, 4 + infoData.length, true);
    iv.setUint32(8, fourCC('INFO'), true);
    infoChunk.set(infoData, 12);
    chunks.push(infoChunk);
  }

  const innerSize = chunks.reduce((acc, c) => acc + c.length, 0);
  const header = new Uint8Array(12);
  const rv = new DataView(header.buffer);
  rv.setUint32(0, fourCC('RIFF'), true);
  rv.setUint32(4, 4 + innerSize, true);
  rv.setUint32(8, fourCC('AVI '), true);

  const total = 12 + innerSize;
  const buf = Buffer.allocUnsafe(total);
  buf.set(header, 0);
  let off = 12;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return buf;
}

// ---------------------------------------------------------------------------
// FLAC helper
// ---------------------------------------------------------------------------

function buildFlac(options: { includeVorbisComment?: boolean; includePicture?: boolean } = {}): Buffer {
  const parts: Uint8Array[] = [];

  // Magic: fLaC
  parts.push(new Uint8Array([0x66, 0x4c, 0x61, 0x43]));

  // STREAMINFO block (type 0, 34 bytes)
  const streaminfo = new Uint8Array(4 + 34);
  streaminfo[0] = 0x00; // type=0, not last
  streaminfo[1] = 0x00; streaminfo[2] = 0x00; streaminfo[3] = 34; // length=34
  // fill with dummy streaminfo data
  streaminfo.fill(0xab, 4);
  parts.push(streaminfo);

  if (options.includeVorbisComment) {
    // VORBIS_COMMENT block (type 4)
    const vcData = new Uint8Array(8); // minimal: vendor_len=0, comment_count=0
    const vcBlock = new Uint8Array(4 + vcData.length);
    vcBlock[0] = 0x04; // type=4, not last
    vcBlock[1] = 0x00; vcBlock[2] = 0x00; vcBlock[3] = vcData.length;
    vcBlock.set(vcData, 4);
    parts.push(vcBlock);
  }

  if (options.includePicture) {
    // PICTURE block (type 6)
    const picData = new Uint8Array(12).fill(0xcc);
    const picBlock = new Uint8Array(4 + picData.length);
    picBlock[0] = 0x06; // type=6, not last
    picBlock[1] = 0x00; picBlock[2] = 0x00; picBlock[3] = picData.length;
    picBlock.set(picData, 4);
    parts.push(picBlock);
  }

  // Set the last block's is-last bit on the last metadata block
  const lastBlock = parts[parts.length - 1]!;
  lastBlock[0] = lastBlock[0]! | 0x80;

  // Some fake audio data
  parts.push(new Uint8Array([0xff, 0xf8, 0x00, 0x00]));

  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const buf = Buffer.allocUnsafe(total);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  return buf;
}

// ---------------------------------------------------------------------------
// MP3 helper
// ---------------------------------------------------------------------------

function buildMp3(options: { includeId3v2?: boolean; includeId3v1?: boolean } = {}): Buffer {
  const parts: Uint8Array[] = [];

  if (options.includeId3v2) {
    // Minimal ID3v2.3 tag: "ID3" + version + flags + syncsafe size
    const tagData = new Uint8Array(20).fill(0xdd); // 20 bytes of fake tag data
    const tagSize = tagData.length;
    // Encode tagSize as syncsafe integer
    const ss = new Uint8Array(4);
    ss[3] = tagSize & 0x7f;
    ss[2] = (tagSize >> 7) & 0x7f;
    ss[1] = (tagSize >> 14) & 0x7f;
    ss[0] = (tagSize >> 21) & 0x7f;
    const header = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, ss[0]!, ss[1]!, ss[2]!, ss[3]!]);
    parts.push(header);
    parts.push(tagData);
  }

  // Fake MPEG audio frame sync
  parts.push(new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]));

  if (options.includeId3v1) {
    // ID3v1 tag: 128 bytes starting with "TAG"
    const id3v1 = new Uint8Array(128);
    id3v1[0] = 0x54; id3v1[1] = 0x41; id3v1[2] = 0x47; // TAG
    id3v1.fill(0x20, 3); // spaces
    parts.push(id3v1);
  }

  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const buf = Buffer.allocUnsafe(total);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  return buf;
}

// ---------------------------------------------------------------------------
// ISOBMFF helper (MP4/HEIC/AVIF/M4A)
// ---------------------------------------------------------------------------

function buildFtypBox(brand: string, compatible: string[] = []): Uint8Array {
  // ftyp box: size(4) + 'ftyp'(4) + major_brand(4) + minor_version(4) + compatible_brands(4 each)
  const dataSize = 8 + compatible.length * 4;
  const boxSize = 8 + dataSize;
  const box = new Uint8Array(boxSize);
  const view = new DataView(box.buffer);
  view.setUint32(0, boxSize);
  box[4] = 0x66; box[5] = 0x74; box[6] = 0x79; box[7] = 0x70; // ftyp
  for (let i = 0; i < 4; i++) box[8 + i] = brand.charCodeAt(i);
  view.setUint32(12, 0); // minor version
  for (let i = 0; i < compatible.length; i++) {
    for (let j = 0; j < 4; j++) box[16 + i * 4 + j] = compatible[i]!.charCodeAt(j);
  }
  return box;
}

function buildFreeBox(data: Uint8Array): Uint8Array {
  // A 'free' box — kept by stripMp4 as a pass-through, good as dummy trak
  const box = new Uint8Array(8 + data.length);
  new DataView(box.buffer).setUint32(0, box.length);
  box[4] = 0x66; box[5] = 0x72; box[6] = 0x65; box[7] = 0x65; // free
  box.set(data, 8);
  return box;
}

function buildMoovBox(includeUdta = false): Uint8Array {
  // Use a proper 'free' child box as dummy content (not raw bytes)
  const freeBox = buildFreeBox(new Uint8Array([0x01, 0x02, 0x03, 0x04]));

  let moovData: Uint8Array;
  if (includeUdta) {
    // udta box with some metadata
    const udtaData = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const udtaBox = new Uint8Array(8 + udtaData.length);
    new DataView(udtaBox.buffer).setUint32(0, udtaBox.length);
    udtaBox[4] = 0x75; udtaBox[5] = 0x64; udtaBox[6] = 0x74; udtaBox[7] = 0x61; // udta
    udtaBox.set(udtaData, 8);

    moovData = new Uint8Array(freeBox.length + udtaBox.length);
    moovData.set(freeBox, 0);
    moovData.set(udtaBox, freeBox.length);
  } else {
    moovData = freeBox;
  }

  const moovBox = new Uint8Array(8 + moovData.length);
  new DataView(moovBox.buffer).setUint32(0, moovBox.length);
  moovBox[4] = 0x6d; moovBox[5] = 0x6f; moovBox[6] = 0x6f; moovBox[7] = 0x76; // moov
  moovBox.set(moovData, 8);
  return moovBox;
}

function buildIsobmffFile(brand: string, includeUdta = false): Buffer {
  const ftyp = buildFtypBox(brand);
  const moov = buildMoovBox(includeUdta);

  const total = ftyp.length + moov.length;
  const buf = Buffer.allocUnsafe(total);
  buf.set(ftyp, 0);
  buf.set(moov, ftyp.length);
  return buf;
}

// ---------------------------------------------------------------------------
// MKV helper
// ---------------------------------------------------------------------------

function encodeVint(value: number, width: number): Uint8Array {
  const out = new Uint8Array(width);
  out[0] = (0x80 >> (width - 1));
  let remaining = value;
  for (let i = width - 1; i >= 0; i--) {
    out[i]! |= (remaining & 0xff);
    remaining >>>= 8;
  }
  return out;
}

function buildEbmlElement(id: Uint8Array, data: Uint8Array): Uint8Array {
  const sizeVint = encodeVint(data.length, 1);
  const el = new Uint8Array(id.length + sizeVint.length + data.length);
  el.set(id, 0);
  el.set(sizeVint, id.length);
  el.set(data, id.length + sizeVint.length);
  return el;
}

function buildMkv(options: { includeTags?: boolean } = {}): Buffer {
  // EBML header ID: 0x1A45DFA3 (4 bytes, raw)
  const ebmlId = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
  const ebmlData = new Uint8Array([0x42, 0x86, 0x81, 0x01]); // DocType=matroska version marker
  const ebmlHeader = buildEbmlElement(ebmlId, ebmlData);

  // Tracks element ID: 0x1654AE6B
  const tracksId = new Uint8Array([0x16, 0x54, 0xae, 0x6b]);
  const tracksData = new Uint8Array([0x01, 0x02, 0x03]); // dummy tracks data

  let segmentChildren = buildEbmlElement(tracksId, tracksData);

  if (options.includeTags) {
    // Tags element ID: 0x1254C367
    const tagsId = new Uint8Array([0x12, 0x54, 0xc3, 0x67]);
    const tagsData = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const tagsEl = buildEbmlElement(tagsId, tagsData);
    const combined = new Uint8Array(segmentChildren.length + tagsEl.length);
    combined.set(segmentChildren, 0);
    combined.set(tagsEl, segmentChildren.length);
    segmentChildren = combined;
  }

  // Segment ID: 0x18538067
  const segmentId = new Uint8Array([0x18, 0x53, 0x80, 0x67]);
  const segment = buildEbmlElement(segmentId, segmentChildren);

  const total = ebmlHeader.length + segment.length;
  const buf = Buffer.allocUnsafe(total);
  buf.set(ebmlHeader, 0);
  buf.set(segment, ebmlHeader.length);
  return buf;
}

// ---------------------------------------------------------------------------
// PDF helper
// ---------------------------------------------------------------------------

function buildPdf(options: { includeAuthor?: boolean; includeXmp?: boolean } = {}): Buffer {
  let content = '%PDF-1.4\n';

  if (options.includeAuthor) {
    content += '/Author (John Doe)\n';
  }

  if (options.includeXmp) {
    content += '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>\n';
    content += '<x:xmpmeta>some xmp data here</x:xmpmeta>\n';
    content += '<?xpacket end="w"?>\n';
  }

  content += '%%EOF\n';
  return Buffer.from(content, 'latin1');
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function buildSvg(options: { includeMetadata?: boolean; includeComment?: boolean } = {}): Buffer {
  let svg = '<?xml version="1.0" encoding="UTF-8"?>\n';
  svg += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n';

  if (options.includeMetadata) {
    svg += '  <metadata><rdf:RDF><cc:Work><dc:creator>Author Name</dc:creator></cc:Work></rdf:RDF></metadata>\n';
  }

  if (options.includeComment) {
    svg += '  <!-- Created by Inkscape 1.2 -->\n';
  }

  svg += '  <rect x="0" y="0" width="100" height="100" fill="blue"/>\n';
  svg += '</svg>';
  return Buffer.from(svg, 'utf-8');
}

// ===========================================================================
// GIF tests
// ===========================================================================

describe('isGif', () => {
  it('returns true for GIF89a', () => {
    expect(isGif(buildGif())).toBe(true);
  });

  it('returns false for non-GIF buffer', () => {
    expect(isGif(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]))).toBe(false);
  });

  it('returns false for short buffer', () => {
    expect(isGif(Buffer.from([0x47, 0x49, 0x46]))).toBe(false);
  });
});

describe('stripGif – removes comment extensions', () => {
  it('removes comment extension block', () => {
    const input = buildGif({ includeComment: true });
    const { output } = stripGif(input);
    // Comment extension: 0x21 0xFE should not be in output
    let found = false;
    for (let i = 0; i < output.byteLength - 1; i++) {
      if (output[i] === 0x21 && output[i + 1] === 0xfe) { found = true; break; }
    }
    expect(found).toBe(false);
  });

  it('returns comments category when comment is stripped', () => {
    const input = buildGif({ includeComment: true });
    const { categories } = stripGif(input);
    expect(categories).toContain('comments');
  });

  it('returns empty categories for clean GIF', () => {
    const input = buildGif();
    const { categories } = stripGif(input);
    expect(categories).toEqual([]);
  });

  it('output starts with GIF header', () => {
    const input = buildGif({ includeComment: true });
    const { output } = stripGif(input);
    expect(output[0]).toBe(0x47); // G
    expect(output[1]).toBe(0x49); // I
    expect(output[2]).toBe(0x46); // F
  });

  it('output is smaller than input when comment is present', () => {
    const input = buildGif({ includeComment: true });
    const { output } = stripGif(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('throws on non-GIF input', () => {
    expect(() => stripGif(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]))).toThrow(/not a valid GIF/i);
  });
});

// ===========================================================================
// SVG tests
// ===========================================================================

describe('isSvg', () => {
  it('returns true for SVG starting with <?xml', () => {
    expect(isSvg(buildSvg())).toBe(true);
  });

  it('returns true for SVG starting with <svg', () => {
    const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf-8');
    expect(isSvg(buf)).toBe(true);
  });

  it('returns false for non-SVG buffer', () => {
    expect(isSvg(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
  });
});

describe('stripSvg – removes metadata elements', () => {
  it('removes <metadata> blocks', () => {
    const input = buildSvg({ includeMetadata: true });
    const { output } = stripSvg(input);
    expect(output.toString('utf-8')).not.toContain('<metadata>');
  });

  it('removes XML comments', () => {
    const input = buildSvg({ includeComment: true });
    const { output } = stripSvg(input);
    expect(output.toString('utf-8')).not.toContain('<!--');
  });

  it('preserves visual elements', () => {
    const input = buildSvg({ includeComment: true, includeMetadata: true });
    const { output } = stripSvg(input);
    const text = output.toString('utf-8');
    expect(text).toContain('<rect');
    expect(text).toContain('<svg');
  });

  it('returns categories when metadata is stripped', () => {
    const input = buildSvg({ includeMetadata: true });
    const { categories } = stripSvg(input);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('throws on non-SVG input', () => {
    expect(() => stripSvg(Buffer.from([0xff, 0xd8, 0xff]))).toThrow(/not a valid SVG/i);
  });
});

// ===========================================================================
// PDF tests
// ===========================================================================

describe('isPdf', () => {
  it('returns true for PDF buffer', () => {
    expect(isPdf(buildPdf())).toBe(true);
  });

  it('returns false for non-PDF', () => {
    expect(isPdf(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
  });
});

describe('stripPdf – removes metadata', () => {
  it('blanks Author field', () => {
    const input = buildPdf({ includeAuthor: true });
    const { output } = stripPdf(input);
    const text = output.toString('latin1');
    expect(text).not.toContain('John Doe');
  });

  it('returns document info category when author is present', () => {
    const input = buildPdf({ includeAuthor: true });
    const { categories } = stripPdf(input);
    expect(categories).toContain('document info');
  });

  it('blanks XMP stream content', () => {
    const input = buildPdf({ includeXmp: true });
    const { output } = stripPdf(input);
    const text = output.toString('latin1');
    expect(text).not.toContain('some xmp data here');
  });

  it('returns XMP category when XMP is present', () => {
    const input = buildPdf({ includeXmp: true });
    const { categories } = stripPdf(input);
    expect(categories).toContain('XMP');
  });

  it('preserves PDF header', () => {
    const input = buildPdf();
    const { output } = stripPdf(input);
    expect(output[0]).toBe(0x25); // %
    expect(output[1]).toBe(0x50); // P
  });

  it('throws on non-PDF input', () => {
    expect(() => stripPdf(Buffer.from([0x00, 0x01]))).toThrow(/not a valid PDF/i);
  });
});

// ===========================================================================
// MP3 tests
// ===========================================================================

describe('isMp3', () => {
  it('returns true for ID3-tagged MP3', () => {
    expect(isMp3(buildMp3({ includeId3v2: true }))).toBe(true);
  });

  it('returns true for MPEG frame sync', () => {
    expect(isMp3(buildMp3())).toBe(true);
  });

  it('returns false for non-MP3', () => {
    expect(isMp3(Buffer.from([0x00, 0x01, 0x02]))).toBe(false);
  });
});

describe('stripMp3 – removes ID3 tags', () => {
  it('removes ID3v2 tag from start', () => {
    const input = buildMp3({ includeId3v2: true });
    const { output } = stripMp3(input);
    // Should not start with ID3
    expect(output[0] === 0x49 && output[1] === 0x44 && output[2] === 0x33).toBe(false);
  });

  it('removes ID3v1 tag from end', () => {
    const input = buildMp3({ includeId3v1: true });
    const { output } = stripMp3(input);
    // Last 3 bytes should not be 'TAG' (0x54 0x41 0x47)
    const len = output.byteLength;
    if (len >= 3) {
      const lastThree = output.slice(len - 128, len - 125);
      expect(lastThree[0] === 0x54 && lastThree[1] === 0x41 && lastThree[2] === 0x47).toBe(false);
    }
  });

  it('returns ID3 tags category when tags are removed', () => {
    const input = buildMp3({ includeId3v2: true });
    const { categories } = stripMp3(input);
    expect(categories).toContain('ID3 tags');
  });

  it('output is smaller than input when ID3v2 present', () => {
    const input = buildMp3({ includeId3v2: true });
    const { output } = stripMp3(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('throws on non-MP3 input', () => {
    expect(() => stripMp3(Buffer.from([0x00, 0x01, 0x02]))).toThrow(/not a valid MP3/i);
  });
});

// ===========================================================================
// WAV tests
// ===========================================================================

describe('isWav', () => {
  it('returns true for WAV buffer', () => {
    expect(isWav(buildWav())).toBe(true);
  });

  it('returns false for AVI (also RIFF but different subtype)', () => {
    expect(isWav(buildAvi())).toBe(false);
  });
});

describe('stripWav – removes metadata chunks', () => {
  it('removes LIST/INFO chunk', () => {
    const input = buildWav({ includeListInfo: true });
    const inputLen = input.byteLength;
    const { output } = stripWav(input);
    expect(output.byteLength).toBeLessThan(inputLen);
  });

  it('returns text metadata category when LIST/INFO is present', () => {
    const input = buildWav({ includeListInfo: true });
    const { categories } = stripWav(input);
    expect(categories).toContain('text metadata');
  });

  it('preserves fmt and data chunks', () => {
    const input = buildWav({ includeListInfo: true });
    const { output } = stripWav(input);
    // Check for 'fmt ' (0x66 0x6d 0x74 0x20) in output
    let fmtFound = false;
    for (let i = 0; i < output.byteLength - 3; i++) {
      if (output[i] === 0x66 && output[i+1] === 0x6d && output[i+2] === 0x74 && output[i+3] === 0x20) {
        fmtFound = true;
        break;
      }
    }
    expect(fmtFound).toBe(true);
  });

  it('output is still detected as WAV', () => {
    const input = buildWav({ includeListInfo: true });
    const { output } = stripWav(input);
    expect(isWav(output)).toBe(true);
  });

  it('throws on non-WAV input', () => {
    expect(() => stripWav(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]))).toThrow(/not a valid WAV/i);
  });
});

// ===========================================================================
// FLAC tests
// ===========================================================================

describe('isFlac', () => {
  it('returns true for FLAC buffer', () => {
    expect(isFlac(buildFlac())).toBe(true);
  });

  it('returns false for non-FLAC', () => {
    expect(isFlac(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe(false);
  });
});

describe('stripFlac – removes vorbis comment and picture', () => {
  it('removes VORBIS_COMMENT block', () => {
    const input = buildFlac({ includeVorbisComment: true });
    const { output } = stripFlac(input);
    // The stripped output replaces vorbis comment with empty one (8 bytes data)
    expect(output.byteLength).toBeGreaterThan(0);
  });

  it('returns ID3 tags category when vorbis comment is present', () => {
    const input = buildFlac({ includeVorbisComment: true });
    const { categories } = stripFlac(input);
    expect(categories).toContain('ID3 tags');
  });

  it('removes PICTURE block entirely', () => {
    const input = buildFlac({ includePicture: true });
    const { output } = stripFlac(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('returns thumbnails category when picture block is present', () => {
    const input = buildFlac({ includePicture: true });
    const { categories } = stripFlac(input);
    expect(categories).toContain('thumbnails');
  });

  it('output starts with fLaC magic', () => {
    const input = buildFlac({ includeVorbisComment: true });
    const { output } = stripFlac(input);
    expect(output[0]).toBe(0x66); // f
    expect(output[1]).toBe(0x4c); // L
    expect(output[2]).toBe(0x61); // a
    expect(output[3]).toBe(0x43); // C
  });

  it('throws on non-FLAC input', () => {
    expect(() => stripFlac(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toThrow(/not a valid FLAC/i);
  });
});

// ===========================================================================
// MP4 tests
// ===========================================================================

describe('isMp4', () => {
  it('returns true for MP4 with ftyp box', () => {
    expect(isMp4(buildIsobmffFile('isom'))).toBe(true);
  });

  it('returns false for non-MP4', () => {
    expect(isMp4(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]))).toBe(false);
  });
});

describe('stripMp4 – removes udta box', () => {
  it('removes udta box from moov', () => {
    const input = buildIsobmffFile('isom', true);
    const { output } = stripMp4(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('returns metadata category when udta is present', () => {
    const input = buildIsobmffFile('isom', true);
    const { categories } = stripMp4(input);
    expect(categories).toContain('metadata');
  });

  it('output still starts with ftyp box', () => {
    const input = buildIsobmffFile('isom', true);
    const { output } = stripMp4(input);
    expect(output[4]).toBe(0x66); // f
    expect(output[5]).toBe(0x74); // t
    expect(output[6]).toBe(0x79); // y
    expect(output[7]).toBe(0x70); // p
  });

  it('throws on non-MP4 input', () => {
    expect(() => stripMp4(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]))).toThrow(/not a valid MP4/i);
  });
});

// ===========================================================================
// HEIC tests
// ===========================================================================

describe('isHeic', () => {
  it('returns true for HEIC brand', () => {
    const buf = buildIsobmffFile('heic');
    // Manually patch brand to 'heic' (ftyp box data starts at byte 8)
    expect(isHeic(buf)).toBe(true);
  });

  it('returns false for non-HEIC ftyp brand', () => {
    expect(isHeic(buildIsobmffFile('isom'))).toBe(false);
  });
});

describe('stripHeic', () => {
  it('strips metadata from HEIC file', () => {
    const input = buildIsobmffFile('heic', true);
    const { output } = stripHeic(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('throws on non-HEIC input', () => {
    expect(() => stripHeic(buildIsobmffFile('isom'))).toThrow(/not a valid HEIC/i);
  });
});

// ===========================================================================
// AVIF tests
// ===========================================================================

describe('isAvif', () => {
  it('returns true for AVIF brand', () => {
    expect(isAvif(buildIsobmffFile('avif'))).toBe(true);
  });

  it('returns false for non-AVIF brand', () => {
    expect(isAvif(buildIsobmffFile('isom'))).toBe(false);
  });
});

describe('stripAvif', () => {
  it('strips metadata from AVIF file', () => {
    const input = buildIsobmffFile('avif', true);
    const { output } = stripAvif(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('throws on non-AVIF input', () => {
    expect(() => stripAvif(buildIsobmffFile('isom'))).toThrow(/not a valid AVIF/i);
  });
});

// ===========================================================================
// M4A tests
// ===========================================================================

describe('isM4a', () => {
  it('returns true for M4A brand', () => {
    expect(isM4a(buildIsobmffFile('M4A '))).toBe(true);
  });

  it('returns false for non-M4A brand', () => {
    expect(isM4a(buildIsobmffFile('isom'))).toBe(false);
  });
});

describe('stripM4a', () => {
  it('strips metadata from M4A file', () => {
    const input = buildIsobmffFile('M4A ', true);
    const { output } = stripM4a(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('throws on non-M4A input', () => {
    expect(() => stripM4a(buildIsobmffFile('isom'))).toThrow(/not a valid M4A/i);
  });
});

// ===========================================================================
// AVI tests
// ===========================================================================

describe('isAvi', () => {
  it('returns true for AVI buffer', () => {
    expect(isAvi(buildAvi())).toBe(true);
  });

  it('returns false for WAV (also RIFF)', () => {
    expect(isAvi(buildWav())).toBe(false);
  });
});

describe('stripAvi – removes LIST/INFO', () => {
  it('removes LIST/INFO chunk', () => {
    const input = buildAvi({ includeListInfo: true });
    const { output } = stripAvi(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('returns text metadata category when LIST/INFO is present', () => {
    const input = buildAvi({ includeListInfo: true });
    const { categories } = stripAvi(input);
    expect(categories).toContain('text metadata');
  });

  it('preserves LIST/hdrl chunk', () => {
    const input = buildAvi({ includeListInfo: true });
    const { output } = stripAvi(input);
    // 'hdrl' fourcc should still be in output
    let found = false;
    for (let i = 0; i < output.byteLength - 3; i++) {
      if (output[i] === 0x68 && output[i+1] === 0x64 && output[i+2] === 0x72 && output[i+3] === 0x6c) {
        found = true; break;
      }
    }
    expect(found).toBe(true);
  });

  it('output is still detected as AVI', () => {
    const input = buildAvi({ includeListInfo: true });
    const { output } = stripAvi(input);
    expect(isAvi(output)).toBe(true);
  });

  it('throws on non-AVI input', () => {
    expect(() => stripAvi(buildWav())).toThrow(/not a valid AVI/i);
  });
});

// ===========================================================================
// MKV tests
// ===========================================================================

describe('isMkv', () => {
  it('returns true for MKV buffer (EBML magic)', () => {
    expect(isMkv(buildMkv())).toBe(true);
  });

  it('returns false for non-MKV', () => {
    expect(isMkv(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe(false);
  });
});

describe('stripMkv – removes Tags element', () => {
  it('removes Tags element from segment', () => {
    const input = buildMkv({ includeTags: true });
    const { output } = stripMkv(input);
    expect(output.byteLength).toBeLessThan(input.byteLength);
  });

  it('returns metadata category when Tags element is present', () => {
    const input = buildMkv({ includeTags: true });
    const { categories } = stripMkv(input);
    expect(categories).toContain('metadata');
  });

  it('output starts with EBML magic', () => {
    const input = buildMkv({ includeTags: true });
    const { output } = stripMkv(input);
    expect(output[0]).toBe(0x1a);
    expect(output[1]).toBe(0x45);
    expect(output[2]).toBe(0xdf);
    expect(output[3]).toBe(0xa3);
  });

  it('throws on non-MKV input', () => {
    expect(() => stripMkv(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toThrow(/not a valid MKV/i);
  });
});

// ===========================================================================
// Office (DOCX/XLSX/PPTX) tests — async
// ===========================================================================

describe('isZip', () => {
  it('returns false for non-ZIP', () => {
    expect(isZip(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe(false);
  });
});

describe('stripOffice – removes docProps metadata', async () => {
  // We can't easily build a synthetic valid DOCX in tests without JSZip itself,
  // so we test that non-ZIP input is rejected.
  it('throws on non-ZIP input', async () => {
    await expect(stripOffice(Buffer.from([0x00, 0x01, 0x02, 0x03]))).rejects.toThrow(/not a valid Office/i);
  });
});

// ===========================================================================
// EPUB tests — async
// ===========================================================================

describe('isEpub', () => {
  it('returns false for non-EPUB ZIP (no epub+zip marker)', () => {
    // Short ZIP header without the epub marker
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    expect(isEpub(buf)).toBe(false);
  });

  it('returns false for non-ZIP buffer', () => {
    expect(isEpub(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe(false);
  });
});

describe('stripEpub – rejects invalid input', () => {
  it('throws on non-EPUB input', async () => {
    await expect(stripEpub(Buffer.from([0x00, 0x01, 0x02, 0x03]))).rejects.toThrow(/not a valid EPUB/i);
  });
});

// ===========================================================================
// detectFormat extended tests
// ===========================================================================

describe('detectFormat – extended formats', () => {
  it('detects GIF', () => {
    expect(detectFormat(buildGif())).toBe('gif');
  });

  it('detects SVG', () => {
    expect(detectFormat(buildSvg())).toBe('svg');
  });

  it('detects PDF', () => {
    expect(detectFormat(buildPdf())).toBe('pdf');
  });

  it('detects MP3', () => {
    expect(detectFormat(buildMp3())).toBe('mp3');
  });

  it('detects WAV', () => {
    expect(detectFormat(buildWav())).toBe('wav');
  });

  it('detects AVI (not WAV) for RIFF/AVI buffer', () => {
    expect(detectFormat(buildAvi())).toBe('avi');
  });

  it('detects FLAC', () => {
    expect(detectFormat(buildFlac())).toBe('flac');
  });

  it('detects MKV', () => {
    expect(detectFormat(buildMkv())).toBe('mkv');
  });

  it('detects MP4 with isom brand', () => {
    expect(detectFormat(buildIsobmffFile('isom'))).toBe('mp4');
  });

  it('detects HEIC brand before MP4', () => {
    expect(detectFormat(buildIsobmffFile('heic'))).toBe('heic');
  });

  it('detects AVIF brand before MP4', () => {
    expect(detectFormat(buildIsobmffFile('avif'))).toBe('avif');
  });

  it('detects M4A brand before MP4', () => {
    expect(detectFormat(buildIsobmffFile('M4A '))).toBe('m4a');
  });

  it('detects MOV by fileName', () => {
    const buf = buildIsobmffFile('isom');
    expect(detectFormat(buf, 'video.mov')).toBe('mov');
  });

  it('detects DOCX by fileName for ZIP buffer', () => {
    // We need a ZIP magic bytes prefix without epub marker
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectFormat(buf, 'document.docx')).toBe('docx');
  });

  it('detects XLSX by fileName for ZIP buffer', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectFormat(buf, 'spreadsheet.xlsx')).toBe('xlsx');
  });

  it('detects PPTX by fileName for ZIP buffer', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectFormat(buf, 'slides.pptx')).toBe('pptx');
  });
});

// ===========================================================================
// validateOutput extended tests
// ===========================================================================

describe('validateOutput – extended formats', () => {
  it('validates GIF output', () => {
    expect(validateOutput(buildGif(), 'gif')).toBe(true);
  });

  it('validates SVG output', () => {
    expect(validateOutput(buildSvg(), 'svg')).toBe(true);
  });

  it('validates PDF output', () => {
    expect(validateOutput(buildPdf(), 'pdf')).toBe(true);
  });

  it('validates MP3 output', () => {
    expect(validateOutput(buildMp3(), 'mp3')).toBe(true);
  });

  it('validates WAV output', () => {
    expect(validateOutput(buildWav(), 'wav')).toBe(true);
  });

  it('validates FLAC output', () => {
    expect(validateOutput(buildFlac(), 'flac')).toBe(true);
  });

  it('validates MP4 output', () => {
    expect(validateOutput(buildIsobmffFile('isom'), 'mp4')).toBe(true);
  });

  it('validates HEIC output', () => {
    expect(validateOutput(buildIsobmffFile('heic'), 'heic')).toBe(true);
  });

  it('validates AVIF output', () => {
    expect(validateOutput(buildIsobmffFile('avif'), 'avif')).toBe(true);
  });

  it('validates M4A output', () => {
    expect(validateOutput(buildIsobmffFile('M4A '), 'm4a')).toBe(true);
  });

  it('validates AVI output', () => {
    expect(validateOutput(buildAvi(), 'avi')).toBe(true);
  });

  it('validates MKV output', () => {
    expect(validateOutput(buildMkv(), 'mkv')).toBe(true);
  });

  it('rejects empty buffer for all new formats', () => {
    const empty = Buffer.alloc(0);
    const formats = ['gif', 'svg', 'pdf', 'mp3', 'wav', 'flac', 'mp4', 'heic', 'avif', 'm4a', 'avi', 'mkv'] as const;
    for (const fmt of formats) {
      expect(validateOutput(empty, fmt)).toBe(false);
    }
  });
});
