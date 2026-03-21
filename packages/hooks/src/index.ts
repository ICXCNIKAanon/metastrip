import * as fs from 'fs';
import { detectFormat } from './detect';
import { validateOutput } from './safety';
import { stripJpeg } from './strip-jpeg';
import { stripPng } from './strip-png';
import { stripWebp } from './strip-webp';
import { restageFile } from './git';
import * as path from 'path';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

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
    const format = detectFormat(input);

    if (format === null) {
      return { ...base, skipped: true, error: 'unsupported format' };
    }

    let output: Buffer;
    let categories: string[];

    if (format === 'jpeg') {
      const result = stripJpeg(input);
      output = result.output;
      categories = result.categories;
    } else if (format === 'png') {
      const result = stripPng(input);
      output = result.output;
      categories = result.categories;
    } else {
      const result = stripWebp(input);
      output = result.output;
      categories = result.categories;
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
