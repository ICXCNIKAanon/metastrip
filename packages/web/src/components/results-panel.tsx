'use client';

import { useState } from 'react';
import type { FileAnalysis } from '@/lib/metadata';
import { CATEGORY_ICONS } from '@/lib/categories';
import type { MetadataCategory } from '@/lib/categories';
import type { CustomMetadata } from '@/lib/fake-metadata';
import { geocodeAddress } from '@/lib/fake-metadata';
import RiskScore from '@/components/risk-score';
import GpsMap from '@/components/gps-map';
import MetadataTable from '@/components/metadata-table';

type InjectMode = 'off' | 'random' | 'custom';

interface ResultsPanelProps {
  analysis?: FileAnalysis;
  analyses?: FileAnalysis[];
  onStrip: () => void;
  injectMode?: InjectMode;
  onInjectModeChange?: (mode: InjectMode) => void;
  customMetadata?: CustomMetadata | null;
  onCustomMetadataChange?: (meta: CustomMetadata | null) => void;
  /** @deprecated Use injectMode instead */
  injectFake?: boolean;
  /** @deprecated Use onInjectModeChange instead */
  onToggleInject?: (value: boolean) => void;
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

function InjectPanel({
  mode,
  onModeChange,
  customMetadata,
  onCustomMetadataChange,
}: {
  mode: InjectMode;
  onModeChange: (m: InjectMode) => void;
  customMetadata: CustomMetadata | null;
  onCustomMetadataChange: (m: CustomMetadata | null) => void;
}) {
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  const enabled = mode !== 'off';
  const custom = customMetadata || {};

  const updateCustom = (patch: Partial<CustomMetadata>) => {
    onCustomMetadataChange({ ...custom, ...patch });
  };

  const handleLookup = async () => {
    if (!custom.address?.trim()) return;
    setGeocoding(true);
    setGeocodeResult(null);
    setGeocodeError(null);
    const result = await geocodeAddress(custom.address);
    if (result) {
      updateCustom({
        gps: { lat: result.lat, lon: result.lon, name: result.displayName },
      });
      setGeocodeResult(`${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`);
    } else {
      setGeocodeError('Could not resolve address');
    }
    setGeocoding(false);
  };

  return (
    <div className="bg-surface border border-border rounded-card overflow-hidden">
      {/* Toggle row */}
      <label className="flex items-center justify-between gap-3 p-4 cursor-pointer select-none">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">Inject decoy metadata</p>
          <p className="text-xs text-text-tertiary mt-0.5">
            Adds fake GPS, device, and timestamp data to confuse trackers
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onModeChange(enabled ? 'off' : 'random')}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
            enabled ? 'bg-primary' : 'bg-border'
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </label>

      {/* Expanded panel when enabled */}
      {enabled && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onModeChange('random')}
              className={`flex-1 text-xs font-semibold py-2 rounded-button transition-colors ${
                mode === 'random'
                  ? 'bg-primary text-white'
                  : 'bg-background text-text-secondary hover:text-text-primary border border-border'
              }`}
            >
              Random
            </button>
            <button
              type="button"
              onClick={() => onModeChange('custom')}
              className={`flex-1 text-xs font-semibold py-2 rounded-button transition-colors ${
                mode === 'custom'
                  ? 'bg-primary text-white'
                  : 'bg-background text-text-secondary hover:text-text-primary border border-border'
              }`}
            >
              Custom
            </button>
          </div>

          {/* Custom fields */}
          {mode === 'custom' && (
            <div className="space-y-3">
              {/* Location */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Location
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="1600 Pennsylvania Ave, Washington DC"
                    value={custom.address || ''}
                    onChange={(e) => {
                      updateCustom({ address: e.target.value });
                      setGeocodeResult(null);
                      setGeocodeError(null);
                    }}
                    className="flex-1 bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={handleLookup}
                    disabled={geocoding || !custom.address?.trim()}
                    className="px-3 py-2 text-xs font-semibold rounded-button bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {geocoding ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Looking up...
                      </span>
                    ) : (
                      'Lookup'
                    )}
                  </button>
                </div>
                {geocodeResult && (
                  <p className="text-xs text-primary mt-1 font-mono">
                    Resolved: {geocodeResult}
                  </p>
                )}
                {geocodeError && (
                  <p className="text-xs text-risk-high mt-1">{geocodeError}</p>
                )}
              </div>

              {/* Device */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Device
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Samsung"
                    value={custom.deviceMake || ''}
                    onChange={(e) => updateCustom({ deviceMake: e.target.value })}
                    className="flex-1 bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Galaxy S24 Ultra"
                    value={custom.deviceModel || ''}
                    onChange={(e) => updateCustom({ deviceModel: e.target.value })}
                    className="flex-1 bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={custom.dateTime ? custom.dateTime.replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T') : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) {
                      // Convert "2024-06-15T14:30" to EXIF format "2024:06:15 14:30:00"
                      const exif = v.replace(/-/g, ':').replace('T', ' ') + (v.length <= 16 ? ':00' : '');
                      updateCustom({ dateTime: exif });
                    } else {
                      updateCustom({ dateTime: undefined });
                    }
                  }}
                  className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          {mode === 'random' && (
            <p className="text-xs text-text-tertiary">
              A random famous landmark and retro device will be injected each time.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SingleFileView({
  analysis,
  onStrip,
  injectMode = 'off',
  onInjectModeChange,
  customMetadata = null,
  onCustomMetadataChange,
}: {
  analysis: FileAnalysis;
  onStrip: () => void;
  injectMode?: InjectMode;
  onInjectModeChange?: (m: InjectMode) => void;
  customMetadata?: CustomMetadata | null;
  onCustomMetadataChange?: (m: CustomMetadata | null) => void;
}) {
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
      <div
        className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-button text-sm font-bold ${RISK_BADGE_CLASSES[riskLevel]}`}
        aria-label={`Privacy risk score: ${riskScore} out of 100, ${RISK_LEVEL_LABELS[riskLevel].toLowerCase()}`}
      >
        <span className="text-base font-extrabold tabular-nums" aria-hidden="true">{riskScore}</span>
        <span className="text-xs font-semibold tracking-wide" aria-hidden="true">{RISK_LEVEL_LABELS[riskLevel]}</span>
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

  const injectToggle = onInjectModeChange ? (
    <InjectPanel
      mode={injectMode}
      onModeChange={onInjectModeChange}
      customMetadata={customMetadata ?? null}
      onCustomMetadataChange={onCustomMetadataChange ?? (() => {})}
    />
  ) : null;

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
        {injectToggle}
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
      {injectToggle}
      {ctaButton}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Batch summary view                                                 */
/* ------------------------------------------------------------------ */
function BatchView({
  analyses,
  onStrip,
  injectMode = 'off',
  onInjectModeChange,
  customMetadata = null,
  onCustomMetadataChange,
}: {
  analyses: FileAnalysis[];
  onStrip: () => void;
  injectMode?: InjectMode;
  onInjectModeChange?: (m: InjectMode) => void;
  customMetadata?: CustomMetadata | null;
  onCustomMetadataChange?: (m: CustomMetadata | null) => void;
}) {
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
                aria-expanded={isExpanded}
                aria-controls={`file-detail-${i}`}
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
                <div id={`file-detail-${i}`} className="border-t border-border p-4">
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

      {/* Inject toggle */}
      {onInjectModeChange && (
        <InjectPanel
          mode={injectMode}
          onModeChange={onInjectModeChange}
          customMetadata={customMetadata ?? null}
          onCustomMetadataChange={onCustomMetadataChange ?? (() => {})}
        />
      )}

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
export default function ResultsPanel({
  analysis,
  analyses,
  onStrip,
  injectMode,
  onInjectModeChange,
  customMetadata,
  onCustomMetadataChange,
  // Legacy props — convert to new API
  injectFake,
  onToggleInject,
}: ResultsPanelProps) {
  // Build the effective list: prefer `analyses` array, fall back to single `analysis`
  const list = analyses ?? (analysis ? [analysis] : []);

  if (list.length === 0) return null;

  // Support legacy props as fallback
  const effectiveMode: InjectMode = injectMode ?? (injectFake ? 'random' : 'off');
  const effectiveModeChange = onInjectModeChange ?? (onToggleInject ? ((m: InjectMode) => onToggleInject(m !== 'off')) : undefined);

  if (list.length === 1) {
    return (
      <SingleFileView
        analysis={list[0]}
        onStrip={onStrip}
        injectMode={effectiveMode}
        onInjectModeChange={effectiveModeChange}
        customMetadata={customMetadata}
        onCustomMetadataChange={onCustomMetadataChange}
      />
    );
  }

  return (
    <BatchView
      analyses={list}
      onStrip={onStrip}
      injectMode={effectiveMode}
      onInjectModeChange={effectiveModeChange}
      customMetadata={customMetadata}
      onCustomMetadataChange={onCustomMetadataChange}
    />
  );
}
