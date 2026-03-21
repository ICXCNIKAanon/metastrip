/**
 * PNG binary metadata stripper.
 *
 * Removes metadata chunks (tEXt, iTXt, zTXt, eXIf) from a PNG file by
 * operating directly on the binary chunk structure.
 * Image data (IDAT) is NEVER decoded or re-encoded — zero quality loss.
 *
 * PNG structure:
 *   8-byte signature → sequence of chunks → IEND
 *
 * Chunk layout:
 *   [4-byte length (big-endian)] [4-byte type] [data (length bytes)] [4-byte CRC]
 *   The length field counts only the data bytes — it does not include type or CRC.
 */

// ---------------------------------------------------------------------------
// PNG signature
// ---------------------------------------------------------------------------

/** The 8-byte PNG file signature. */
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ---------------------------------------------------------------------------
// Chunk type constants (as 4-byte ASCII strings encoded as uint32, big-endian)
// ---------------------------------------------------------------------------

/** Converts a 4-char ASCII string to a big-endian uint32 for fast comparison. */
function typeCode(s: string): number {
  return (
    ((s.charCodeAt(0) << 24) |
      (s.charCodeAt(1) << 16) |
      (s.charCodeAt(2) << 8) |
      s.charCodeAt(3)) >>>
    0
  );
}

// Chunks to REMOVE (metadata)
const TYPE_tEXt = typeCode('tEXt');
const TYPE_iTXt = typeCode('iTXt');
const TYPE_zTXt = typeCode('zTXt');
const TYPE_eXIf = typeCode('eXIf');

// Chunks to conditionally preserve
const TYPE_iCCP = typeCode('iCCP');

// Sentinel: stop after IEND
const TYPE_IEND = typeCode('IEND');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StripPngOptions {
  /** When false, removes iCCP color profile chunks. Defaults to true. */
  preserveIcc?: boolean;
}

/**
 * Returns true if the buffer begins with the 8-byte PNG signature.
 */
export function isPng(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const view = new Uint8Array(buffer);
  for (let i = 0; i < 8; i++) {
    if (view[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Strips metadata chunks from a PNG binary buffer.
 *
 * Chunks removed by default:
 *   tEXt — Text metadata
 *   iTXt — International text (often XMP)
 *   zTXt — Compressed text
 *   eXIf — EXIF data
 *
 * Chunks always preserved:
 *   IHDR, PLTE, IDAT, IEND — critical image data
 *   iCCP — ICC color profile (unless preserveIcc: false)
 *   sRGB, gAMA, cHRM, pHYs, sBIT, tRNS, bKGD, hIST, sPLT — rendering hints
 *   acTL, fcTL, fdAT — animation data
 *
 * @throws {Error} if the buffer is not a valid PNG.
 */
export function stripPng(
  buffer: ArrayBuffer,
  options: StripPngOptions = {}
): ArrayBuffer {
  const { preserveIcc = true } = options;

  if (!isPng(buffer)) {
    throw new Error('Input is not a valid PNG: missing PNG signature');
  }

  const src = new Uint8Array(buffer);
  const len = src.byteLength;

  // Collect byte ranges to keep. We work with [start, end) pairs.
  const chunks: Array<[number, number]> = [];

  // Always keep the 8-byte signature.
  chunks.push([0, 8]);

  let offset = 8; // Start parsing after signature

  while (offset < len) {
    // Each chunk needs at least 12 bytes: 4 length + 4 type + 0 data + 4 CRC
    if (offset + 12 > len) {
      throw new Error(
        `Unexpected end of PNG data at offset ${offset}: not enough bytes for a complete chunk`
      );
    }

    // Read 4-byte length (big-endian) — data length only, excludes type and CRC
    const dataLength =
      ((src[offset] << 24) |
        (src[offset + 1] << 16) |
        (src[offset + 2] << 8) |
        src[offset + 3]) >>>
      0;

    // Read 4-byte chunk type
    const chunkType =
      ((src[offset + 4] << 24) |
        (src[offset + 5] << 16) |
        (src[offset + 6] << 8) |
        src[offset + 7]) >>>
      0;

    // Total chunk size: 4 (length) + 4 (type) + dataLength + 4 (CRC)
    const chunkSize = 12 + dataLength;
    const chunkEnd = offset + chunkSize;

    if (chunkEnd > len) {
      throw new Error(
        `PNG chunk at offset ${offset} claims data length ${dataLength} but only ${len - offset - 12} bytes of data remain`
      );
    }

    const keep = shouldKeepChunk(chunkType, preserveIcc);

    if (keep) {
      chunks.push([offset, chunkEnd]);
    }

    offset = chunkEnd;

    // Stop after IEND — any trailing bytes are ignored
    if (chunkType === TYPE_IEND) {
      break;
    }
  }

  // Assemble output buffer.
  const totalSize = chunks.reduce((acc, [s, e]) => acc + (e - s), 0);
  const out = new Uint8Array(totalSize);
  let outOffset = 0;
  for (const [start, end] of chunks) {
    out.set(src.subarray(start, end), outOffset);
    outOffset += end - start;
  }

  return out.buffer;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given chunk type should be preserved in the output.
 */
function shouldKeepChunk(chunkType: number, preserveIcc: boolean): boolean {
  // Strip metadata chunks
  if (chunkType === TYPE_tEXt) return false;
  if (chunkType === TYPE_iTXt) return false;
  if (chunkType === TYPE_zTXt) return false;
  if (chunkType === TYPE_eXIf) return false;

  // ICC color profile — kept unless caller opts out
  if (chunkType === TYPE_iCCP) return preserveIcc;

  // All other chunks are preserved (IHDR, PLTE, IDAT, IEND, rendering hints,
  // animation chunks, etc.)
  return true;
}
