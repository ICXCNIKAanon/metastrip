import { stripMp4 } from './strip-mp4';

/**
 * M4A/M4B metadata stripper.
 *
 * M4A (Apple AAC audio) uses the exact same ISOBMFF container as MP4.
 * The existing stripMp4 function handles it perfectly — this module only
 * adds format detection so M4A files are identified before generic MP4.
 *
 * ftyp brands used by M4A/M4B:
 *   'M4A ' — iTunes AAC audio
 *   'M4B ' — iTunes AAC audiobook
 */

export function stripM4a(buffer: ArrayBuffer): ArrayBuffer {
  return stripMp4(buffer);
}

export function isM4a(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer);
  // Check for ftyp box at offset 4-7
  if (
    String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!) !== 'ftyp'
  ) {
    return false;
  }
  const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  return brand === 'M4A ' || brand === 'M4B ';
}
