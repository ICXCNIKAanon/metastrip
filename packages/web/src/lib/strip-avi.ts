/**
 * AVI binary metadata stripper.
 *
 * AVI uses the RIFF container — same as WAV — but with 'AVI ' at bytes 8-11
 * instead of 'WAVE'. The stripping logic mirrors the WAV stripper:
 * LIST/INFO, JUNK, PAD , and id3  chunks are removed; all other chunks
 * (including LIST-movi which carries video/audio frame data) are preserved.
 *
 * After stripping, the RIFF file-size field is recalculated.
 */

const CC_JUNK = fourCC('JUNK');
const CC_PAD  = fourCC('PAD ');
const CC_ID3  = fourCC('id3 ');
const CC_LIST = fourCC('LIST');
const CC_INFO = fourCC('INFO');

function fourCC(s: string): number {
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>>
    0
  );
}

const REMOVE_CHUNKS = new Set<number>([CC_JUNK, CC_PAD, CC_ID3]);

/**
 * Returns true if the buffer is a valid AVI file
 * (RIFF header with 'AVI ' sub-type at bytes 8-11).
 */
export function isAvi(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // 'RIFF' little-endian
  if (view.getUint32(0, true) !== fourCC('RIFF')) return false;
  // 'AVI ' at bytes 8-11
  return (
    bytes[8]  === 0x41 && // A
    bytes[9]  === 0x56 && // V
    bytes[10] === 0x49 && // I
    bytes[11] === 0x20    // ' '
  );
}

/**
 * Strips metadata chunks from an AVI binary buffer.
 *
 * Removed:
 *   LIST/INFO — text metadata
 *   JUNK / PAD  — padding/junk
 *   id3  — embedded ID3 tag
 *
 * Preserved:
 *   LIST/hdrl — header list (stream info)
 *   LIST/movi — audio/video frame data
 *   All other chunks
 *
 * The RIFF file-size field is recalculated after stripping.
 *
 * @throws {Error} if the buffer is not a valid AVI file.
 */
export function stripAvi(buffer: ArrayBuffer): ArrayBuffer {
  if (!isAvi(buffer)) {
    throw new Error('Input is not a valid AVI: missing RIFF/AVI  header');
  }

  const src = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Keep byte ranges as [start, end) pairs.
  // Always preserve the 12-byte RIFF+size+'AVI ' header; size updated at end.
  const ranges: Array<[number, number]> = [];
  ranges.push([0, 12]);

  let offset = 12;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) break;

    const cc = view.getUint32(offset, true);
    const chunkDataSize = view.getUint32(offset + 4, true);
    const paddedDataSize = chunkDataSize + (chunkDataSize & 1);
    const chunkEnd = offset + 8 + paddedDataSize;
    const safeEnd = Math.min(chunkEnd, buffer.byteLength);

    if (cc === CC_LIST) {
      // Only remove LIST/INFO; keep LIST/hdrl, LIST/movi, etc.
      if (offset + 12 <= buffer.byteLength) {
        const listType = view.getUint32(offset + 8, true);
        if (listType === CC_INFO) {
          offset = safeEnd;
          continue;
        }
      }
      ranges.push([offset, safeEnd]);
    } else if (REMOVE_CHUNKS.has(cc)) {
      offset = safeEnd;
      continue;
    } else {
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

  // Update RIFF size field: bytes 4-7 (LE) = total file size − 8
  new DataView(out.buffer).setUint32(4, totalSize - 8, true);

  return out.buffer;
}
