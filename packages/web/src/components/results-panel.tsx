'use client';

import { useState } from 'react';
import type { FileAnalysis } from '@/lib/metadata';
import { CATEGORY_ICONS } from '@/lib/categories';
import type { MetadataCategory } from '@/lib/categories';
import RiskScore from '@/components/risk-score';
import GpsMap from '@/components/gps-map';
import MetadataTable from '@/components/metadata-table';

interface ResultsPanelProps {
  analysis?: FileAnalysis;
  analyses?: FileAnalysis[];
  onStrip: () => void;
}

const RISK_LEVEL_LABELS: Record<FileAnalysis['riskLevel'], string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  none: 'SAFE',
};

const RISK_BADGE_CLASSES: Record<FileAnalysis['riskLevel'], string> = {
  critical: 'bg-risk-critical/20 text-risk-critical',
  high: 'bg-risk-high/20 text-risk-high',
  medium: 'bg-risk-medium/20 text-risk-medium',
  low: 'bg-accent/20 text-accent',
  none: 'bg-risk-safe/20 text-risk-safe',
};

const CATEGORY_PILL_CLASSES: Partial<Record<MetadataCategory, string>> = {
  gps: 'bg-risk-critical/10 text-risk-critical border border-risk-critical/20',
  device: 'bg-risk-high/10 text-risk-high border border-risk-high/20',
  timestamps: 'bg-risk-medium/10 text-risk-medium border border-risk-medium/20',
  software: 'bg-surface text-text-tertiary border border-border',
};

function getCategoryPillClass(cat: MetadataCategory): string {
  return CATEGORY_PILL_CLASSES[cat] ?? 'bg-surface text-text-tertiary border border-border';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
}

