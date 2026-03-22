'use client';

import { useState, useRef, useCallback } from 'react';
import { analyzeFile } from '@/lib/metadata';
import type { FileAnalysis } from '@/lib/metadata';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlotState {
  file: File;
  buffer: ArrayBuffer;
  analysis: FileAnalysis;
}

type Verdict = 'SAME_DEVICE' | 'POSSIBLY_SAME' | 'DIFFERENT';

interface ComparisonResult {
  verdict: Verdict;
  matchedFields: string[];
  serialMatch: boolean;
}

// ---------------------------------------------------------------------------
// Device fingerprint keys we compare
// ---------------------------------------------------------------------------

const FINGERPRINT_KEYS = [
  'Make',
  'Model',
  'BodySerialNumber',
  'LensSerialNumber',
  'LensModel',
  'Software',
  'CameraOwnerName',
  'ImageUniqueID',
];

const SERIAL_KEYS = ['BodySerialNumber', 'LensSerialNumber', 'ImageUniqueID'];

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

function compareAnalyses(a: FileAnalysis, b: FileAnalysis): ComparisonResult {
  const getVal = (analysis: FileAnalysis, key: string): string | null => {
    const entry = analysis.entries.find((e) => e.key === key);
    return entry ? entry.value.trim().toLowerCase() : null;
  };

  const matchedFields: string[] = [];

  for (const key of FINGERPRINT_KEYS) {
    const va = getVal(a, key);
    const vb = getVal(b, key);
    if (va && vb && va === vb) {
      matchedFields.push(key);
    }
  }

  const serialMatch = SERIAL_KEYS.some((key) => {
    const va = getVal(a, key);
    const vb = getVal(b, key);
    return va && vb && va === vb;
  });

  let verdict: Verdict;
  if (serialMatch) {
    verdict = 'SAME_DEVICE';
  } else if (
    matchedFields.includes('Make') &&
    matchedFields.includes('Model')
  ) {
    verdict = 'POSSIBLY_SAME';
  } else {
    verdict = 'DIFFERENT';
  }

  return { verdict, matchedFields, serialMatch };
}

// ---------------------------------------------------------------------------
// Mini drop zone component (single file)
// ---------------------------------------------------------------------------

interface MiniDropProps {
  label: string;
  slot: SlotState | null;
  loading: boolean;
  onFile: (file: File) => void;
}

