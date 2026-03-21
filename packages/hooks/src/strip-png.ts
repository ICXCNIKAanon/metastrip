/**
 * PNG binary metadata stripper (Node.js port).
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

export interface StripPngResult {
  output: Buffer;
  categories: string[];
}

/**
 * Strips metadata chunks from a PNG binary buffer.
 *
 * Chunks removed:
 *   tEXt, iTXt, zTXt — text metadata → categories: 'text metadata'
 *   eXIf — EXIF data → categories: 'GPS', 'device', 'timestamps'
 *
 * Chunks always preserved:
 *   IHDR, PLTE, IDAT, IEND — critical image data
 *   iCCP — ICC color profile (always preserved in the Node port)
 *   sRGB, gAMA, cHRM, pHYs, sBIT, tRNS, bKGD, hIST, sPLT — rendering hints
 *   acTL, fcTL, fdAT — animation data
 *
 * @throws {Error} if the buffer is not a valid PNG.
 */
export function stripPng(input: Buffer): StripPngResult {
  // Convert to clean ArrayBuffer, handling Node's Buffer pooling
  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);

  const src = new Uint8Array(ab);
  const len = src.byteLength;

  // Validate PNG signature
  if (len < 8) {
    throw new Error('Input is not a valid PNG: missing PNG signature');
  }
  for (let i = 0; i < 8; i++) {
    if (src[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Input is not a valid PNG: missing PNG signature');
    }
  }

  const categories: string[] = [];
  const categorySeen = new Set<string>();

  function addCategory(cat: string) {
    if (!categorySeen.has(cat)) {
      categorySeen.add(cat);
      categories.push(cat);
    }
  }

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
      ((src[offset]! << 24) |
        (src[offset + 1]! << 16) |
        (src[offset + 2]! << 8) |
        src[offset + 3]!) >>>
      0;

    // Read 4-byte chunk type
    const chunkType =
      ((src[offset + 4]! << 24) |
        (src[offset + 5]! << 16) |
        (src[offset + 6]! << 8) |
        src[offset + 7]!) >>>
      0;

    // Total chunk size: 4 (length) + 4 (type) + dataLength + 4 (CRC)
    const chunkSize = 12 + dataLength;
    const chunkEnd = offset + chunkSize;

    if (chunkEnd > len) {
      throw new Error(
        `PNG chunk at offset ${offset} claims data length ${dataLength} but only ${len - offset - 12} bytes of data remain`
      );
    }

    const keep = shouldKeepChunk(chunkType);

    if (keep) {
      chunks.push([offset, chunkEnd]);
    } else {
      // Track which metadata categories were removed
      if (chunkType === TYPE_tEXt || chunkType === TYPE_iTXt || chunkType === TYPE_zTXt) {
        addCategory('text metadata');
      } else if (chunkType === TYPE_eXIf) {
        addCategory('GPS');
        addCategory('device');
        addCategory('timestamps');
      }
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

  return { output: Buffer.from(out.buffer, out.byteOffset, out.byteLength), categories };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given chunk type should be preserved in the output.
 * ICC profiles (iCCP) are always preserved in the Node port.
 */
function shouldKeepChunk(chunkType: number): boolean {
  // Strip metadata chunks
  if (chunkType === TYPE_tEXt) return false;
  if (chunkType === TYPE_iTXt) return false;
  if (chunkType === TYPE_zTXt) return false;
  if (chunkType === TYPE_eXIf) return false;

  // iCCP — always preserved in the Node port.
  if (chunkType === TYPE_iCCP) return true;

  // All other chunks are preserved (IHDR, PLTE, IDAT, IEND, rendering hints,
  // animation chunks, etc.)
  return true;
}
