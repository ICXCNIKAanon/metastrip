import { execSync, execFileSync } from 'child_process';
import * as path from 'path';

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp',
  '.gif', '.svg', '.pdf',
  '.docx', '.xlsx', '.pptx',
  '.mp3', '.wav', '.flac',
  '.mp4', '.mov', '.heic', '.avif', '.m4a', '.avi', '.mkv',
  '.epub',
]);

export function getStagedImageFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' });
    return output
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0)
      .filter(f => SUPPORTED_EXTENSIONS.has(path.extname(f).toLowerCase()));
  } catch {
    return [];
  }
}

export function restageFile(filePath: string): boolean {
  try {
    execFileSync('git', ['add', filePath], { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

export function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --git-dir', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
