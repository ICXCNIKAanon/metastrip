'use client';

import { useState } from 'react';
import type { MetadataEntry } from '@/lib/metadata';
import type { MetadataCategory } from '@/lib/categories';
import { CATEGORY_ICONS } from '@/lib/categories';

interface MetadataTableProps {
  entries: MetadataEntry[];
  byCategory: Record<MetadataCategory, MetadataEntry[]>;
}

const RISK_VALUE_CLASSES: Record<string, string> = {
  critical: 'text-risk-critical',
  high: 'text-risk-high',
  medium: 'text-text-primary',
  low: 'text-text-primary',
  none: 'text-text-primary',
};

// Ordered list so categories appear in a sensible sequence
const CATEGORY_ORDER: MetadataCategory[] = [
  'gps', 'device', 'author', 'timestamps', 'software',
  'ai', 'thumbnail', 'xmp', 'iptc', 'icc', 'other',
];

export default function MetadataTable({ entries, byCategory }: MetadataTableProps) {
  const [expanded, setExpanded] = useState(false);

  const activeCategories = CATEGORY_ORDER.filter(
    (cat) => byCategory[cat] && byCategory[cat].length > 0,
  );

  return (
    <div className="bg-surface border border-border rounded-card overflow-hidden">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-text-secondary hover:text-text-primary hover:bg-border/30 transition-colors duration-150"
      >
        <span>
          {expanded
            ? `Hide metadata entries ▲`
            : `View all ${entries.length} metadata entries ▼`}
        </span>
        <span className="text-xs text-text-tertiary">{entries.length} total</span>
      </button>

      {/* Expandable content */}
      <div
        className={`transition-all duration-300 overflow-hidden ${
          expanded ? 'max-h-[9999px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="border-t border-border">
          {activeCategories.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-tertiary text-center">
              No metadata found.
            </p>
          ) : (
            activeCategories.map((cat) => {
              const catEntries = byCategory[cat];
              return (
                <div key={cat}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-border/20 border-b border-border">
                    <span className="text-sm leading-none" aria-hidden="true">
                      {CATEGORY_ICONS[cat]}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {cat}
                    </span>
                    <span className="ml-auto text-xs text-text-tertiary">
                      {catEntries.length}
                    </span>
                  </div>

                  {/* Entry rows */}
                  <table className="w-full text-sm">
                    <tbody>
                      {catEntries.map((entry) => (
                        <tr
                          key={entry.key}
                          className="border-b border-border/50 last:border-b-0 hover:bg-border/10 transition-colors duration-100"
                        >
                          <td className="px-4 py-2 w-2/5 text-text-secondary font-medium truncate align-top">
                            {entry.label}
                          </td>
                          <td
                            className={`px-4 py-2 w-3/5 truncate align-top font-mono text-xs break-all ${
                              RISK_VALUE_CLASSES[entry.risk] ?? 'text-text-primary'
                            }`}
                          >
                            {entry.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
