/**
 * PNG fake metadata injection via tEXt chunks.
 *
 * Injects tEXt chunks containing decoy GPS coordinates, device info, and
 * timestamps into a clean PNG file. Chunks are inserted before the IEND chunk.
 *
 * tEXt chunk format:
 *   [4-byte length] [4-byte type "tEXt"] [keyword \0 value] [4-byte CRC]
 *
 * This is a privacy tool: the fake data uses obviously retro devices and
 * famous landmarks so it's clearly decoy data, not deception.
 */

import type { FakeMetadata } from './fake-metadata';

// ---------------------------------------------------------------------------
// CRC-32 table for PNG chunk CRC calculation
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Injects fake tEXt metadata chunks into a clean PNG buffer.
 *
 * @param buffer  A stripped PNG (must start with the PNG 8-byte signature)
 * @param fake    The fake metadata values to inject
 * @returns       A new ArrayBuffer with the fake metadata inserted before IEND
 */
export function injectFakeMetadataPng(
  buffer: ArrayBuffer,
  fake: FakeMetadata,
): ArrayBuffer {
  const src = new Uint8Array(buffer);

  // Validate PNG signature
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (src.length < 8 || !PNG_SIG.every((b, i) => src[i] === b)) {
    throw new Error('Not a valid PNG: missing signature');
  }

  // Find the IEND chunk offset
  const iendOffset = findIendOffset(src);
  if (iendOffset === -1) {
    throw new Error('Not a valid PNG: missing IEND chunk');
  }

  // Build tEXt chunks
  const chunks: Uint8Array[] = [];
  chunks.push(buildTextChunk('Comment', `Shot on ${fake.device.make} ${fake.device.model}`));
  chunks.push(buildTextChunk('GPS', `${fake.gps.lat.toFixed(6)}, ${fake.gps.lon.toFixed(6)}`));
  chunks.push(buildTextChunk('Location', fake.gps.name));
  chunks.push(buildTextChunk('Creation Time', fake.dateTime));

  // Calculate total size of injected chunks
  const injectedSize = chunks.reduce((sum, c) => sum + c.length, 0);

  // Assemble: everything before IEND + injected chunks + IEND chunk
  const beforeIend = src.subarray(0, iendOffset);
  const iendChunk = src.subarray(iendOffset); // IEND to end of file

  const out = new Uint8Array(beforeIend.length + injectedSize + iendChunk.length);
  let offset = 0;

  out.set(beforeIend, offset);
  offset += beforeIend.length;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  out.set(iendChunk, offset);

  return out.buffer;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Finds the byte offset of the IEND chunk in a PNG file.
 * Returns -1 if not found.
 */
function findIendOffset(src: Uint8Array): number {
  let offset = 8; // skip signature

  while (offset + 12 <= src.length) {
    const dataLength =
      ((src[offset] << 24) |
        (src[offset + 1] << 16) |
        (src[offset + 2] << 8) |
        src[offset + 3]) >>> 0;

    // Check if this is the IEND chunk (type bytes at offset+4..offset+7)
    if (
      src[offset + 4] === 0x49 && // I
      src[offset + 5] === 0x45 && // E
      src[offset + 6] === 0x4e && // N
      src[offset + 7] === 0x44    // D
    ) {
      return offset;
    }

    // Move to next chunk: 4 (length) + 4 (type) + dataLength + 4 (CRC)
    offset += 12 + dataLength;
  }

  return -1;
}

/**
 * Builds a PNG tEXt chunk with the given keyword and text value.
 *
 * Layout: [4-byte length][4-byte "tEXt"][keyword\0value][4-byte CRC]
 * CRC covers type + data.
 */
function buildTextChunk(keyword: string, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(keyword);
  const valBytes = encoder.encode(value);

  // data = keyword + null separator + value
  const dataLength = keyBytes.length + 1 + valBytes.length;
  const chunkSize = 12 + dataLength; // 4 length + 4 type + data + 4 CRC

  const chunk = new Uint8Array(chunkSize);
  const view = new DataView(chunk.buffer);
  let offset = 0;

  // 4-byte data length (big-endian)
  view.setUint32(offset, dataLength, false);
  offset += 4;

  // 4-byte type: "tEXt"
  chunk[offset++] = 0x74; // t
  chunk[offset++] = 0x45; // E
  chunk[offset++] = 0x58; // X
  chunk[offset++] = 0x74; // t

  // keyword
  chunk.set(keyBytes, offset);
  offset += keyBytes.length;

  // null separator
  chunk[offset++] = 0x00;

  // value
  chunk.set(valBytes, offset);
  offset += valBytes.length;

  // 4-byte CRC: computed over type + data (bytes 4 to 4+4+dataLength)
  const crcData = chunk.subarray(4, 8 + dataLength);
  const crcValue = crc32(crcData);
  view.setUint32(offset, crcValue, false);

  return chunk;
}
