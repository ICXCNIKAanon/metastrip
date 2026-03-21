import * as path from 'path';

export function logStripped(filePath: string, categories: string[], savedBytes: number): void {
  const name = path.basename(filePath);
  const saved = formatBytes(savedBytes);
  const cats = categories.length > 0 ? ` (${categories.join(', ')})` : '';
  process.stderr.write(`MetaStrip: ${name} — stripped${cats} · saved ${saved}\n`);
}

export function logClean(filePath: string): void {
  process.stderr.write(`MetaStrip: ${path.basename(filePath)} — clean\n`);
}

export function logSkipped(filePath: string, reason: string): void {
  process.stderr.write(`MetaStrip: ${path.basename(filePath)} — skipped (${reason})\n`);
}

export function logSummary(stripped: number, clean: number, skipped: number): void {
  const parts: string[] = [];
  if (stripped > 0) parts.push(`${stripped} file${stripped !== 1 ? 's' : ''} cleaned`);
  if (clean > 0) parts.push(`${clean} already clean`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  process.stderr.write(`MetaStrip: ✓ ${parts.join(', ')}\n`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