function MiniDrop({ label, slot, loading, onFile }: MiniDropProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (f: File) => {
      onFile(f);
    },
    [onFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const borderColor = isDragging
    ? 'border-primary bg-primary/5 shadow-[0_0_16px_rgba(16,185,129,0.12)]'
    : slot
      ? 'border-primary/40 bg-surface'
      : 'border-border hover:border-primary/40 hover:bg-primary/5 bg-surface/50';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Drop zone for ${label}`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-card p-8 cursor-pointer transition-all duration-200 select-none flex flex-col items-center justify-center gap-3 min-h-[160px] ${borderColor}`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleInput}
        aria-hidden="true"
      />

      {loading ? (
        <>
          <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-text-secondary">Analyzing...</p>
        </>
      ) : slot ? (
        <>
          {/* File icon */}
          <svg
            className="w-8 h-8 text-primary flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary truncate max-w-[180px]">
              {slot.file.name}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">
              {slot.analysis.entries.length} metadata fields &middot; click to change
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Upload icon */}
          <svg
            className="w-8 h-8 text-text-tertiary flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          <div className="text-center">
            <p className="text-sm font-semibold text-text-primary">{label}</p>
            <p className="text-xs text-text-tertiary mt-0.5">
              Drop a file or click to browse
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdict card
// ---------------------------------------------------------------------------

function VerdictCard({ result }: { result: ComparisonResult }) {
  const config = {
    SAME_DEVICE: {
      border: 'border-red-500/60',
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      badge: 'bg-red-500/20 text-red-300 border border-red-500/30',
      icon: (
        <svg className="w-7 h-7 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      label: 'SAME DEVICE',
      desc: 'Serial number(s) match — these files were almost certainly captured by the same physical device.',
    },
    POSSIBLY_SAME: {
      border: 'border-yellow-500/60',
      bg: 'bg-yellow-500/10',
      text: 'text-yellow-400',
      badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
      icon: (
        <svg className="w-7 h-7 text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      ),
      label: 'POSSIBLY SAME DEVICE',
      desc: 'Make and model match but no serial numbers were found. Could be the same device or the same camera model.',
    },
    DIFFERENT: {
      border: 'border-emerald-500/60',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
      icon: (
        <svg className="w-7 h-7 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      label: 'DIFFERENT DEVICES',
      desc: 'No matching device fingerprints found. These files appear to come from different devices.',
    },
  }[result.verdict];

  return (
    <div className={`border-2 rounded-card p-5 ${config.border} ${config.bg}`}>
      <div className="flex items-start gap-4">
        {config.icon}
        <div className="flex-1 min-w-0">
          <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold tracking-wider mb-2 ${config.badge}`}>
            {config.label}
          </span>
          <p className="text-sm text-text-secondary leading-relaxed">{config.desc}</p>
          {result.matchedFields.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.matchedFields.map((f) => (
                <span
                  key={f}
                  className="text-xs px-2 py-0.5 rounded bg-surface border border-border text-text-secondary font-mono"
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side-by-side metadata table
// ---------------------------------------------------------------------------

function MetadataTable({ slotA, slotB, matchedKeys }: {
  slotA: SlotState;
  slotB: SlotState;
  matchedKeys: Set<string>;
}) {
  // Build union of all keys
  const allKeys = Array.from(
    new Set([
      ...slotA.analysis.entries.map((e) => e.key),
      ...slotB.analysis.entries.map((e) => e.key),
    ]),
  ).sort();

  const getVal = (analysis: FileAnalysis, key: string) =>
    analysis.entries.find((e) => e.key === key)?.value ?? null;

  return (
    <div className="border border-border rounded-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[180px_1fr_1fr] bg-surface border-b border-border text-xs font-semibold text-text-tertiary uppercase tracking-wider">
        <div className="px-4 py-3">Field</div>
        <div className="px-4 py-3 border-l border-border truncate">{slotA.file.name}</div>
        <div className="px-4 py-3 border-l border-border truncate">{slotB.file.name}</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {allKeys.map((key) => {
          const va = getVal(slotA.analysis, key);
          const vb = getVal(slotB.analysis, key);
          const isMatch = matchedKeys.has(key);
          const rowBg = isMatch ? 'bg-primary/5' : '';

          return (
            <div
              key={key}
              className={`grid grid-cols-[180px_1fr_1fr] text-xs min-h-[36px] ${rowBg}`}
            >
              <div className={`px-4 py-2.5 font-medium flex items-center gap-1.5 ${isMatch ? 'text-primary' : 'text-text-secondary'}`}>
                {isMatch && (
                  <svg className="w-3 h-3 flex-shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span className="truncate font-mono">{key}</span>
              </div>
              <div className={`px-4 py-2.5 border-l border-border break-words ${va ? 'text-text-primary' : 'text-text-tertiary italic'}`}>
                {va ?? '—'}
              </div>
              <div className={`px-4 py-2.5 border-l border-border break-words ${vb ? 'text-text-primary' : 'text-text-tertiary italic'}`}>
                {vb ?? '—'}
              </div>
            </div>
          );
        })}

        {allKeys.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-text-tertiary">
            No metadata fields found in either file.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ComparePage() {
  const [slotA, setSlotA] = useState<SlotState | null>(null);
  const [slotB, setSlotB] = useState<SlotState | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  const handleFileA = useCallback(async (file: File) => {
    setLoadingA(true);
    try {
      const buffer = await file.arrayBuffer();
      const analysis = await analyzeFile(file);
      setSlotA({ file, buffer, analysis });
    } catch (err) {
      console.error('Failed to analyze file A:', err);
    } finally {
      setLoadingA(false);
    }
  }, []);

  const handleFileB = useCallback(async (file: File) => {
    setLoadingB(true);
    try {
      const buffer = await file.arrayBuffer();
      const analysis = await analyzeFile(file);
      setSlotB({ file, buffer, analysis });
    } catch (err) {
      console.error('Failed to analyze file B:', err);
    } finally {
      setLoadingB(false);
    }
  }, []);

  const handleReset = () => {
    setSlotA(null);
    setSlotB(null);
  };

  const comparisonResult =
    slotA && slotB ? compareAnalyses(slotA.analysis, slotB.analysis) : null;

  const matchedKeySet = comparisonResult
    ? new Set(comparisonResult.matchedFields)
    : new Set<string>();

  return (
    <main className="min-h-screen">
      {/* ========== HERO ========== */}
      <section className="max-w-4xl mx-auto px-4 pt-16 pb-8 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20 mb-6">
          Files never leave your browser
        </span>

        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-text-primary mb-4">
          Compare File Fingerprints
        </h1>
        <p className="text-lg text-text-secondary max-w-xl mx-auto">
          Drop two files and see if they were captured by the{' '}
          <span className="font-extrabold text-primary">same device</span>.
          Serial numbers, camera model, and software — compared side by side.
        </p>
      </section>

      {/* ========== TOOL ========== */}
      <section className="max-w-4xl mx-auto px-4 pb-16 space-y-6">
        {/* Drop zones */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MiniDrop
            label="Drop File A"
            slot={slotA}
            loading={loadingA}
            onFile={handleFileA}
          />
          <MiniDrop
            label="Drop File B"
            slot={slotB}
            loading={loadingB}
            onFile={handleFileB}
          />
        </div>

        {/* Reset button (once at least one file is loaded) */}
        {(slotA || slotB) && (
          <div className="flex justify-end">
            <button
              onClick={handleReset}
              className="text-sm text-text-tertiary hover:text-text-secondary transition-colors duration-150 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear all
            </button>
          </div>
        )}

        {/* Results */}
        {comparisonResult && slotA && slotB && (
          <div className="space-y-6">
            {/* Verdict */}
            <VerdictCard result={comparisonResult} />

            {/* Side-by-side table */}
            <div>
              <h2 className="text-lg font-semibold text-text-primary mb-3">
                Full Metadata Comparison
              </h2>
              <p className="text-sm text-text-secondary mb-4">
                Rows highlighted in{' '}
                <span className="text-primary font-medium">green</span> indicate
                matching fields between the two files.
              </p>
              <MetadataTable
                slotA={slotA}
                slotB={slotB}
                matchedKeys={matchedKeySet}
              />
            </div>
          </div>
        )}

        {/* Waiting for second file */}
        {(slotA || slotB) && !(slotA && slotB) && !loadingA && !loadingB && (
          <div className="text-center py-4 text-sm text-text-tertiary">
            Drop the second file to see the comparison.
          </div>
        )}

        {/* Explainer (shown before any files loaded) */}
        {!slotA && !slotB && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            {[
              {
                icon: (
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                ),
                title: 'Drop Two Files',
                desc: 'Upload any two images or documents you want to compare.',
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.698-1.4 2.398" />
                  </svg>
                ),
                title: 'Fingerprint Check',
                desc: 'We compare make, model, serial numbers, lens, and software.',
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ),
                title: 'Instant Verdict',
                desc: 'Same device, possibly same, or different — with matched fields highlighted.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-surface border border-border rounded-card p-5 flex flex-col gap-3"
              >
                {item.icon}
                <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
