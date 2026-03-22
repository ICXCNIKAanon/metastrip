/**
 * M4A/M4B binary metadata stripper (Node.js port).
 *
 * M4A (Apple AAC audio) uses the ISOBMFF container — same as MP4.
 * Reuses the MP4 stripper logic with M4A-specific detection.
 *
 * ftyp brands:
 *   'M4A ' — iTunes AAC audio
 *   'M4B ' — iTunes AAC audiobook
 */

import { stripMp4 } from './strip-mp4';

export interface StripM4aResult {
  output: Buffer;
  categories: string[];
}

export function isM4a(buf: Buffer): boolean {
  if (buf.byteLength < 12) return false;
  if (String.fromCharCode(buf[4]!, buf[5]!, buf[6]!, buf[7]!) !== 'ftyp') return false;
  const brand = String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!);
  return brand === 'M4A ' || brand === 'M4B ';
}

export function stripM4a(input: Buffer): StripM4aResult {
  if (!isM4a(input)) {
    throw new Error('Input is not a valid M4A: missing M4A/M4B ftyp brand');
  }
  return stripMp4(input);
}
