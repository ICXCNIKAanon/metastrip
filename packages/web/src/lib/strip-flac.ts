/**
 * FLAC binary metadata stripper.
 *
 * Removes Vorbis comment fields and picture blocks from a FLAC file by
 * operating directly on the binary metadata block structure.
 * Audio frames are NEVER touched — zero quality loss.
 *
 * FLAC structure:
 *   "fLaC" magic (4 bytes)
 *   → sequence of metadata blocks
 *   → audio frames
 *
 * Each metadata block header (4 bytes):
 *   bit 7       — is-last-metadata-block flag
 *   bits 6–0    — block type (0–127)
 *   bytes 1–3   — block data length (24-bit big-endian unsigned)
 *
 * Block types:
 *   0  STREAMINFO        — MUST preserve (sample rate, channels, total samples, MD5)
 *   1  PADDING           — preserved
 *   2  APPLICATION       — preserved
 *   3  SEEKTABLE         — preserved
 *   4  VORBIS_COMMENT    — replaced with an empty vorbis comment block
 *   5  CUESHEET          — preserved
 *   6  PICTURE           — removed entirely
 *   7–126 reserved       — preserved (pass through unknown types safely)
 *
 * The is-last flag is corrected on the final kept metadata block after stripping.
 */

/** FLAC magic bytes: 'f', 'L', 'a', 'C' */
const FLAC_MAGIC = [0x66, 0x4C, 0x61, 0x43] as const;

const BLOCK_TYPE_VORBIS_COMMENT = 4;
const BLOCK_TYPE_PICTURE = 6;

/**
 * Returns true if the buffer is a valid FLAC file (starts with "fLaC").
 */
export function isFlac(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer);
  return (
    bytes[0] === FLAC_MAGIC[0] &&
    bytes[1] === FLAC_MAGIC[1] &&
    bytes[2] === FLAC_MAGIC[2] &&
    bytes[3] === FLAC_MAGIC[3]
  );
}

/**
 * Builds a minimal empty VORBIS_COMMENT metadata block.
 *
 * Vorbis comment binary layout (little-endian):
 *   vendor string length (4 bytes LE) = 0
 *   user comment list length (4 bytes LE) = 0
 *   Total data: 8 bytes
 *
 * The returned Uint8Array includes the 4-byte block header.
 * The is-last flag in the header byte is NOT set here — it will be
 * corrected by the main stripping loop after all blocks are processed.
 */
function buildEmptyVorbisComment(isLast: boolean): Uint8Array {
  // 4-byte block header + 8-byte minimal vorbis comment data
  const block = new Uint8Array(12);
  const headerByte = (isLast ? 0x80 : 0x00) | BLOCK_TYPE_VORBIS_COMMENT;
  block[0] = headerByte;
  // Data length = 8, big-endian 24-bit
  block[1] = 0x00;
  block[2] = 0x00;
  block[3] = 0x08;
  // Vendor string length (LE uint32) = 0 — bytes 4–7 already 0x00
  // User comment list length (LE uint32) = 0 — bytes 8–11 already 0x00
  return block;
}

/**
 * Strips metadata from a FLAC binary buffer.
 *
 * Removed / replaced:
 *   VORBIS_COMMENT (type 4) — replaced with an empty vorbis comment
 *   PICTURE        (type 6) — removed entirely
 *
 * Always preserved:
 *   STREAMINFO (type 0) — required for playback
 *   PADDING    (type 1)
 *   APPLICATION (type 2)
 *   SEEKTABLE  (type 3)
 *   CUESHEET   (type 5)
 *   All unknown block types (pass-through)
 *   All audio frame data after the last metadata block
 *
 * The is-last flag is corrected on the final kept metadata block.
 *
 * @throws {Error} if the buffer is not a valid FLAC file.
 */
export function stripFlac(buffer: ArrayBuffer): ArrayBuffer {
  if (!isFlac(buffer)) {
    throw new Error('Input is not a valid FLAC: missing fLaC magic');
  }

  const src = new Uint8Array(buffer);

  // Parts to assemble: start with the 4-byte "fLaC" magic
  const parts: Uint8Array[] = [src.slice(0, 4)];

  let offset = 4;
  let reachedLastBlock = false;

  while (offset < buffer.byteLength && !reachedLastBlock) {
    if (offset + 4 > buffer.byteLength) break; // truncated

    const headerByte = src[offset]!;
    const isLast = (headerByte & 0x80) !== 0;
    const blockType = headerByte & 0x7F;
    // Block data length: big-endian 24-bit unsigned
    const blockLen =
      (src[offset + 1]! << 16) |
      (src[offset + 2]! << 8)  |
       src[offset + 3]!;

    const blockStart = offset;
    const blockEnd = offset + 4 + blockLen;

    if (blockEnd > buffer.byteLength) {
      // Malformed/truncated block — keep as-is up to buffer end
      parts.push(src.slice(blockStart, buffer.byteLength));
      reachedLastBlock = true;
      offset = buffer.byteLength;
      break;
    }

    if (blockType === BLOCK_TYPE_VORBIS_COMMENT) {
      // Replace with an empty vorbis comment.
      // We don't know yet whether this will be the last block in the output
      // (PICTURE blocks may follow and be removed), so pass isLast=false here;
      // we correct the is-last flag after the loop.
      parts.push(buildEmptyVorbisComment(false));
    } else if (blockType === BLOCK_TYPE_PICTURE) {
      // Remove entirely — do not push anything.
      // If this was flagged as the last block, the previous kept block will be
      // corrected to carry the is-last flag (done after the loop).
    } else {
      // Keep this block as-is (clear the is-last flag; we'll fix it after)
      const block = src.slice(blockStart, blockEnd);
      block[0] = block[0]! & 0x7F; // clear is-last bit; corrected after loop
      parts.push(block);
    }

    reachedLastBlock = isLast;
    offset = blockEnd;
  }

  // Correct the is-last flag: set it on the last kept metadata block (index > 0,
  // since parts[0] is the "fLaC" magic).
  if (parts.length > 1) {
    const lastMeta = parts[parts.length - 1]!;
    lastMeta[0] = (lastMeta[0]! & 0x7F) | 0x80; // set is-last bit
  }

  // Append all remaining audio frame data (everything after the metadata blocks)
  if (offset < buffer.byteLength) {
    parts.push(src.slice(offset));
  }

  // Assemble
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const part of parts) {
    result.set(part, writeOffset);
    writeOffset += part.length;
  }

  return result.buffer;
}
