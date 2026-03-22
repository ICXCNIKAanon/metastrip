const BOXES_TO_REMOVE = new Set(['udta', 'meta', 'uuid']);

export function stripMp4(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (buffer.byteLength < 8) throw new Error('Not a valid MP4/MOV file');

  // Parse and rebuild, removing metadata boxes
  const result = processBoxes(bytes, view, 0, buffer.byteLength, false);
  return result.buffer as ArrayBuffer;
}

function processBoxes(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  insideMoov: boolean,
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

    // Handle extended size
    if (boxSize === 1 && offset + 16 <= end) {
      // 64-bit extended size
      const hi = view.getUint32(offset + 8);
      const lo = view.getUint32(offset + 12);
      boxSize = hi * 0x100000000 + lo;
      headerSize = 16;
    } else if (boxSize === 0) {
      // Box extends to end of file
      boxSize = end - offset;
    }

    if (boxSize < headerSize || offset + boxSize > end) break;

    const shouldRemove = insideMoov && BOXES_TO_REMOVE.has(boxType);
    const isTopLevelMeta = !insideMoov && (boxType === 'meta' || boxType === 'uuid');

    if (shouldRemove || isTopLevelMeta) {
      // Skip this box
      offset += boxSize;
      continue;
    }

    if (boxType === 'moov') {
      // Recurse into moov to find and remove udta/meta inside it
      const moovHeader = bytes.slice(offset, offset + headerSize);
      const innerBoxes = processBoxes(bytes, view, offset + headerSize, offset + boxSize, true);

      // Rebuild moov with new size
      const newMoovSize = headerSize + innerBoxes.length;
      const newMoov = new Uint8Array(newMoovSize);
      newMoov.set(moovHeader);
      // Update size
      new DataView(newMoov.buffer).setUint32(0, newMoovSize);
      newMoov.set(innerBoxes, headerSize);
      kept.push(newMoov);
    } else {
      // Keep this box as-is
      kept.push(bytes.slice(offset, offset + boxSize));
    }

    offset += boxSize;
  }

  // Concatenate
  const totalLen = kept.reduce((s, k) => s + k.length, 0);
  const result = new Uint8Array(totalLen);
  let writeOffset = 0;
  for (const chunk of kept) {
    result.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return result;
}

export function isMp4(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer);
  // Check for ftyp box near the start
  // ftyp can be at offset 4 (after size) or we check common patterns
  const type = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
  if (type === 'ftyp') return true;
  // Also check for 'moov' or 'mdat' as first box (some MOV files)
  if (type === 'moov' || type === 'mdat' || type === 'wide' || type === 'free') return true;
  return false;
}
