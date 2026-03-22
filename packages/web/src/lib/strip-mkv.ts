/**
 * MKV/WebM binary metadata stripper.
 *
 * Matroska (MKV) and WebM use the EBML (Extensible Binary Meta Language)
 * container format. Metadata lives primarily in the Tags element inside the
 * Segment. This stripper walks the top-level elements of each Segment and
 * drops any Tags element (ID 0x1254C367).
 *
 * EBML element encoding:
 *   Each element: [ID: 1-4 byte VINT] [Size: 1-8 byte VINT] [Data]
 *   VINT encoding: the number of leading zero bits in the first byte
 *   determines the length; the width marker bit is cleared to get the value.
 *
 * Key element IDs:
 *   EBML header:  0x1A45DFA3
 *   Segment:      0x18538067
 *   Tags:         0x1254C367  ← removed
 *   Info:         0x1549A966  ← preserved (writing-app, muxing-app)
 *   Tracks:       0x1654AE6B  ← preserved
 *   Cluster:      0x1F43B675  ← preserved (audio/video frames)
 *   SeekHead:     0x114D9B74  ← preserved
 *   Cues:         0x1C53BB6B  ← preserved
 *   Attachments:  0x1941A469  ← preserved
 *   Chapters:     0x1043A770  ← preserved
 */

/** EBML element IDs as 32-bit values (for 4-byte IDs). */
const EBML_HEADER_ID = 0x1A45DFA3;
const SEGMENT_ID     = 0x18538067;
const TAGS_ID        = 0x1254C367;

/**
 * Reads a VINT (variable-length integer) from bytes at the given offset.
 * Returns { rawValue, value, length } or null if out of bounds.
 *
 * rawValue: the raw bytes including the width bit (used as element ID)
 * value: the numeric value with the width marker bit cleared (used as data size)
 * length: number of bytes consumed
 */
function readVint(
  bytes: Uint8Array,
  offset: number,
): { rawValue: number; value: number; length: number } | null {
  if (offset >= bytes.length) return null;

  const first = bytes[offset]!;
  let len = 0;
  for (let i = 0; i < 8; i++) {
    if (first & (0x80 >> i)) {
      len = i + 1;
      break;
    }
  }
  if (len === 0 || offset + len > bytes.length) return null;

  // rawValue keeps the marker bit (used for IDs)
  let rawValue = first;
  // value clears the marker bit (used for sizes)
  let value = first & (0xff >> len);

  for (let i = 1; i < len; i++) {
    rawValue = (rawValue * 256 + bytes[offset + i]!) >>> 0;
    value = (value * 256 + bytes[offset + i]!) >>> 0;
  }

  return { rawValue, value, length: len };
}

/**
 * Returns true if the buffer starts with the EBML magic (0x1A 0x45 0xDF 0xA3).
 * This covers both MKV and WebM.
 */
export function isMkv(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer);
  return (
    bytes[0] === 0x1A &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xDF &&
    bytes[3] === 0xA3
  );
}

/**
 * Strips Tags elements from an MKV/WebM buffer.
 *
 * Walks top-level EBML elements. Inside each Segment, rebuilds the element
 * list without any Tags elements. The Segment size field is updated to
 * reflect the new content length.
 *
 * @throws {Error} if the buffer does not start with the EBML magic.
 */
export function stripMkv(buffer: ArrayBuffer): ArrayBuffer {
  if (!isMkv(buffer)) {
    throw new Error('Input is not a valid MKV/WebM file: missing EBML header');
  }

  const src = new Uint8Array(buffer);
  const kept: Uint8Array[] = [];
  let offset = 0;

  while (offset < src.length) {
    // Read element ID
    const idVint = readVint(src, offset);
    if (!idVint) break;
    const elementId = idVint.rawValue;
    offset += idVint.length;

    // Read element size
    const sizeVint = readVint(src, offset);
    if (!sizeVint) break;
    const dataSize = sizeVint.value;
    const sizeLen = sizeVint.length;
    offset += sizeLen;

    const dataEnd = offset + dataSize;
    if (dataEnd > src.length) break;

    if (elementId === SEGMENT_ID) {
      // Rewrite Segment: strip Tags elements from its children
      const strippedSegmentData = stripSegmentChildren(src, offset, dataEnd);

      // Build new Segment element with updated size
      const newSegmentData = strippedSegmentData;
      const newDataSize = newSegmentData.length;

      // Re-encode ID: use original idVint bytes
      const idBytes = src.slice(offset - idVint.length - sizeLen, offset - sizeLen);

      // Encode new size as VINT (same width as original if possible, otherwise expand)
      const newSizeBytes = encodeVintSize(newDataSize, sizeLen);

      const newElement = new Uint8Array(idBytes.length + newSizeBytes.length + newDataSize);
      newElement.set(idBytes, 0);
      newElement.set(newSizeBytes, idBytes.length);
      newElement.set(newSegmentData, idBytes.length + newSizeBytes.length);
      kept.push(newElement);
    } else {
      // Keep element as-is (EBML header, etc.)
      const elementStart = offset - idVint.length - sizeLen;
      kept.push(src.slice(elementStart, dataEnd));
    }

    offset = dataEnd;
  }

  // Concatenate
  const totalLen = kept.reduce((s, k) => s + k.length, 0);
  const result = new Uint8Array(totalLen);
  let writeOffset = 0;
  for (const chunk of kept) {
    result.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return result.buffer;
}

/**
 * Walks the children of a Segment at [start, end) and returns a new Uint8Array
 * with all Tags elements removed.
 */
function stripSegmentChildren(
  src: Uint8Array,
  start: number,
  end: number,
): Uint8Array {
  const kept: Uint8Array[] = [];
  let offset = start;

  while (offset < end) {
    const idVint = readVint(src, offset);
    if (!idVint) break;
    const elementId = idVint.rawValue;
    const idLen = idVint.length;
    offset += idLen;

    const sizeVint = readVint(src, offset);
    if (!sizeVint) break;
    const dataSize = sizeVint.value;
    const sizeLen = sizeVint.length;
    offset += sizeLen;

    const dataEnd = offset + dataSize;
    if (dataEnd > end) break;

    if (elementId !== TAGS_ID) {
      // Keep this element (entire byte range including ID and size)
      const elementStart = offset - idLen - sizeLen;
      kept.push(src.slice(elementStart, dataEnd));
    }
    // Tags element: skip (strip it)

    offset = dataEnd;
  }

  // Concatenate kept children
  const totalLen = kept.reduce((s, k) => s + k.length, 0);
  const result = new Uint8Array(totalLen);
  let writeOffset = 0;
  for (const chunk of kept) {
    result.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return result;
}

/**
 * Encodes a size value as an EBML VINT of the given byte width.
 * If the value doesn't fit in the requested width, uses the minimum width needed.
 */
function encodeVintSize(value: number, preferredWidth: number): Uint8Array {
  // Determine minimum required width
  let width = 1;
  while (width < 8) {
    // Maximum representable value for this width (subtract 1 for the all-ones reserved value)
    const maxVal = (1 << (7 * width)) - 2;
    if (value <= maxVal) break;
    width++;
  }

  // Use preferred width if it can fit the value
  const actualWidth = preferredWidth >= width ? preferredWidth : width;

  const out = new Uint8Array(actualWidth);
  // Set the marker bit
  out[0] = (0x80 >> (actualWidth - 1));

  // Encode value into bytes (big-endian), starting from the last byte
  let remaining = value;
  for (let i = actualWidth - 1; i >= 0; i--) {
    out[i]! |= (remaining & 0xFF);
    remaining >>>= 8;
  }

  return out;
}
