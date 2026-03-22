import { isJpeg, stripJpeg } from './strip-jpeg';
import { isPng, stripPng } from './strip-png';
import { isWebp, stripWebp } from './strip-webp';
import { isGif, stripGif } from './strip-gif';
import { isSvg, stripSvg } from './strip-svg';
import { isZip, stripOffice } from './strip-office';
import { isPdf, stripPdf } from './strip-pdf';
import { isMp3, stripMp3 } from './strip-mp3';
import { isWav, stripWav } from './strip-wav';
import { isFlac, stripFlac } from './strip-flac';
import { isMp4, stripMp4 } from './strip-mp4';
import { isHeic, stripHeic } from './strip-heic';
import { isAvif, stripAvif } from './strip-avif';

export type SupportedFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'svg' | 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'mp3' | 'wav' | 'flac' | 'mp4' | 'mov' | 'heic' | 'avif';

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
  if (isMp3(buffer)) return 'mp3';
  if (isWav(buffer)) return 'wav';
  if (isFlac(buffer)) return 'flac';
  // Check HEIC/AVIF before MP4 — all use ftyp boxes, HEIC/AVIF brands must be matched first
  if (isHeic(buffer)) return 'heic';
  if (isAvif(buffer)) return 'avif';
  if (isMp4(buffer)) {
    // Both MP4 and MOV use the same ISOBMFF container; use filename to distinguish
    const lower = (fileName ?? '').toLowerCase();
    if (lower.endsWith('.mov')) return 'mov';
    return 'mp4';
  }
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
    throw new Error('Unsupported format. Use the CLI for TIFF and other rare formats: npm i -g @metastrip/cli');
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
    case 'mp3': stripped = stripMp3(buffer); break;
    case 'wav': stripped = stripWav(buffer); break;
    case 'flac': stripped = stripFlac(buffer); break;
    case 'mp4':
    case 'mov': stripped = stripMp4(buffer); break;
    case 'heic': stripped = stripHeic(buffer); break;
    case 'avif': stripped = stripAvif(buffer); break;
    case 'docx':
    case 'xlsx':
    case 'pptx':
      stripped = await stripOffice(buffer); break;
  }
  return { buffer: stripped, format, originalSize, strippedSize: stripped.byteLength };
}
