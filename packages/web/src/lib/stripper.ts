import { isJpeg, stripJpeg } from './strip-jpeg';
import { isPng, stripPng } from './strip-png';
import { isWebp, stripWebp } from './strip-webp';
import { isGif, stripGif } from './strip-gif';
import { isSvg, stripSvg } from './strip-svg';
import { isZip, stripOffice } from './strip-office';
import { isPdf, stripPdf } from './strip-pdf';

export type SupportedFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'svg' | 'docx' | 'xlsx' | 'pptx' | 'pdf';

export interface StripResult {
  buffer: ArrayBuffer;
  format: SupportedFormat;
  originalSize: number;
  strippedSize: number;
}

export function detectFormat(buffer: ArrayBuffer, fileName?: string): SupportedFormat | null {
  if (isJpeg(buffer)) return 'jpeg';
  if (isPng(buffer)) return 'png';
  if (isWebp(buffer)) return 'webp';
  if (isGif(buffer)) return 'gif';
  if (isSvg(buffer)) return 'svg';
  if (isPdf(buffer)) return 'pdf';
  if (isZip(buffer) && fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.docx')) return 'docx';
    if (lower.endsWith('.xlsx')) return 'xlsx';
    if (lower.endsWith('.pptx')) return 'pptx';
  }
  return null;
}

export async function stripMetadata(buffer: ArrayBuffer, fileName?: string): Promise<StripResult> {
  const format = detectFormat(buffer, fileName);
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
    case 'pdf': stripped = stripPdf(buffer); break;
    case 'docx':
    case 'xlsx':
    case 'pptx':
      stripped = await stripOffice(buffer); break;
  }
  return { buffer: stripped, format, originalSize, strippedSize: stripped.byteLength };
}
