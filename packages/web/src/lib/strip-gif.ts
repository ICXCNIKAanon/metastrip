/**
 * GIF binary metadata stripper.
 *
 * Removes Comment Extension blocks (0x21 0xFE) and non-NETSCAPE Application
 * Extension blocks (0x21 0xFF) from a GIF file by operating directly on the
 * binary structure. Image data is NEVER decoded or re-encoded.
 *
 * GIF structure:
 *   Header (6 bytes: "GIF87a" or "GIF89a")
 *   → Logical Screen Descriptor (7 bytes)
 *   → optional Global Color Table
 *   → blocks (extensions + image descriptors)
 *   → Trailer (0x3B)
 *
 * Extension block layout:
 *   [0x21][extension label][sub-blocks...]
 *   Each sub-block: [byte count][...data bytes...]
 *   Sub-block list ends with a zero-length block [0x00]
 *
 * What is stripped:
 *   - Comment Extension blocks (0x21 0xFE)
 *   - Application Extension blocks (0x21 0xFF) EXCEPT "NETSCAPE2.0" / "NETSCAPE"
 *
 * What is preserved:
 *   - Header, Logical Screen Descriptor, Global Color Table
 *   - Image Descriptor blocks (0x2C) + Local Color Tables + image data
 *   - NETSCAPE2.0 Application Extension (animation looping)
 *   - Graphic Control Extensions (0x21 0xF9)
 *   - Plain Text Extensions (0x21 0x01)
 *   - Trailer (0x3B)
 */

// ---------------------------------------------------------------------------
// Extension label constants
// ---------------------------------------------------------------------------

const EXT_INTRODUCER = 0x21;
const EXT_COMMENT = 0xfe;      // Comment Extension
const EXT_APPLICATION = 0xff;  // Application Extension
const EXT_GRAPHIC_CTRL = 0xf9; // Graphic Control Extension
const EXT_PLAIN_TEXT = 0x01;   // Plain Text Extension

const IMAGE_DESCRIPTOR = 0x2c; // Image Descriptor
const TRAILER = 0x3b;          // GIF Trailer

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the buffer begins with a GIF header ("GIF87a" or "GIF89a").
 */
export function isGif(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 6) return false;
  const view = new Uint8Array(buffer);
  // Check for "GIF8"
  return (
    view[0] === 0x47 && // G
    view[1] === 0x49 && // I
    view[2] === 0x46 && // F
    view[3] === 0x38 && // 8
    (view[4] === 0x37 || view[4] === 0x39) && // 7 or 9
    view[5] === 0x61   // a
  );
}

/**
 * Strips metadata blocks from a GIF binary buffer.
 *
 * Blocks removed:
 *   Comment Extension (0x21 0xFE) — text comments, software info
 *   Application Extension (0x21 0xFF) — except NETSCAPE (animation looping)
 *
 * Blocks always preserved:
 *   Header + Logical Screen Descriptor + Global Color Table
 *   Graphic Control Extension (0x21 0xF9) — timing/transparency
 *   Plain Text Extension (0x21 0x01) — part of rendering spec
 *   Image Descriptor (0x2C) + Local Color Table + image data
 *   NETSCAPE2.0 Application Extension (animation looping)
 *   Trailer (0x3B)
 *
 * @throws {Error} if the buffer is not a valid GIF.
 */
