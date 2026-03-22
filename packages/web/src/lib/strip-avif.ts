import { stripMp4 } from './strip-mp4';

export function stripAvif(buffer: ArrayBuffer): ArrayBuffer {
  return stripMp4(buffer);
}

export function isAvif(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer);
  const type = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
  if (type !== 'ftyp') return false;
  const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  return brand === 'avif' || brand === 'avis';
}
