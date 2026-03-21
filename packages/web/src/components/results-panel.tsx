'use client';

import type { FileAnalysis } from '@/lib/metadata';
import { CATEGORY_ICONS } from '@/lib/categories';
import type { MetadataCategory } from '@/lib/categories';
import RiskScore from '@/components/risk-score';
import GpsMap from '@/components/gps-map';
import MetadataTable from '@/components/metadata-table';

interface ResultsPanelProps {
  analysis: FileAnalysis;
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

export default function ResultsPanel({ analysis, onStrip }: ResultsPanelProps) {
  const { fileName, fileSize, riskScore, riskLevel, entries, byCategory, gps } = analysis;

  // Build ordered list of categories that have entries
  const categoriesWithEntries = (
    ['gps', 'device', 'author', 'timestamps', 'software', 'ai', 'thumbnail', 'xmp', 'iptc', 'icc', 'other'] as MetadataCategory[]
  ).filter((cat) => byCategory[cat]?.length > 0);

  const visiblePills = categoriesWithEntries.slice(0, 5);
  const extraCount = categoriesWithEntries.length - visiblePills.length;

  // Find GPS timestamp from entries if available
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
    // Map-First Layout
    return (
      <div className="flex flex-col gap-5">
        {/* File header */}
        <div className="bg-surface border border-border rounded-card p-4">
          {fileHeader}
        </div>

        {/* GPS map — large */}
        <GpsMap lat={gps.lat} lon={gps.lon} />

        {/* Warning banner */}
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

        {/* Risk pills */}
        {riskPills}

        {/* Expandable metadata table */}
        <MetadataTable entries={entries} byCategory={byCategory} />

        {/* CTA */}
        {ctaButton}
      </div>
    );
  }

  // Score-First Layout
  const summaryText: Record<FileAnalysis['riskLevel'], string> = {
    critical: 'This file contains highly sensitive metadata that could identify you.',
    high: 'This file contains metadata that poses a significant privacy risk.',
    medium: 'This file contains some metadata worth reviewing.',
    low: 'This file contains minor metadata with low privacy impact.',
    none: 'No significant privacy metadata was detected.',
  };

  return (
    <div className="flex flex-col gap-5">
      {/* File header */}
      <div className="bg-surface border border-border rounded-card p-4">
        {fileHeader}
      </div>

      {/* Large risk score — centered */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-full max-w-xs">
          <RiskScore score={riskScore} level={riskLevel} />
        </div>
        <p className="text-sm text-text-secondary text-center max-w-sm">
          {summaryText[riskLevel]}
        </p>
      </div>

      {/* Risk pills */}
      {riskPills}

      {/* Expandable metadata table */}
      <MetadataTable entries={entries} byCategory={byCategory} />

      {/* CTA */}
      {ctaButton}
    </div>
  );
}
