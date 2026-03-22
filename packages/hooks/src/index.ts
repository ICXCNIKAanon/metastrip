import * as fs from 'fs';
import * as path from 'path';
import { detectFormat, type FormatType } from './detect';
import { validateOutput } from './safety';
import { stripJpeg } from './strip-jpeg';
import { stripPng } from './strip-png';
import { stripWebp } from './strip-webp';
import { stripGif } from './strip-gif';
import { stripSvg } from './strip-svg';
import { stripPdf } from './strip-pdf';
import { stripOffice } from './strip-office';
import { stripMp3 } from './strip-mp3';
import { stripWav } from './strip-wav';
import { stripFlac } from './strip-flac';
import { stripMp4 } from './strip-mp4';
import { stripHeic } from './strip-heic';
import { stripAvif } from './strip-avif';
import { stripM4a } from './strip-m4a';
import { stripAvi } from './strip-avi';
import { stripMkv } from './strip-mkv';
import { stripEpub } from './strip-epub';
import { restageFile } from './git';

export { detectFormat } from './detect';
export { stripJpeg } from './strip-jpeg';
export { stripPng } from './strip-png';
export { stripWebp } from './strip-webp';
export { stripGif } from './strip-gif';
export { stripSvg } from './strip-svg';
export { stripPdf } from './strip-pdf';
export { stripOffice } from './strip-office';
export { stripMp3 } from './strip-mp3';
export { stripWav } from './strip-wav';
export { stripFlac } from './strip-flac';
export { stripMp4 } from './strip-mp4';
export { stripHeic } from './strip-heic';
export { stripAvif } from './strip-avif';
export { stripM4a } from './strip-m4a';
export { stripAvi } from './strip-avi';
export { stripMkv } from './strip-mkv';
export { stripEpub } from './strip-epub';

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp',
  '.gif', '.svg', '.pdf',
  '.docx', '.xlsx', '.pptx',
  '.mp3', '.wav', '.flac',
  '.mp4', '.mov', '.heic', '.avif', '.m4a', '.avi', '.mkv',
  '.epub',
]);

export interface StripFileResult {
  filePath: string;
  success: boolean;
  skipped: boolean;
  metadataRemoved: boolean;
  categories: string[];
  savedBytes: number;
  error?: string;
}

export interface BatchResult {
  results: StripFileResult[];
  stripped: number;
  clean: number;
  skipped: number;
}

export function isSupported(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export async function stripFile(filePath: string): Promise<StripFileResult> {
  const base: StripFileResult = {
    filePath,
    success: false,
    skipped: false,
    metadataRemoved: false,
    categories: [],
    savedBytes: 0,
  };

  try {
    const resolved = path.resolve(filePath);
    const root = process.cwd();
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      return { ...base, skipped: true, error: 'path outside repository root' };
    }
    const input = fs.readFileSync(resolved);
    const fileName = path.basename(resolved);
    const format = detectFormat(input, fileName);

    if (format === null) {
      return { ...base, skipped: true, error: 'unsupported format' };
    }

    let output: Buffer;
    let categories: string[];

    switch (format) {
      case 'jpeg': { const r = stripJpeg(input); output = r.output; categories = r.categories; break; }
      case 'png':  { const r = stripPng(input);  output = r.output; categories = r.categories; break; }
      case 'webp': { const r = stripWebp(input); output = r.output; categories = r.categories; break; }
      case 'gif':  { const r = stripGif(input);  output = r.output; categories = r.categories; break; }
      case 'svg':  { const r = stripSvg(input);  output = r.output; categories = r.categories; break; }
      case 'pdf':  { const r = stripPdf(input);  output = r.output; categories = r.categories; break; }
      case 'mp3':  { const r = stripMp3(input);  output = r.output; categories = r.categories; break; }
      case 'wav':  { const r = stripWav(input);  output = r.output; categories = r.categories; break; }
      case 'flac': { const r = stripFlac(input); output = r.output; categories = r.categories; break; }
      case 'mp4':
      case 'mov':  { const r = stripMp4(input);  output = r.output; categories = r.categories; break; }
      case 'heic': { const r = stripHeic(input); output = r.output; categories = r.categories; break; }
      case 'avif': { const r = stripAvif(input); output = r.output; categories = r.categories; break; }
      case 'm4a':  { const r = stripM4a(input);  output = r.output; categories = r.categories; break; }
      case 'avi':  { const r = stripAvi(input);  output = r.output; categories = r.categories; break; }
      case 'mkv':  { const r = stripMkv(input);  output = r.output; categories = r.categories; break; }
      case 'epub': { const r = await stripEpub(input);   output = r.output; categories = r.categories; break; }
      case 'docx':
      case 'xlsx':
      case 'pptx': { const r = await stripOffice(input); output = r.output; categories = r.categories; break; }
      default:
        return { ...base, skipped: true, error: 'unsupported format' };
    }

    const valid = validateOutput(output, format);
    if (!valid) {
      return { ...base, skipped: true, error: 'output validation failed' };
    }

    const metadataRemoved = !input.equals(output);

    if (metadataRemoved) {
      const savedBytes = input.byteLength - output.byteLength;
      fs.writeFileSync(resolved, output);
      return {
        filePath,
        success: true,
        skipped: false,
        metadataRemoved: true,
        categories,
        savedBytes,
      };
    }

    return {
      filePath,
      success: true,
      skipped: false,
      metadataRemoved: false,
      categories: [],
      savedBytes: 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, skipped: true, error: message };
  }
}

export async function stripStagedImages(filePaths: string[]): Promise<BatchResult> {
  const results: StripFileResult[] = [];
  let stripped = 0;
  let clean = 0;
  let skipped = 0;

  for (const filePath of filePaths) {
    const result = await stripFile(filePath);
    results.push(result);

    if (!result.success || result.skipped) {
      skipped++;
    } else if (result.metadataRemoved) {
      stripped++;
      restageFile(filePath);
    } else {
      clean++;
    }
  }

  return { results, stripped, clean, skipped };
}
