/**
 * FLAC binary metadata stripper (Node.js port).
 *
 * Removes Vorbis comment fields (type 4) and picture blocks (type 6) from
 * a FLAC file. STREAMINFO and all other block types are preserved.
 * Audio frames are NEVER touched.
 */

const FLAC_MAGIC = Object.freeze([0x66, 0x4c, 0x61, 0x43]);

const BLOCK_TYPE_VORBIS_COMMENT = 4;
const BLOCK_TYPE_PICTURE = 6;

export interface StripFlacResult {
  output: Buffer;
  categories: string[];
}

export function isFlac(buf: Buffer): boolean {
  if (buf.byteLength < 4) return false;
  return (
    buf[0] === FLAC_MAGIC[0] &&
    buf[1] === FLAC_MAGIC[1] &&
    buf[2] === FLAC_MAGIC[2] &&
    buf[3] === FLAC_MAGIC[3]
  );
}

function buildEmptyVorbisComment(isLast: boolean): Uint8Array {
  const block = new Uint8Array(12);
  block[0] = (isLast ? 0x80 : 0x00) | BLOCK_TYPE_VORBIS_COMMENT;
  block[1] = 0x00;
  block[2] = 0x00;
  block[3] = 0x08;
  return block;
}

export function stripFlac(input: Buffer): StripFlacResult {
  if (!isFlac(input)) {
    throw new Error('Input is not a valid FLAC: missing fLaC magic');
  }

  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  const src = new Uint8Array(ab);

  const categories: string[] = [];
  const categorySeen = new Set<string>();

  function addCategory(cat: string) {
    if (!categorySeen.has(cat)) {
      categorySeen.add(cat);
      categories.push(cat);
    }
  }

  const parts: Uint8Array[] = [src.slice(0, 4)];

  let offset = 4;
  let reachedLastBlock = false;

  while (offset < ab.byteLength && !reachedLastBlock) {
    if (offset + 4 > ab.byteLength) break;

    const headerByte = src[offset]!;
    const isLast = (headerByte & 0x80) !== 0;
    const blockType = headerByte & 0x7f;
    const blockLen =
      (src[offset + 1]! << 16) |
      (src[offset + 2]! << 8) |
       src[offset + 3]!;

    const blockStart = offset;
    const blockEnd = offset + 4 + blockLen;

    if (blockEnd > ab.byteLength) {
      parts.push(src.slice(blockStart, ab.byteLength));
      reachedLastBlock = true;
      offset = ab.byteLength;
      break;
    }

    if (blockType === BLOCK_TYPE_VORBIS_COMMENT) {
      parts.push(buildEmptyVorbisComment(false));
      addCategory('ID3 tags');
    } else if (blockType === BLOCK_TYPE_PICTURE) {
      addCategory('thumbnails');
    } else {
      const block = src.slice(blockStart, blockEnd);
      block[0] = block[0]! & 0x7f;
      parts.push(block);
    }

    reachedLastBlock = isLast;
    offset = blockEnd;
  }

  if (parts.length > 1) {
    const lastMeta = parts[parts.length - 1]!;
    lastMeta[0] = (lastMeta[0]! & 0x7f) | 0x80;
  }

  if (offset < ab.byteLength) {
    parts.push(src.slice(offset));
  }

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const part of parts) {
    result.set(part, writeOffset);
    writeOffset += part.length;
  }

  return { output: Buffer.from(result.buffer, result.byteOffset, result.byteLength), categories };
}
