/**
 * WAV binary metadata stripper.
 *
 * Removes metadata chunks from a WAV file (RIFF/WAVE container).
 * Audio data (fmt  + data chunks) is NEVER modified — zero quality loss.
 *
 * WAV/RIFF structure:
 *   "RIFF" (4 bytes) + file size (4 bytes, LE) + "WAVE" (4 bytes)
 *   → sequence of chunks
 *
 * Each chunk:
 *   [4-byte FourCC] [4-byte size, little-endian] [data (padded to even bytes)]
 *
 * Chunks removed:
 *   LIST/INFO — text metadata (artist, title, comment, date, software, etc.)
 *   id3       — embedded ID3 tag
 *   bext      — Broadcast Wave Extension (originator info, timestamps, etc.)
 *   JUNK      — alignment padding often used to carry junk/garbage data
 *   PAD       — padding
 *
 * Chunks always preserved:
 *   fmt       — audio format descriptor (sample rate, channels, bit depth)
 *   data      — raw audio samples
 *   All other unrecognised chunks are preserved.
 *
 * After stripping, the RIFF file size header is recalculated.
 */

/** Converts a 4-char ASCII string to a little-endian uint32 for fast comparison. */
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
const CC_WAVE = fourCC('WAVE');
const CC_LIST = fourCC('LIST');
const CC_INFO = fourCC('INFO');

// Chunk FourCCs to remove (as uint32 LE)
const REMOVE_CHUNKS = new Set<number>([
  fourCC('id3 '), // embedded ID3 tag (note trailing space)
  fourCC('bext'), // Broadcast Wave Extension
  fourCC('JUNK'), // junk/alignment padding
  fourCC('PAD '), // padding
]);

/**
 * Returns true if the buffer is a valid WAV file
 * (starts with "RIFF" + 4-byte size + "WAVE").
 */
export function isWav(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  return view.getUint32(0, true) === CC_RIFF && view.getUint32(8, true) === CC_WAVE;
}

/**
 * Strips metadata chunks from a WAV binary buffer.
 *
 * Removed:
 *   LIST/INFO chunks (text metadata)
 *   id3  chunks (embedded ID3)
 *   bext chunks (broadcast metadata)
 *   JUNK / PAD  chunks (junk padding)
 *
 * Preserved:
 *   fmt  — audio format descriptor
 *   data — raw audio samples
 *   All other unrecognised chunks
 *
 * The RIFF file size field is recalculated after stripping.
 *
 * @throws {Error} if the buffer is not a valid WAV file.
 */
export function stripWav(buffer: ArrayBuffer): ArrayBuffer {
  if (!isWav(buffer)) {
    throw new Error('Input is not a valid WAV: missing RIFF/WAVE header');
  }

  const src = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Collect chunks to keep as [start, end) byte ranges.
  // Always keep the 12-byte RIFF header; we update the size field at the end.
  const ranges: Array<[number, number]> = [];
  ranges.push([0, 12]);

  let offset = 12;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) break; // not enough bytes for a chunk header

    const cc = view.getUint32(offset, true);
    const chunkDataSize = view.getUint32(offset + 4, true);
    // Chunks are padded to even byte boundaries; padding byte not counted in size field
    const paddedDataSize = chunkDataSize + (chunkDataSize & 1);
    const chunkEnd = offset + 8 + paddedDataSize;

    // Clamp to buffer end for malformed files
    const safeEnd = Math.min(chunkEnd, buffer.byteLength);

    if (cc === CC_LIST) {
      // LIST chunks are only removed when the list type is "INFO" (metadata).
      // Other LIST subtypes (e.g. adtl — associated data list) are preserved.
      if (offset + 12 <= buffer.byteLength) {
        const listType = view.getUint32(offset + 8, true);
        if (listType === CC_INFO) {
          // Skip this chunk (remove it)
          offset = safeEnd;
          continue;
        }
      }
      // Non-INFO LIST — keep it
      ranges.push([offset, safeEnd]);
    } else if (REMOVE_CHUNKS.has(cc)) {
      // Skip this chunk (remove it)
      offset = safeEnd;
      continue;
    } else {
      // Keep all other chunks (fmt , data, etc.)
      ranges.push([offset, safeEnd]);
    }

    offset = safeEnd;
  }

  // Assemble output
  const totalSize = ranges.reduce((acc, [s, e]) => acc + (e - s), 0);
  const out = new Uint8Array(totalSize);
  let outOffset = 0;
  for (const [start, end] of ranges) {
    out.set(src.subarray(start, end), outOffset);
    outOffset += end - start;
  }

  // Update RIFF size field: bytes 4–7 (LE) = total file size − 8
  new DataView(out.buffer).setUint32(4, totalSize - 8, true);

  return out.buffer;
}
