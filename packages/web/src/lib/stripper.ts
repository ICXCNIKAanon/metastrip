import { isJpeg, stripJpeg } from './strip-jpeg';
import { isPng, stripPng } from './strip-png';
import { isWebp, stripWebp } from './strip-webp';
import { isGif, stripGif } from './strip-gif';
import { isSvg, stripSvg } from './strip-svg';

export type SupportedFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'svg';

export interface StripResult {
  buffer: ArrayBuffer;
  format: SupportedFormat;
  originalSize: number;
  strippedSize: number;
}

export function detectFormat(buffer: ArrayBuffer): SupportedFormat | null {
  if (isJpeg(buffer)) return 'jpeg';
  if (isPng(buffer)) return 'png';
  if (isWebp(buffer)) return 'webp';
  if (isGif(buffer)) return 'gif';
  if (isSvg(buffer)) return 'svg';
  return null;
}

export function stripMetadata(buffer: ArrayBuffer): StripResult {
  const format = detectFormat(buffer);
  if (!format) {
    throw new Error('Unsupported format. Use the CLI for HEIC, TIFF, and AVIF: npm i -g @metastrip/cli');
  }
  const originalSize = buffer.byteLength;
  let stripped: ArrayBuffer;
  switch (format) {
    case 'jpeg': stripped = stripJpeg(buffer); break;
    case 'png': stripped = stripPng(buffer); break;
    case 'webp': stripped = stripWebp(buffer); break;
    case 'gif': stripped = stripGif(buffer); break;
    case 'svg': stripped = stripSvg(buffer); break;
  }
  return { buffer: stripped, format, originalSize, strippedSize: stripped.byteLength };
}
