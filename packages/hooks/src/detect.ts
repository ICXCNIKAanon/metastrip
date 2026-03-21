/**
 * Format detection via magic bytes for Node.js Buffers.
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

/**
 * Returns true if the buffer begins with the JPEG SOI marker (0xFF 0xD8).
 */
export function isJpeg(buf: Buffer): boolean {
  if (buf.byteLength < 2) return false;
  return buf[0] === 0xff && buf[1] === 0xd8;
}

/**
 * Returns true if the buffer begins with the 8-byte PNG signature.
 */
export function isPng(buf: Buffer): boolean {
  if (buf.byteLength < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Returns true if the buffer is a valid WebP file
 * (starts with "RIFF" + 4-byte size + "WEBP").
 */
export function isWebp(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const view = new DataView(ab);
  return view.getUint32(0, true) === CC_RIFF && view.getUint32(8, true) === CC_WEBP;
}

/**
 * Detects the image format of the given buffer using magic bytes.
 * Returns 'jpeg', 'png', 'webp', or null if not recognized.
 */
export function detectFormat(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (isJpeg(buf)) return 'jpeg';
  if (isPng(buf)) return 'png';
  if (isWebp(buf)) return 'webp';
  return null;
}
