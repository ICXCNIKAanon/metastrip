/**
 * WebP binary metadata stripper (Node.js port).
 *
 * Removes EXIF and XMP metadata chunks from a WebP file by operating
 * directly on the binary RIFF structure.
 * Image data (VP8/VP8L) is NEVER decoded or re-encoded — zero quality loss.
 *
 * WebP structure (RIFF container):
 *   "RIFF" (4 bytes) + file size (4 bytes, LE) + "WEBP" (4 bytes)
 *   → sequence of chunks
 *
 * Each chunk:
 *   [4-byte FourCC] [4-byte size, little-endian] [data (padded to even bytes)]
 *   Padding byte (0x00) is added when data size is odd; not included in size field.
 *
 * VP8X flags byte (offset 0 within VP8X data, i.e. byte 20 from file start):
 *   bit 2 = ICC profile present
 *   bit 3 = alpha channel present
 *   bit 4 = EXIF metadata present
 *   bit 5 = XMP metadata present
 *   bit 6 = animation
 *   bits 0-1, 7 = reserved
 */

// ---------------------------------------------------------------------------
// FourCC constants (as 4-byte LE uint32 for fast comparison)
// ---------------------------------------------------------------------------

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

// Chunks to REMOVE
const CC_EXIF = fourCC('EXIF');
const CC_XMP  = fourCC('XMP '); // trailing space is significant

// Chunks to KEEP (listed for documentation; all others are also kept by default)
// VP8 , VP8L, VP8X, ICCP, ALPH, ANIM, ANMF
const CC_VP8X = fourCC('VP8X');
const CC_ICCP = fourCC('ICCP');

// VP8X flags bit positions
const FLAG_EXIF_BIT = 4; // bit 4
const FLAG_XMP_BIT  = 5; // bit 5

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StripWebpResult {
  output: Buffer;
  categories: string[];
}

/**
 * Strips metadata chunks from a WebP binary buffer.
 *
 * Chunks removed:
 *   EXIF — EXIF metadata → categories: 'GPS', 'device', 'timestamps'
 *   XMP  — XMP metadata  → categories: 'XMP'
 *
 * Chunks always preserved:
 *   VP8  — Lossy image data
 *   VP8L — Lossless image data
 *   VP8X — Extended format header (flags updated after stripping)
 *   ALPH — Alpha channel
 *   ANIM, ANMF — Animation data
 *   ICCP — ICC color profile (always preserved)
 *
 * After stripping, the VP8X flags byte is updated to clear bits 4 (EXIF)
 * and 5 (XMP), and the RIFF file size header is recalculated.
 *
 * @throws {Error} if the buffer is not a valid WebP file.
 */
export function stripWebp(input: Buffer): StripWebpResult {
  // Convert to clean ArrayBuffer, handling Node's Buffer pooling
  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);

  const src = new Uint8Array(ab);
  const len = src.byteLength;

  // Validate WebP header
  if (len < 12) {
    throw new Error('Input is not a valid WebP: missing RIFF/WEBP header');
  }
  const headerView = new DataView(ab);
  if (
    headerView.getUint32(0, true) !== CC_RIFF ||
    headerView.getUint32(8, true) !== CC_WEBP
  ) {
    throw new Error('Input is not a valid WebP: missing RIFF/WEBP header');
  }

  const categories: string[] = [];
  const categorySeen = new Set<string>();

  function addCategory(cat: string) {
    if (!categorySeen.has(cat)) {
      categorySeen.add(cat);
      categories.push(cat);
    }
  }

  // Collect byte ranges to keep: [start, end) pairs.
  // We always keep the 12-byte RIFF header ("RIFF" + size + "WEBP").
  // We will update the size field in the final output.
  const chunks: Array<[number, number]> = [];
  chunks.push([0, 12]);

  // Track whether we found and kept a VP8X chunk so we can patch its flags.
  let vp8xOutputOffset = -1; // byte offset in the OUTPUT buffer where VP8X data starts

  // Parse chunks starting after the 12-byte header.
  let offset = 12;

  while (offset < len) {
    // Each chunk needs at least 8 bytes: 4 FourCC + 4 size.
    if (offset + 8 > len) {
      // Trailing bytes too short for a chunk — stop (could be trailing padding).
      break;
    }

    const view = new DataView(ab);
    const cc = view.getUint32(offset, true);           // FourCC, LE
    const dataSize = view.getUint32(offset + 4, true); // data size, LE

    // Padded chunk size: if dataSize is odd, one padding byte follows.
    const paddedDataSize = dataSize + (dataSize & 1);
    const chunkEnd = offset + 8 + paddedDataSize;

    if (chunkEnd > len) {
      // Chunk claims more bytes than remain — clamp to buffer end and keep.
      chunks.push([offset, len]);
      break;
    }

    const keep = shouldKeepChunk(cc);

    if (keep) {
      chunks.push([offset, chunkEnd]);
    } else {
      // Track which metadata categories were removed
      if (cc === CC_EXIF) {
        addCategory('GPS');
        addCategory('device');
        addCategory('timestamps');
      } else if (cc === CC_XMP) {
        addCategory('XMP');
      }
    }

    offset = chunkEnd;
  }

  // ---------------------------------------------------------------------------
  // Assemble output buffer.
  // ---------------------------------------------------------------------------
  const totalSize = chunks.reduce((acc, [s, e]) => acc + (e - s), 0);
  const out = new Uint8Array(totalSize);
  let outOffset = 0;

  for (const [start, end] of chunks) {
    // Remember where the VP8X chunk lands in the output.
    if (
      vp8xOutputOffset === -1 &&
      start >= 12 // skip the RIFF header range
    ) {
      const cc = new DataView(ab).getUint32(start, true);
      if (cc === CC_VP8X) {
        // VP8X data starts 8 bytes after the chunk header.
        vp8xOutputOffset = outOffset + 8;
      }
    }
    out.set(src.subarray(start, end), outOffset);
    outOffset += end - start;
  }

  // ---------------------------------------------------------------------------
  // Update RIFF file size header: bytes 4-7 (LE) = total file size - 8.
  // The RIFF size counts everything after the first 8 bytes of the file.
  // ---------------------------------------------------------------------------
  const outView = new DataView(out.buffer);
  outView.setUint32(4, totalSize - 8, true);

  // ---------------------------------------------------------------------------
  // Update VP8X flags: clear EXIF (bit 4) and XMP (bit 5) flag bits.
  // Preserve all other bits (ICC bit 2, alpha bit 3, animation bit 6, etc.).
  // ---------------------------------------------------------------------------
  if (vp8xOutputOffset !== -1 && vp8xOutputOffset < out.byteLength) {
    const flagsByte = out[vp8xOutputOffset]!;
    const updated = flagsByte & ~((1 << FLAG_EXIF_BIT) | (1 << FLAG_XMP_BIT));
    out[vp8xOutputOffset] = updated;
  }

  return { output: Buffer.from(out.buffer, out.byteOffset, out.byteLength), categories };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given chunk (identified by its FourCC) should be
 * preserved in the output.
 */
function shouldKeepChunk(cc: number): boolean {
  // Strip EXIF and XMP metadata chunks.
  if (cc === CC_EXIF) return false;
  if (cc === CC_XMP)  return false;

  // ICCP — always preserved in the Node port.
  if (cc === CC_ICCP) return true;

  // All other chunks (VP8, VP8L, VP8X, ALPH, ANIM, ANMF, etc.) are preserved.
  return true;
}
