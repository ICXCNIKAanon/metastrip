'use client';

import { useCallback } from 'react';
import type { FileAnalysis } from '@/lib/metadata';
import { CATEGORY_ICONS } from '@/lib/categories';
import type { MetadataCategory } from '@/lib/categories';

/* ------------------------------------------------------------------ */
/* Shared types                                                       */
/* ------------------------------------------------------------------ */

interface BatchResult {
  analysis: FileAnalysis;
  strippedBuffer: ArrayBuffer;
  strippedSize: number;
  fileName: string;
}

interface BeforeAfterProps {
  // Single-file mode (legacy)
  analysis?: FileAnalysis;
  strippedSize?: number;
  strippedBuffer?: ArrayBuffer;
  processingTimeMs?: number;
  fileName?: string;
  // Batch mode
  results?: BatchResult[];
  // Common
  onReset: () => void;
}

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_ORDER: MetadataCategory[] = [
  'gps', 'device', 'author', 'timestamps', 'software',
  'ai', 'thumbnail', 'xmp', 'iptc', 'icc', 'other',
];

const RISK_LEVEL_LABELS: Record<FileAnalysis['riskLevel'], string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  none: 'SAFE',
};

const RISK_SCORE_CLASSES: Record<FileAnalysis['riskLevel'], string> = {
  critical: 'text-risk-critical',
  high: 'text-risk-high',
  medium: 'text-risk-medium',
  low: 'text-accent',
  none: 'text-risk-safe',
};

const RISK_BADGE_BG: Record<FileAnalysis['riskLevel'], string> = {
  critical: 'bg-risk-critical/20 text-risk-critical',
  high: 'bg-risk-high/20 text-risk-high',
  medium: 'bg-risk-medium/20 text-risk-medium',
  low: 'bg-accent/20 text-accent',
  none: 'bg-risk-safe/20 text-risk-safe',
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getCleanFileName(name: string): string {
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1) return `${name}.cleaned`;
  const base = name.slice(0, lastDot);
  const ext = name.slice(lastDot + 1);
  return `${base}.cleaned.${ext}`;
}

