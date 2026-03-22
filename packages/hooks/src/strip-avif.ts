/**
 * AVIF binary metadata stripper (Node.js port).
 *
 * AVIF uses the ISOBMFF container — same as MP4/MOV.
 * Reuses the MP4 stripper logic with AVIF-specific detection.
 */

import { stripMp4 } from './strip-mp4';

export interface StripAvifResult {
  output: Buffer;
  categories: string[];
}

export function isAvif(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  const type = String.fromCharCode(buf[4]!, buf[5]!, buf[6]!, buf[7]!);
  if (type !== 'ftyp') return false;
  const brand = String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!);
  return brand === 'avif' || brand === 'avis';
}

export function stripAvif(input: Buffer): StripAvifResult {
  if (!isAvif(input)) {
    throw new Error('Input is not a valid AVIF: missing AVIF ftyp brand');
  }
  return stripMp4(input);
}
