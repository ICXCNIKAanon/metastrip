/**
 * MetaStrip GitHub Action — Image metadata stripper
 *
 * Finds all image files (JPEG, PNG, WebP) in the given directory
 * and strips metadata using @metastrip/hooks (zero quality loss,
 * binary-level stripping — no re-encoding).
 *
 * Usage: node strip.mjs [path]
 *
 * Sets GitHub Actions outputs:
 *   stripped — number of files that had metadata removed
 *   clean   — number of files already clean
 *   total   — total number of image files scanned
 */

import { readdir } from 'fs/promises';
import { join, extname } from 'path';
import { appendFileSync } from 'fs';

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', '.cache']);

const scanPath = process.argv[2] || '.';

async function findImages(dir) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) {
      results.push(...(await findImages(full)));
    } else if (SUPPORTED.has(extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

async function main() {
  // Dynamic import — @metastrip/hooks is installed by the action step
  const { stripFile } = await import('@metastrip/hooks');

  const files = await findImages(scanPath);

  if (files.length === 0) {
    console.log('MetaStrip: No image files found');
    setOutput('stripped', '0');
    setOutput('clean', '0');
    setOutput('total', '0');
    return;
  }

  console.log(`MetaStrip: Found ${files.length} image file(s)\n`);

  let stripped = 0;
  let clean = 0;
  let skipped = 0;

  for (const file of files) {
    const result = await stripFile(file);

    if (result.skipped || !result.success) {
      skipped++;
      if (result.error) {
        console.log(`  skip  ${file} (${result.error})`);
      }
    } else if (result.metadataRemoved) {
      stripped++;
      const cats = result.categories.length > 0
        ? ` [${result.categories.join(', ')}]`
        : '';
      const saved = result.savedBytes > 0
        ? ` (-${result.savedBytes} bytes)`
        : '';
      console.log(`  strip ${file}${cats}${saved}`);
    } else {
      clean++;
    }
  }

  console.log('');
  console.log(`MetaStrip: ${stripped} file(s) cleaned, ${clean} already clean, ${skipped} skipped (${files.length} total)`);

  setOutput('stripped', String(stripped));
  setOutput('clean', String(clean));
  setOutput('total', String(files.length));
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}\n`);
  }
}

main().catch((err) => {
  console.error('MetaStrip Action failed:', err.message || err);
  process.exit(1);
});