function triggerDownload(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const blobUrl = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: blobUrl,
    download: getCleanFileName(fileName),
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

/* ------------------------------------------------------------------ */
/* Single-file view                                                   */
/* ------------------------------------------------------------------ */

function SingleView({
  analysis,
  strippedSize,
  strippedBuffer,
  processingTimeMs,
  fileName,
  onReset,
}: {
  analysis: FileAnalysis;
  strippedSize: number;
  strippedBuffer: ArrayBuffer;
  processingTimeMs: number;
  fileName: string;
  onReset: () => void;
}) {
  const { fileSize, riskScore, riskLevel, byCategory } = analysis;

  const savedBytes = fileSize - strippedSize;
  const savedKB = (savedBytes / 1024).toFixed(1);
  const savedPct = fileSize > 0 ? Math.round((savedBytes / fileSize) * 100) : 0;
  const keptPct = 100 - savedPct;

  const strippedEntriesCount = analysis.entries.length;

  const categoriesWithEntries = CATEGORY_ORDER.filter(
    (cat) => byCategory[cat]?.length > 0,
  );

  const handleDownload = useCallback(() => {
    triggerDownload(strippedBuffer, fileName);
  }, [strippedBuffer, fileName]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText('https://metastrip.ai');
    } catch {
      // Silently fail if clipboard not available
    }
  }, []);

  const twitterText = encodeURIComponent(
    'I just found out my photo had hidden GPS data, device info, and more. Strip your metadata free at https://metastrip.ai',
  );
  const twitterUrl = `https://twitter.com/intent/tweet?text=${twitterText}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Success banner */}
      <div className="flex flex-col items-center gap-2 text-center bg-risk-safe/5 border border-risk-safe/20 rounded-card p-5">
        <span className="text-4xl leading-none" aria-hidden="true">🛡️</span>
        <h2 className="text-xl font-bold text-primary">Metadata Removed</h2>
        <p className="text-sm text-text-tertiary">
          {strippedEntriesCount} entries stripped · {savedKB} KB saved · processed in {processingTimeMs}ms
        </p>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-4">
        {/* Before — red tinted */}
        <div className="bg-risk-critical/5 border border-risk-critical/20 rounded-card p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-widest">Before</p>
          <div className="flex flex-col items-center gap-2">
            <span className={`text-5xl font-extrabold tabular-nums leading-none ${RISK_SCORE_CLASSES[riskLevel]}`}>
              {riskScore}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-button ${RISK_BADGE_BG[riskLevel]}`}>
              {RISK_LEVEL_LABELS[riskLevel]}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5 mt-1">
            {categoriesWithEntries.map((cat) => (
              <li key={cat} className="flex items-center gap-2 text-xs text-text-secondary">
                <span aria-hidden="true">{CATEGORY_ICONS[cat]}</span>
                <span className="capitalize">{cat}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* After — green tinted */}
        <div className="bg-risk-safe/5 border border-risk-safe/20 rounded-card p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-widest">After</p>
          <div className="flex flex-col items-center gap-2">
            <span className="text-5xl font-extrabold tabular-nums leading-none text-risk-safe">
              0
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-button bg-risk-safe/20 text-risk-safe">
              SAFE
            </span>
          </div>
          <ul className="flex flex-col gap-1.5 mt-1">
            {[
              'No GPS data',
              'No device info',
              'No timestamps',
              'Color profile preserved',
              `Image quality: lossless`,
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-risk-safe">
                <span aria-hidden="true">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Size comparison bar */}
      <div className="bg-surface border border-border rounded-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary font-medium">File size</span>
          <span className="text-risk-safe font-semibold">
            -{savedKB} KB ({savedPct}%)
          </span>
        </div>
        {/* Bar */}
        <div className="relative h-2.5 bg-border rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-risk-safe rounded-full transition-all duration-700"
            style={{ width: `${keptPct}%` }}
          />
        </div>
        {/* Labels */}
        <div className="flex items-center justify-between text-xs text-text-tertiary">
          <span>Original: {formatBytes(fileSize)}</span>
          <span>Cleaned: {formatBytes(strippedSize)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleDownload}
          className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-3 px-5 rounded-button text-base transition-colors duration-150"
        >
          Download Clean File
        </button>
        <button
          type="button"
          onClick={onReset}
          title="Analyze another file"
          aria-label="Analyze another file"
          className="flex-shrink-0 bg-surface hover:bg-border/60 border border-border text-text-secondary hover:text-text-primary font-bold py-3 px-4 rounded-button text-base transition-colors duration-150"
        >
          +
        </button>
      </div>

      {/* Share prompt */}
      <div className="flex flex-col items-center gap-2 text-center pt-1">
        <p className="text-sm text-text-secondary">Surprised by what your photo revealed?</p>
        <div className="flex items-center gap-4 text-sm">
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline font-medium transition-colors duration-150"
          >
            Share on X
          </a>
          <span className="text-border" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={handleCopyLink}
            className="text-text-tertiary hover:text-text-secondary font-medium transition-colors duration-150"
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Batch view                                                         */
/* ------------------------------------------------------------------ */

function BatchView({
  results,
  onReset,
}: {
  results: BatchResult[];
  onReset: () => void;
}) {
  const totalEntries = results.reduce((sum, r) => sum + r.analysis.entries.length, 0);
  const totalSavedBytes = results.reduce((sum, r) => sum + (r.analysis.fileSize - r.strippedSize), 0);
  const totalSavedKB = (totalSavedBytes / 1024).toFixed(1);

  const handleDownloadOne = useCallback((r: BatchResult) => {
    triggerDownload(r.strippedBuffer, r.fileName);
  }, []);

  const handleDownloadAll = useCallback(() => {
    // Download each file individually with a small stagger to avoid browser blocking
    results.forEach((r, i) => {
      setTimeout(() => triggerDownload(r.strippedBuffer, r.fileName), i * 200);
    });
  }, [results]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText('https://metastrip.ai');
    } catch {
      // Silently fail if clipboard not available
    }
  }, []);

  const twitterText = encodeURIComponent(
    'I just found out my photos had hidden GPS data, device info, and more. Strip your metadata free at https://metastrip.ai',
  );
  const twitterUrl = `https://twitter.com/intent/tweet?text=${twitterText}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Success banner */}
      <div className="flex flex-col items-center gap-2 text-center bg-risk-safe/5 border border-risk-safe/20 rounded-card p-5">
        <span className="text-4xl leading-none" aria-hidden="true">🛡️</span>
        <h2 className="text-xl font-bold text-primary">
          Metadata Removed from {results.length} Files
        </h2>
        <p className="text-sm text-text-tertiary">
          {totalEntries} entries stripped · {totalSavedKB} KB saved total
        </p>
      </div>

      {/* Per-file rows with download buttons */}
      <div className="flex flex-col gap-2">
        {results.map((r, i) => {
          const saved = r.analysis.fileSize - r.strippedSize;
          const savedKB = (saved / 1024).toFixed(1);
          return (
            <div
              key={`${r.fileName}-${i}`}
              className="bg-surface border border-border rounded-card p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-text-primary truncate text-sm">{r.fileName}</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {r.analysis.entries.length} entries stripped · {savedKB} KB saved
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDownloadOne(r)}
                className="flex-shrink-0 bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-xs py-1.5 px-3 rounded-button transition-colors duration-150"
              >
                Download
              </button>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleDownloadAll}
          className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold py-3 px-5 rounded-button text-base transition-colors duration-150"
        >
          Download All ({results.length} files)
        </button>
        <button
          type="button"
          onClick={onReset}
          title="Process more files"
          aria-label="Process more files"
          className="flex-shrink-0 bg-surface hover:bg-border/60 border border-border text-text-secondary hover:text-text-primary font-bold py-3 px-4 rounded-button text-base transition-colors duration-150"
        >
          Process More
        </button>
      </div>

      {/* Share prompt */}
      <div className="flex flex-col items-center gap-2 text-center pt-1">
        <p className="text-sm text-text-secondary">Surprised by what your photos revealed?</p>
        <div className="flex items-center gap-4 text-sm">
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline font-medium transition-colors duration-150"
          >
            Share on X
          </a>
          <span className="text-border" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={handleCopyLink}
            className="text-text-tertiary hover:text-text-secondary font-medium transition-colors duration-150"
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main export — chooses single vs batch view                         */
/* ------------------------------------------------------------------ */

export default function BeforeAfter({
  analysis,
  strippedSize,
  strippedBuffer,
  processingTimeMs,
  fileName,
  results,
  onReset,
}: BeforeAfterProps) {
  // Batch mode: `results` array provided
  if (results && results.length > 1) {
    return <BatchView results={results} onReset={onReset} />;
  }

  // Single result from batch array
  if (results && results.length === 1) {
    const r = results[0];
    return (
      <SingleView
        analysis={r.analysis}
        strippedSize={r.strippedSize}
        strippedBuffer={r.strippedBuffer}
        processingTimeMs={processingTimeMs ?? 0}
        fileName={r.fileName}
        onReset={onReset}
      />
    );
  }

  // Legacy single-file props
  if (analysis && strippedBuffer && strippedSize !== undefined && fileName) {
    return (
      <SingleView
        analysis={analysis}
        strippedSize={strippedSize}
        strippedBuffer={strippedBuffer}
        processingTimeMs={processingTimeMs ?? 0}
        fileName={fileName}
        onReset={onReset}
      />
    );
  }

  return null;
}
