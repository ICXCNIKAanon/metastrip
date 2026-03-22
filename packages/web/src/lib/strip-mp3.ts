/**
 * MP3 binary metadata stripper.
 *
 * Removes ID3v1 and ID3v2 tags from an MP3 file by operating
 * directly on the binary data. Audio frames (MPEG data) are NEVER modified.
 *
 * ID3v2 — at the START of the file:
 *   "ID3" (3 bytes) + version (2 bytes) + flags (1 byte) + size (4 bytes, syncsafe)
 *   Flags byte bit 4 = footer present (adds 10 extra bytes)
 *   Total to skip: 10 (header) + syncsafe size + optional 10 (footer)
 *
 * ID3v1 Extended — 227 bytes before ID3v1, starts with "TAG+"
 *
 * ID3v1 — last 128 bytes, starts with "TAG"
 *
 * MPEG audio frames start with sync word 0xFF followed by 0xE0-0xFF.
 */

/**
 * Returns true if the buffer is an MP3 file (has ID3 tag or MPEG frame sync).
 */
export function isMp3(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 3) return false;
  const bytes = new Uint8Array(buffer);
  // Starts with ID3 tag
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  // Starts with MPEG frame sync (0xFF followed by 0xE0–0xFF)
  if (bytes[0] === 0xFF && (bytes[1]! & 0xE0) === 0xE0) return true;
  return false;
}

/**
 * Strips ID3v1 and ID3v2 metadata from an MP3 binary buffer.
 *
 * Removed:
 *   ID3v2 block at start of file
 *   ID3v1 tag (last 128 bytes starting with "TAG")
 *   ID3v1 Extended tag (227 bytes before ID3v1 starting with "TAG+")
 *
 * Preserved:
 *   All MPEG audio frame data between the tags
 */
export function stripMp3(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  let start = 0;
  let end = bytes.length;

  // Remove ID3v2 from start
  if (
    bytes[0] === 0x49 && // 'I'
    bytes[1] === 0x44 && // 'D'
    bytes[2] === 0x33    // '3'
  ) {
    // Bytes 6–9 encode the tag size as a syncsafe integer (7 bits per byte, MSB first)
    const size =
      ((bytes[6]! & 0x7F) << 21) |
      ((bytes[7]! & 0x7F) << 14) |
      ((bytes[8]! & 0x7F) << 7)  |
       (bytes[9]! & 0x7F);
    start = 10 + size; // 10-byte header + tag data
    // Flags byte (offset 5), bit 4: footer present (adds another 10 bytes)
    if (bytes[5]! & 0x10) start += 10;
  }

  // Remove ID3v1 from end (last 128 bytes starting with "TAG")
  if (end - start >= 128) {
    const tagOffset = end - 128;
    if (
      bytes[tagOffset]!     === 0x54 && // 'T'
      bytes[tagOffset + 1]! === 0x41 && // 'A'
      bytes[tagOffset + 2]! === 0x47    // 'G'
    ) {
      end = tagOffset;
    }
  }

  // Remove ID3v1 Extended (227 bytes before ID3v1 starting with "TAG+")
  if (end - start >= 227) {
    const extOffset = end - 227;
    if (
      bytes[extOffset]!     === 0x54 && // 'T'
      bytes[extOffset + 1]! === 0x41 && // 'A'
      bytes[extOffset + 2]! === 0x47 && // 'G'
      bytes[extOffset + 3]! === 0x2B    // '+'
    ) {
      end = extOffset;
    }
  }

  return bytes.slice(start, end).buffer;
}
