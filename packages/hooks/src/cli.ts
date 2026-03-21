#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { isGitRepo, getStagedImageFiles } from './git';
import { stripStagedImages } from './index';
import { logStripped, logClean, logSkipped, logSummary } from './log';

const HOOK_COMMENT = '# MetaStrip: Auto-strip metadata from images before commit';
const HOOK_COMMAND = 'npx metastrip-hooks run 2>&1';
const HOOK_LINES = `${HOOK_COMMENT}\n${HOOK_COMMAND}\n`;
const SHEBANG = '#!/bin/sh\n';
const PRE_COMMIT_PATH = path.join(process.cwd(), '.git', 'hooks', 'pre-commit');

function install(): void {
  if (!isGitRepo()) {
    process.stderr.write('MetaStrip: Not a git repository.\n');
    process.exit(1);
  }

  if (fs.existsSync(PRE_COMMIT_PATH)) {
    const existing = fs.readFileSync(PRE_COMMIT_PATH, 'utf-8');
    if (existing.toLowerCase().includes('metastrip')) {
      process.stdout.write('MetaStrip: pre-commit hook already installed.\n');
      return;
    }
    // Append to existing hook
    const toAppend = existing.endsWith('\n') ? HOOK_LINES : `\n${HOOK_LINES}`;
    fs.appendFileSync(PRE_COMMIT_PATH, toAppend);
  } else {
    // Create new hook file
    fs.writeFileSync(PRE_COMMIT_PATH, `${SHEBANG}\n${HOOK_LINES}`);
  }

  fs.chmodSync(PRE_COMMIT_PATH, 0o755);
  process.stdout.write('MetaStrip: pre-commit hook installed successfully.\n');
}

async function run(): Promise<void> {
  const files = getStagedImageFiles();
  if (files.length === 0) {
    return;
  }

  const batch = await stripStagedImages(files);

  for (const result of batch.results) {
    if (result.skipped || !result.success) {
      logSkipped(result.filePath, result.error ?? 'unknown error');
    } else if (result.metadataRemoved) {
      logStripped(result.filePath, result.categories, result.savedBytes);
    } else {
      logClean(result.filePath);
    }
  }

  logSummary(batch.stripped, batch.clean, batch.skipped);
}

function uninstall(): void {
  if (!fs.existsSync(PRE_COMMIT_PATH)) {
    process.stdout.write('MetaStrip: No pre-commit hook found.\n');
    return;
  }

  const content = fs.readFileSync(PRE_COMMIT_PATH, 'utf-8');
  const lines = content.split('\n');
  const filtered = lines.filter(line => !line.toLowerCase().includes('metastrip'));
  const result = filtered.join('\n');

  // If only a shebang line (and blank lines) remain, delete the file
  const nonEmpty = filtered.filter(l => l.trim().length > 0);
  const isOnlyShebang = nonEmpty.every(l => l.trim().startsWith('#!'));

  if (isOnlyShebang) {
    fs.unlinkSync(PRE_COMMIT_PATH);
    process.stdout.write('MetaStrip: pre-commit hook removed.\n');
  } else {
    fs.writeFileSync(PRE_COMMIT_PATH, result);
    process.stdout.write('MetaStrip: MetaStrip lines removed from pre-commit hook.\n');
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'install':
      install();
      break;
    case 'run':
      await run();
      break;
    case 'uninstall':
      uninstall();
      break;
    default:
      process.stderr.write('Usage: metastrip-hooks <install|run|uninstall>\n');
      process.exit(1);
  }
}

main().catch(err => {
  process.stderr.write(`MetaStrip: Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
