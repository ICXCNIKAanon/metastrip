/**
 * MP3 binary metadata stripper (Node.js port).
 *
 * Removes ID3v1, ID3v1 Extended, and ID3v2 tags from an MP3 file.
 * Audio frames (MPEG data) are NEVER modified.
 */

export interface StripMp3Result {
  output: Buffer;
  categories: string[];
}

export function isMp3(buf: Buffer): boolean {
  if (buf.byteLength < 3) return false;
  // Starts with ID3 tag
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  // Starts with MPEG frame sync (0xFF followed by 0xE0–0xFF)
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return true;
  return false;
}

export function stripMp3(input: Buffer): StripMp3Result {
  if (!isMp3(input)) {
    throw new Error('Input is not a valid MP3: missing ID3 tag or MPEG frame sync');
  }

  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  const bytes = new Uint8Array(ab);

  let start = 0;
  let end = bytes.length;

  const categories: string[] = [];
  const categorySeen = new Set<string>();

  function addCategory(cat: string) {
    if (!categorySeen.has(cat)) {
      categorySeen.add(cat);
      categories.push(cat);
    }
  }

  // Remove ID3v2 from start
  if (
    bytes[0] === 0x49 && // 'I'
    bytes[1] === 0x44 && // 'D'
    bytes[2] === 0x33    // '3'
  ) {
    const size =
      ((bytes[6]! & 0x7f) << 21) |
      ((bytes[7]! & 0x7f) << 14) |
      ((bytes[8]! & 0x7f) << 7) |
       (bytes[9]! & 0x7f);
    start = 10 + size;
    if (bytes[5]! & 0x10) start += 10;
    addCategory('ID3 tags');
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
      addCategory('ID3 tags');
    }
  }

  // Remove ID3v1 Extended (227 bytes before ID3v1 starting with "TAG+")
  if (end - start >= 227) {
    const extOffset = end - 227;
    if (
      bytes[extOffset]!     === 0x54 && // 'T'
      bytes[extOffset + 1]! === 0x41 && // 'A'
      bytes[extOffset + 2]! === 0x47 && // 'G'
      bytes[extOffset + 3]! === 0x2b    // '+'
    ) {
      end = extOffset;
      addCategory('ID3 tags');
    }
  }

  const sliced = bytes.slice(start, end);
  return { output: Buffer.from(sliced.buffer, sliced.byteOffset, sliced.byteLength), categories };
}
