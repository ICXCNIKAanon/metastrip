// HEIC/HEIF uses ISOBMFF container — same as MP4/MOV
// Reuse the MP4 stripper logic

import { stripMp4 } from './strip-mp4';

export function stripHeic(buffer: ArrayBuffer): ArrayBuffer {
  return stripMp4(buffer); // Same container format, same stripping logic
}

export function isHeic(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer);
  // Check for ftyp box
  const type = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
  if (type !== 'ftyp') return false;
  // Read the brand from the ftyp box data (bytes 8-11)
  const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  return brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'hevc' || brand === 'hevx';
}