export function stripGif(buffer: ArrayBuffer): ArrayBuffer {
  if (!isGif(buffer)) {
    throw new Error('Input is not a valid GIF: missing GIF header (GIF87a or GIF89a)');
  }

  const src = new Uint8Array(buffer);
  const len = src.byteLength;

  // Collect byte ranges to keep. We work with [start, end) pairs.
  const chunks: Array<[number, number]> = [];

  // --- Header (6 bytes) ---
  // Always keep.
  let offset = 6;

  // --- Logical Screen Descriptor (7 bytes) ---
  if (offset + 7 > len) {
    throw new Error('GIF too short: missing Logical Screen Descriptor');
  }

  // Byte 4 of the LSD (offset+4 from LSD start = offset 10 from file start)
  // contains the packed field: bit 7 = Global Color Table Flag,
  // bits 0-2 = size of Global Color Table (n → 2^(n+1) entries).
  const lsdPackedField = src[offset + 4];
  const hasGct = (lsdPackedField & 0x80) !== 0;
  const gctSize = hasGct ? 3 * (1 << ((lsdPackedField & 0x07) + 1)) : 0;

  // Keep Header + LSD + GCT as one chunk.
  const headerEnd = offset + 7 + gctSize;
  if (headerEnd > len) {
    throw new Error('GIF too short: Global Color Table extends beyond buffer');
  }
  chunks.push([0, headerEnd]);
  offset = headerEnd;

  // --- Parse blocks ---
  while (offset < len) {
    const blockStart = offset;
    const introducer = src[offset];
    offset++;

    if (introducer === TRAILER) {
      // Trailer — always keep.
      chunks.push([blockStart, offset]);
      break;
    }

    if (introducer === IMAGE_DESCRIPTOR) {
      // Image Descriptor: 9 bytes fixed.
      if (offset + 9 > len) {
        throw new Error(`GIF: Image Descriptor at offset ${blockStart} extends beyond buffer`);
      }
      const idPackedField = src[offset + 8]; // offset is now 1 past 0x2C
      // Wait — offset was already incremented past introducer, so Image Descriptor
      // data starts at offset. The packed field is byte 8 of the 9-byte descriptor
      // (index 0-8), so at offset + 8.
      const hasLct = (idPackedField & 0x80) !== 0;
      const lctSize = hasLct ? 3 * (1 << ((idPackedField & 0x07) + 1)) : 0;
      offset += 9; // skip Image Descriptor fixed part

      // Skip Local Color Table if present.
      if (offset + lctSize > len) {
        throw new Error(`GIF: Local Color Table at offset ${offset} extends beyond buffer`);
      }
      offset += lctSize;

      // LZW Minimum Code Size (1 byte).
      if (offset >= len) {
        throw new Error(`GIF: Missing LZW minimum code size at offset ${offset}`);
      }
      offset++; // skip LZW minimum code size

      // Image data sub-blocks.
      offset = skipSubBlocks(src, offset, len);

      // Keep the entire image descriptor block (including LCT and image data).
      chunks.push([blockStart, offset]);
      continue;
    }

    if (introducer === EXT_INTRODUCER) {
      // Extension block.
      if (offset >= len) {
        throw new Error(`GIF: Extension introducer at offset ${blockStart} has no label byte`);
      }
      const label = src[offset];
      offset++;

      if (label === EXT_APPLICATION) {
        // Application Extension:
        // Fixed sub-block of 11 bytes: [0x0B][8-char app ID][3-char app auth code]
        if (offset >= len) {
          throw new Error(`GIF: Application Extension at offset ${blockStart} truncated`);
        }
        const blockSize = src[offset]; // should be 0x0B = 11
        offset++;
        if (offset + blockSize > len) {
          throw new Error(`GIF: Application Extension fixed block at offset ${offset} extends beyond buffer`);
        }
        // Read the application identifier (first 8 bytes of the 11-byte block).
        const appId = String.fromCharCode(...src.subarray(offset, offset + Math.min(8, blockSize)));
        offset += blockSize;

        // Read the remaining sub-blocks (variable data).
        const subBlocksStart = offset;
        offset = skipSubBlocks(src, offset, len);

        const blockEnd = offset;

        // Preserve only NETSCAPE application extensions (animation looping).
        if (appId.startsWith('NETSCAPE')) {
          chunks.push([blockStart, blockEnd]);
        }
        // All other application extensions are dropped (metadata).
        continue;
      }

      if (label === EXT_COMMENT) {
        // Comment Extension — strip entirely.
        offset = skipSubBlocks(src, offset, len);
        // Do not push to chunks — dropped.
        continue;
      }

      // All other extensions (Graphic Control 0xF9, Plain Text 0x01, etc.) — preserve.
      offset = skipSubBlocks(src, offset, len);
      chunks.push([blockStart, offset]);
      continue;
    }

    // Unknown block introducer — preserve it and try to continue.
    // We cannot safely skip unknown blocks, so include up to the next known byte.
    // In practice, well-formed GIFs don't have unknown introducers.
    chunks.push([blockStart, offset]);
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
 * Advances `offset` past a sequence of GIF sub-blocks.
 * Each sub-block: [count byte][count data bytes]
 * The sequence ends with a zero-length block [0x00].
 *
 * @throws {Error} if a sub-block extends beyond the buffer.
 */
function skipSubBlocks(src: Uint8Array, offset: number, len: number): number {
  while (offset < len) {
    const blockCount = src[offset];
    offset++;
    if (blockCount === 0) break; // terminator
    if (offset + blockCount > len) {
      throw new Error(
        `GIF: Sub-block at offset ${offset - 1} claims ${blockCount} bytes but only ${len - offset} remain`
      );
    }
    offset += blockCount;
  }
  return offset;
}
