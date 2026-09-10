// Retain only the display orientation, never the original EXIF payload.
export function jpegOrientationSegment(bytes: Uint8Array, start: number, end: number): Uint8Array<ArrayBuffer> | null {
  if (end - start < 20 || String.fromCharCode(...bytes.subarray(start, start + 6)) !== 'Exif\0\0') return null;
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  if (!little && !(bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(tiff + 2, little) !== 42) return null;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd < tiff + 8 || ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) !== 0x0112 || view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) continue;
    const orientation = view.getUint16(entry + 8, little);
    if (orientation < 2 || orientation > 8) return null;
    // APP1 + Exif identifier + little-endian TIFF with a single SHORT field.
    const output = new Uint8Array([0xff,0xe1,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0]);
    return output;
  }
  return null;
}
