/**
 * MP4/MOV binary metadata stripper (Node.js port).
 *
 * Removes udta, meta, and uuid boxes from ISOBMFF containers.
 * Video and audio data boxes (mdat, trak, etc.) are NEVER modified.
 */

const BOXES_TO_REMOVE = new Set(['udta', 'meta', 'uuid']);

export interface StripMp4Result {
  output: Buffer;
  categories: string[];
}

export function isMp4(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const type = String.fromCharCode(buf[4]!, buf[5]!, buf[6]!, buf[7]!);
  if (type === 'ftyp') return true;
  if (type === 'moov' || type === 'mdat' || type === 'wide' || type === 'free') return true;
  return false;
}

export function stripMp4(input: Buffer): StripMp4Result {
  if (!isMp4(input)) {
    throw new Error('Input is not a valid MP4/MOV: missing ftyp or moov box');
  }

  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  const bytes = new Uint8Array(ab);
  const view = new DataView(ab);

  const categories: string[] = [];
  const categorySeen = new Set<string>();

  function addCategory(cat: string) {
    if (!categorySeen.has(cat)) {
      categorySeen.add(cat);
      categories.push(cat);
    }
  }

  const result = processBoxes(bytes, view, 0, ab.byteLength, false, addCategory);
  return { output: Buffer.from(result.buffer, result.byteOffset, result.byteLength), categories };
}

function processBoxes(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  insideMoov: boolean,
  addCategory: (cat: string) => void,
): Uint8Array {
  const kept: Uint8Array[] = [];
  let offset = start;

  while (offset < end) {
    if (offset + 8 > end) break;

    let boxSize = view.getUint32(offset);
    const boxType = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );

    let headerSize = 8;

    if (boxSize === 1 && offset + 16 <= end) {
      const hi = view.getUint32(offset + 8);
      const lo = view.getUint32(offset + 12);
      boxSize = hi * 0x100000000 + lo;
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = end - offset;
    }

    if (boxSize < headerSize || offset + boxSize > end) break;

    const shouldRemove = insideMoov && BOXES_TO_REMOVE.has(boxType);
    const isTopLevelMeta = !insideMoov && (boxType === 'meta' || boxType === 'uuid');

    if (shouldRemove || isTopLevelMeta) {
      addCategory('metadata');
      offset += boxSize;
      continue;
    }

    if (boxType === 'moov') {
      const moovHeader = bytes.slice(offset, offset + headerSize);
      const innerBoxes = processBoxes(bytes, view, offset + headerSize, offset + boxSize, true, addCategory);

      const newMoovSize = headerSize + innerBoxes.length;
      const newMoov = new Uint8Array(newMoovSize);
      newMoov.set(moovHeader);
      new DataView(newMoov.buffer).setUint32(0, newMoovSize);
      newMoov.set(innerBoxes, headerSize);
      kept.push(newMoov);
    } else {
      kept.push(bytes.slice(offset, offset + boxSize));
    }

    offset += boxSize;
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