/* ------------------------------------------------------------------ */
/* Single-file detail view                                            */
/* ------------------------------------------------------------------ */
function SingleFileView({ analysis, onStrip }: { analysis: FileAnalysis; onStrip: () => void }) {
  const { fileName, fileSize, riskScore, riskLevel, entries, byCategory, gps } = analysis;

  const categoriesWithEntries = (
    ['gps', 'device', 'author', 'timestamps', 'software', 'ai', 'thumbnail', 'xmp', 'iptc', 'icc', 'other'] as MetadataCategory[]
  ).filter((cat) => byCategory[cat]?.length > 0);

  const visiblePills = categoriesWithEntries.slice(0, 5);
  const extraCount = categoriesWithEntries.length - visiblePills.length;

  const gpsTimestamp = entries.find((e) => e.category === 'gps' && e.key.toLowerCase().includes('date'))?.value ?? null;

  const fileHeader = (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <p className="font-semibold text-text-primary truncate">{fileName}</p>
        <p className="text-sm text-text-tertiary mt-0.5">
          {formatBytes(fileSize)} · {getExtension(fileName)} · {entries.length} entries
        </p>
      </div>
      <div className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-button text-sm font-bold ${RISK_BADGE_CLASSES[riskLevel]}`}>
        <span className="text-base font-extrabold tabular-nums">{riskScore}</span>
        <span className="text-xs font-semibold tracking-wide">{RISK_LEVEL_LABELS[riskLevel]}</span>
      </div>
    </div>
  );

  const riskPills = (
    <div className="flex flex-wrap gap-2">
      {visiblePills.map((cat) => (
        <span
          key={cat}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryPillClass(cat)}`}
        >
          <span aria-hidden="true">{CATEGORY_ICONS[cat]}</span>
          <span className="capitalize">{cat}</span>
        </span>
      ))}
      {extraCount > 0 && (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-surface text-text-tertiary border border-border">
          +{extraCount} more
        </span>
      )}
    </div>
  );

  const ctaButton = (
    <button
      type="button"
      onClick={onStrip}
      className="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-6 rounded-button w-full text-lg transition-colors duration-150"
    >
      Remove All Metadata →
    </button>
  );

  if (gps !== null) {
    return (
      <div className="flex flex-col gap-5">
        <div className="bg-surface border border-border rounded-card p-4">
          {fileHeader}
        </div>
        <GpsMap lat={gps.lat} lon={gps.lon} />
        <div className="border-l-4 border-risk-critical bg-risk-critical/5 rounded-r-lg p-4">
          <p className="text-sm font-semibold text-risk-critical mb-2">
            Anyone with this photo can see exactly where you were.
          </p>
          <p className="text-xs font-mono text-text-secondary">
            {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}
            {gps.alt !== undefined && ` · Alt ${gps.alt.toFixed(1)} m`}
          </p>
          {gpsTimestamp && (
            <p className="text-xs text-text-tertiary mt-1">{gpsTimestamp}</p>
          )}
        </div>
        {riskPills}
        <MetadataTable entries={entries} byCategory={byCategory} />
        {ctaButton}
      </div>
    );
  }

  const summaryText: Record<FileAnalysis['riskLevel'], string> = {
    critical: 'This file contains highly sensitive metadata that could identify you.',
    high: 'This file contains metadata that poses a significant privacy risk.',
    medium: 'This file contains some metadata worth reviewing.',
    low: 'This file contains minor metadata with low privacy impact.',
    none: 'No significant privacy metadata was detected.',
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-surface border border-border rounded-card p-4">
        {fileHeader}
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="w-full max-w-xs">
          <RiskScore score={riskScore} level={riskLevel} />
        </div>
        <p className="text-sm text-text-secondary text-center max-w-sm">
          {summaryText[riskLevel]}
        </p>
      </div>
      {riskPills}
      <MetadataTable entries={entries} byCategory={byCategory} />
      {ctaButton}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Batch summary view                                                 */
/* ------------------------------------------------------------------ */
function BatchView({ analyses, onStrip }: { analyses: FileAnalysis[]; onStrip: () => void }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const totalEntries = analyses.reduce((sum, a) => sum + a.entries.length, 0);
  const highestRiskLevel = analyses.reduce<FileAnalysis['riskLevel']>((worst, a) => {
    const order: FileAnalysis['riskLevel'][] = ['none', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(a.riskLevel) > order.indexOf(worst) ? a.riskLevel : worst;
  }, 'none');
  const highestRiskScore = Math.max(...analyses.map((a) => a.riskScore));

  return (
    <div className="flex flex-col gap-5">
      {/* Summary card */}
      <div className="bg-surface border border-border rounded-card p-5 text-center">
        <p className="text-lg font-bold text-text-primary mb-1">
          {analyses.length} files scanned
        </p>
        <p className="text-sm text-text-secondary">
          {totalEntries} metadata entries found
        </p>
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-button text-sm font-bold mt-3 ${RISK_BADGE_CLASSES[highestRiskLevel]}`}>
          <span className="text-base font-extrabold tabular-nums">{highestRiskScore}</span>
          <span className="text-xs font-semibold tracking-wide">Risk: {RISK_LEVEL_LABELS[highestRiskLevel]}</span>
        </div>
      </div>

      {/* Per-file rows */}
      <div className="flex flex-col gap-2">
        {analyses.map((a, i) => {
          const isExpanded = expandedIndex === i;
          return (
            <div key={`${a.fileName}-${i}`} className="bg-surface border border-border rounded-card overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-surface/80 transition-colors duration-150"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-text-primary truncate text-sm">{a.fileName}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {formatBytes(a.fileSize)} · {a.entries.length} entries
                  </p>
                </div>
                <div className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-button text-xs font-bold ${RISK_BADGE_CLASSES[a.riskLevel]}`}>
                  <span className="font-extrabold tabular-nums">{a.riskScore}</span>
                  <span className="font-semibold tracking-wide">{RISK_LEVEL_LABELS[a.riskLevel]}</span>
                </div>
                <span className="text-text-tertiary text-xs flex-shrink-0">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-border p-4">
                  {a.gps && (
                    <>
                      <GpsMap lat={a.gps.lat} lon={a.gps.lon} />
                      <div className="border-l-4 border-risk-critical bg-risk-critical/5 rounded-r-lg p-4 mt-4 mb-4">
                        <p className="text-sm font-semibold text-risk-critical mb-2">
                          Anyone with this photo can see exactly where you were.
                        </p>
                        <p className="text-xs font-mono text-text-secondary">
                          {a.gps.lat.toFixed(6)}, {a.gps.lon.toFixed(6)}
                          {a.gps.alt !== undefined && ` · Alt ${a.gps.alt.toFixed(1)} m`}
                        </p>
                      </div>
                    </>
                  )}
                  <MetadataTable entries={a.entries} byCategory={a.byCategory} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onStrip}
        className="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-6 rounded-button w-full text-lg transition-colors duration-150"
      >
        Remove All Metadata ({analyses.length} file{analyses.length === 1 ? '' : 's'}) →
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main export — chooses single vs batch view                         */
/* ------------------------------------------------------------------ */
export default function ResultsPanel({ analysis, analyses, onStrip }: ResultsPanelProps) {
  // Build the effective list: prefer `analyses` array, fall back to single `analysis`
  const list = analyses ?? (analysis ? [analysis] : []);

  if (list.length === 0) return null;

  if (list.length === 1) {
    return <SingleFileView analysis={list[0]} onStrip={onStrip} />;
  }

  return <BatchView analyses={list} onStrip={onStrip} />;
}
