/**
 * GIF binary metadata stripper (Node.js port).
 *
 * Removes Comment Extension blocks (0x21 0xFE) and non-NETSCAPE Application
 * Extension blocks (0x21 0xFF) from a GIF file. Image data is NEVER decoded.
 */

const EXT_INTRODUCER = 0x21;
const EXT_COMMENT = 0xfe;
const EXT_APPLICATION = 0xff;

const IMAGE_DESCRIPTOR = 0x2c;
const TRAILER = 0x3b;

export interface StripGifResult {
  output: Buffer;
  categories: string[];
}

export function isGif(buf: Buffer): boolean {
  if (buf.byteLength < 6) return false;
  return (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  );
}

export function stripGif(input: Buffer): StripGifResult {
  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);

  if (!isGif(input)) {
    throw new Error('Input is not a valid GIF: missing GIF header (GIF87a or GIF89a)');
  }

  const src = new Uint8Array(ab);
  const len = src.byteLength;
  const chunks: Array<[number, number]> = [];

  let offset = 6;

  if (offset + 7 > len) {
    throw new Error('GIF too short: missing Logical Screen Descriptor');
  }

  const lsdPackedField = src[offset + 4]!;
  const hasGct = (lsdPackedField & 0x80) !== 0;
  const gctSize = hasGct ? 3 * (1 << ((lsdPackedField & 0x07) + 1)) : 0;

  const headerEnd = offset + 7 + gctSize;
  if (headerEnd > len) {
    throw new Error('GIF too short: Global Color Table extends beyond buffer');
  }
  chunks.push([0, headerEnd]);
  offset = headerEnd;

  const categories: string[] = [];
  const categorySeen = new Set<string>();

  function addCategory(cat: string) {
    if (!categorySeen.has(cat)) {
      categorySeen.add(cat);
      categories.push(cat);
    }
  }

  while (offset < len) {
    const blockStart = offset;
    const introducer = src[offset]!;
    offset++;

    if (introducer === TRAILER) {
      chunks.push([blockStart, offset]);
      break;
    }

    if (introducer === IMAGE_DESCRIPTOR) {
      if (offset + 9 > len) {
        throw new Error(`GIF: Image Descriptor at offset ${blockStart} extends beyond buffer`);
      }
      const idPackedField = src[offset + 8]!;
      const hasLct = (idPackedField & 0x80) !== 0;
      const lctSize = hasLct ? 3 * (1 << ((idPackedField & 0x07) + 1)) : 0;
      offset += 9;

      if (offset + lctSize > len) {
        throw new Error(`GIF: Local Color Table at offset ${offset} extends beyond buffer`);
      }
      offset += lctSize;

      if (offset >= len) {
        throw new Error(`GIF: Missing LZW minimum code size at offset ${offset}`);
      }
      offset++;

      offset = skipSubBlocks(src, offset, len);
      chunks.push([blockStart, offset]);
      continue;
    }

    if (introducer === EXT_INTRODUCER) {
      if (offset >= len) {
        throw new Error(`GIF: Extension introducer at offset ${blockStart} has no label byte`);
      }
      const label = src[offset]!;
      offset++;

      if (label === EXT_APPLICATION) {
        if (offset >= len) {
          throw new Error(`GIF: Application Extension at offset ${blockStart} truncated`);
        }
        const blockSize = src[offset]!;
        offset++;
        if (offset + blockSize > len) {
          throw new Error(`GIF: Application Extension fixed block at offset ${offset} extends beyond buffer`);
        }
        const appId = String.fromCharCode(...src.subarray(offset, offset + Math.min(8, blockSize)));
        offset += blockSize;

        offset = skipSubBlocks(src, offset, len);
        const blockEnd = offset;

        if (appId.startsWith('NETSCAPE')) {
          chunks.push([blockStart, blockEnd]);
        } else {
          addCategory('comments');
        }
        continue;
      }

      if (label === EXT_COMMENT) {
        offset = skipSubBlocks(src, offset, len);
        addCategory('comments');
        continue;
      }

      offset = skipSubBlocks(src, offset, len);
      chunks.push([blockStart, offset]);
      continue;
    }

    chunks.push([blockStart, offset]);
  }

  const totalSize = chunks.reduce((acc, [s, e]) => acc + (e - s), 0);
  const out = new Uint8Array(totalSize);
  let outOffset = 0;
  for (const [start, end] of chunks) {
    out.set(src.subarray(start, end), outOffset);
    outOffset += end - start;
  }

  return { output: Buffer.from(out.buffer, out.byteOffset, out.byteLength), categories };
}

function skipSubBlocks(src: Uint8Array, offset: number, len: number): number {
  while (offset < len) {
    const blockCount = src[offset]!;
    offset++;
    if (blockCount === 0) break;
    if (offset + blockCount > len) {
      throw new Error(
        `GIF: Sub-block at offset ${offset - 1} claims ${blockCount} bytes but only ${len - offset} remain`
      );
    }
    offset += blockCount;
  }
  return offset;
}
