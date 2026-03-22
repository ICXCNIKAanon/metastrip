/**
 * Format detection via magic bytes for Node.js Buffers.
 * Covers all 20 supported formats.
 */

/** The 8-byte PNG file signature. */
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Converts a 4-char ASCII string to a little-endian uint32. */
function fourCC(s: string): number {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>>
    0
  );
}

const CC_RIFF = fourCC('RIFF');
const CC_WEBP = fourCC('WEBP');
const CC_WAVE = fourCC('WAVE');
const CC_AVI_ = fourCC('AVI ');

export type FormatType =
  | 'jpeg' | 'png' | 'webp' | 'gif' | 'svg' | 'pdf'
  | 'mp3' | 'wav' | 'flac' | 'mp4' | 'mov' | 'heic' | 'avif' | 'm4a'
  | 'avi' | 'mkv' | 'epub' | 'docx' | 'xlsx' | 'pptx';

export function isJpeg(buf: Buffer): boolean {
  if (buf.byteLength < 2) return false;
  return buf[0] === 0xff && buf[1] === 0xd8;
}

export function isPng(buf: Buffer): boolean {
  if (buf.byteLength < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

export function isWebp(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const view = new DataView(ab);
  return view.getUint32(0, true) === CC_RIFF && view.getUint32(8, true) === CC_WEBP;
}

export function isGif(buf: Buffer): boolean {
  if (buf.byteLength < 6) return false;
  return (
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61
  );
}

export function isSvg(buf: Buffer): boolean {
  if (buf.byteLength === 0) return false;
  const sample = buf.slice(0, Math.min(1024, buf.byteLength));
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(sample);
  } catch {
    return false;
  }
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '').trimStart();
  return stripped.startsWith('<?xml') || stripped.startsWith('<svg');
}

export function isPdf(buf: Buffer): boolean {
  if (buf.byteLength < 5) return false;
  return (
    buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d
  );
}

export function isMp3(buf: Buffer): boolean {
  if (buf.byteLength < 3) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return true;
  return false;
}

export function isAvi(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const view = new DataView(ab);
  if (view.getUint32(0, true) !== CC_RIFF) return false;
  return buf[8] === 0x41 && buf[9] === 0x56 && buf[10] === 0x49 && buf[11] === 0x20;
}

export function isWav(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const view = new DataView(ab);
  return view.getUint32(0, true) === CC_RIFF && view.getUint32(8, true) === CC_WAVE;
}

export function isFlac(buf: Buffer): boolean {
  if (buf.byteLength < 4) return false;
  return buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43;
}

export function isMkv(buf: Buffer): boolean {
  if (buf.byteLength < 4) return false;
  return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
}

export function isEpub(buf: Buffer): boolean {
  if (buf.byteLength < 58) return false;
  if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) return false;
  const windowEnd = Math.min(buf.byteLength, 200);
  const str = String.fromCharCode.apply(null, Array.from(buf.slice(0, windowEnd)));
  return str.indexOf('application/epub+zip') >= 0;
}

export function isZip(buf: Buffer): boolean {
  if (buf.byteLength < 4) return false;
  return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

export function isHeic(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const type = String.fromCharCode(buf[4]!, buf[5]!, buf[6]!, buf[7]!);
  if (type !== 'ftyp') return false;
  const brand = String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!);
  return brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'hevc' || brand === 'hevx';
}

export function isAvif(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const type = String.fromCharCode(buf[4]!, buf[5]!, buf[6]!, buf[7]!);
  if (type !== 'ftyp') return false;
  const brand = String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!);
  return brand === 'avif' || brand === 'avis';
}

export function isM4a(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  if (String.fromCharCode(buf[4]!, buf[5]!, buf[6]!, buf[7]!) !== 'ftyp') return false;
  const brand = String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!);
  return brand === 'M4A ' || brand === 'M4B ';
}

export function isMp4(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const type = String.fromCharCode(buf[4]!, buf[5]!, buf[6]!, buf[7]!);
  if (type === 'ftyp') return true;
  if (type === 'moov' || type === 'mdat' || type === 'wide' || type === 'free') return true;
  return false;
}

/**
 * Detects the format of the given buffer using magic bytes.
 * Detection order is critical for formats that share container types:
 *   - AVI before WAV (both RIFF, but differ at bytes 8-11)
 *   - EPUB before generic ZIP
 *   - HEIC/AVIF/M4A before MP4 (all ISOBMFF ftyp)
 *   - Office formats require fileName for disambiguation
 *
 * Returns null if format is not recognized.
 */
export function detectFormat(buf: Buffer, fileName?: string): FormatType | null {
  if (isJpeg(buf)) return 'jpeg';
  if (isPng(buf)) return 'png';
  if (isWebp(buf)) return 'webp';
  if (isGif(buf)) return 'gif';
  if (isSvg(buf)) return 'svg';
  if (isPdf(buf)) return 'pdf';
  if (isMp3(buf)) return 'mp3';
  // AVI before WAV — both RIFF, but AVI has 'AVI ' and WAV has 'WAVE' at bytes 8-11
  if (isAvi(buf)) return 'avi';
  if (isWav(buf)) return 'wav';
  if (isFlac(buf)) return 'flac';
  if (isMkv(buf)) return 'mkv';
  // EPUB before generic ZIP
  if (isEpub(buf)) return 'epub';
  // HEIC/AVIF/M4A before generic MP4 — all use ftyp boxes
  if (isHeic(buf)) return 'heic';
  if (isAvif(buf)) return 'avif';
  if (isM4a(buf)) return 'm4a';
  if (isMp4(buf)) {
    const lower = (fileName ?? '').toLowerCase();
    if (lower.endsWith('.mov')) return 'mov';
    return 'mp4';
  }
  // Office formats: ZIP with specific file extension
  if (isZip(buf) && fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.docx')) return 'docx';
    if (lower.endsWith('.xlsx')) return 'xlsx';
    if (lower.endsWith('.pptx')) return 'pptx';
  }
  return null;
}
