/**
 * MKV/WebM binary metadata stripper (Node.js port).
 *
 * Removes Tags elements (ID 0x1254C367) from inside Segment elements
 * in the EBML container. All other elements are preserved.
 */

const EBML_HEADER_ID = 0x1a45dfa3;
const SEGMENT_ID     = 0x18538067;
const TAGS_ID        = 0x1254c367;

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

  let rawValue = first;
  let value = first & (0xff >> len);

  for (let i = 1; i < len; i++) {
    rawValue = (rawValue * 256 + bytes[offset + i]!) >>> 0;
    value = (value * 256 + bytes[offset + i]!) >>> 0;
  }

  return { rawValue, value, length: len };
}

export interface StripMkvResult {
  output: Buffer;
  categories: string[];
}

export function isMkv(buf: Buffer): boolean {
  if (buf.byteLength < 4) return false;
  return (
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  );
}

export function stripMkv(input: Buffer): StripMkvResult {
  if (!isMkv(input)) {
    throw new Error('Input is not a valid MKV/WebM file: missing EBML header');
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

  const kept: Uint8Array[] = [];
  let offset = 0;

  while (offset < src.length) {
    const idVint = readVint(src, offset);
    if (!idVint) break;
    const elementId = idVint.rawValue;
    offset += idVint.length;

    const sizeVint = readVint(src, offset);
    if (!sizeVint) break;
    const dataSize = sizeVint.value;
    const sizeLen = sizeVint.length;
    offset += sizeLen;

    const dataEnd = offset + dataSize;
    if (dataEnd > src.length) break;

    if (elementId === SEGMENT_ID) {
      const strippedSegmentData = stripSegmentChildren(src, offset, dataEnd, addCategory);

      const newDataSize = strippedSegmentData.length;
      const idBytes = src.slice(offset - idVint.length - sizeLen, offset - sizeLen);
      const newSizeBytes = encodeVintSize(newDataSize, sizeLen);

      const newElement = new Uint8Array(idBytes.length + newSizeBytes.length + newDataSize);
      newElement.set(idBytes, 0);
      newElement.set(newSizeBytes, idBytes.length);
      newElement.set(strippedSegmentData, idBytes.length + newSizeBytes.length);
      kept.push(newElement);
    } else {
      const elementStart = offset - idVint.length - sizeLen;
      kept.push(src.slice(elementStart, dataEnd));
    }

    offset = dataEnd;
  }

  const totalLen = kept.reduce((s, k) => s + k.length, 0);
  const result = new Uint8Array(totalLen);
  let writeOffset = 0;
  for (const chunk of kept) {
    result.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  return { output: Buffer.from(result.buffer, result.byteOffset, result.byteLength), categories };
}

function stripSegmentChildren(
  src: Uint8Array,
  start: number,
  end: number,
  addCategory: (cat: string) => void,
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
      const elementStart = offset - idLen - sizeLen;
      kept.push(src.slice(elementStart, dataEnd));
    } else {
      addCategory('metadata');
    }

    offset = dataEnd;
  }

  const totalLen = kept.reduce((s, k) => s + k.length, 0);
  const result = new Uint8Array(totalLen);
  let writeOffset = 0;
  for (const chunk of kept) {
    result.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return result;
}

function encodeVintSize(value: number, preferredWidth: number): Uint8Array {
  let width = 1;
  while (width < 8) {
    const maxVal = (1 << (7 * width)) - 2;
    if (value <= maxVal) break;
    width++;
  }

  const actualWidth = preferredWidth >= width ? preferredWidth : width;

  const out = new Uint8Array(actualWidth);
  out[0] = (0x80 >> (actualWidth - 1));

  let remaining = value;
  for (let i = actualWidth - 1; i >= 0; i--) {
    out[i]! |= (remaining & 0xff);
    remaining >>>= 8;
  }

  return out;
}
