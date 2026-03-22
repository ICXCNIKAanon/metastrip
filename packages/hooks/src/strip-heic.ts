/**
 * HEIC/HEIF binary metadata stripper (Node.js port).
 *
 * HEIC/HEIF uses the ISOBMFF container — same as MP4/MOV.
 * Reuses the MP4 stripper logic with HEIC-specific detection.
 */

import { stripMp4 } from './strip-mp4';

export interface StripHeicResult {
  output: Buffer;
  categories: string[];
}

export function isHeic(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const type = String.fromCharCode(buf[4]!, buf[5]!, buf[6]!, buf[7]!);
  if (type !== 'ftyp') return false;
  const brand = String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!);
  return brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'hevc' || brand === 'hevx';
}

export function stripHeic(input: Buffer): StripHeicResult {
  if (!isHeic(input)) {
    throw new Error('Input is not a valid HEIC: missing HEIC ftyp brand');
  }
  return stripMp4(input);
}
