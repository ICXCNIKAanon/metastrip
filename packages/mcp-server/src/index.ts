#!/usr/bin/env node

/**
 * MetaStrip MCP Server
 *
 * Exposes metadata operations as MCP tools for AI agents.
 * Install in your MCP client config:
 *
 * {
 *   "mcpServers": {
 *     "metastrip": {
 *       "command": "npx",
 *       "args": ["@metastrip/mcp-server"]
 *     }
 *   }
 * }
 *
 * Tools:
 *   - strip_metadata:   Remove metadata from a file
 *   - inspect_metadata:  View metadata with privacy risk assessment
 *   - compare_metadata:  Show before/after diff
 *   - batch_strip:       Process multiple files at once
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MetaStrip } from '@metastrip/core';
import type { MetadataCategory } from '@metastrip/core';

const ms = new MetaStrip();

const server = new McpServer({
  name: 'metastrip',
  version: '0.1.0',
});

// ============================================================
// Tool: strip_metadata
// ============================================================

server.tool(
  'strip_metadata',
  'Remove all or selected metadata from a file. Supports images (JPEG, PNG, WebP, HEIC, TIFF, GIF, AVIF) and videos (MP4, MOV, MKV, AVI, WebM). Returns a detailed report of what was removed and the path to the cleaned file.',
  {
    file_path: z.string().describe('Absolute path to the file to process'),
    output_path: z.string().optional().describe('Output path for cleaned file. Defaults to {name}.cleaned.{ext}'),
    categories: z.array(z.enum(['gps', 'device', 'timestamps', 'software', 'author', 'ai', 'icc', 'thumbnail', 'xmp', 'iptc', 'other']))
      .optional()
      .describe('Specific metadata categories to remove. Default: all except ICC color profile'),
    keep: z.array(z.enum(['gps', 'device', 'timestamps', 'software', 'author', 'ai', 'icc', 'thumbnail', 'xmp', 'iptc', 'other']))
      .optional()
      .describe('Categories to explicitly keep (overrides categories)'),
    preserve_color_profile: z.boolean().optional().default(true)
      .describe('Keep ICC color profile for accurate color rendering. Default: true'),
    quality: z.number().min(1).max(100).optional().default(95)
      .describe('Output quality for lossy formats (1-100). Default: 95'),
  },
  async ({ file_path, output_path, categories, keep, preserve_color_profile, quality }) => {
    try {
      const result = await ms.strip(file_path, {
        outputPath: output_path,
        categories: categories as MetadataCategory[] | undefined,
        keep: keep as MetadataCategory[] | undefined,
        preserveColorProfile: preserve_color_profile,
        quality,
      });

      if (!result.success) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error stripping metadata: ${result.error}`,
          }],
          isError: true,
        };
      }

      const summary = [
        `✅ Metadata removed successfully`,
        ``,
        `**Output:** ${result.outputPath}`,
        `**Entries removed:** ${result.entriesRemoved}`,
        `**Entries kept:** ${result.entriesKept}`,
        `**Original size:** ${formatSize(result.originalSize)}`,
        `**Cleaned size:** ${formatSize(result.cleanedSize)}`,
        `**Size saved:** ${formatSize(result.sizeReduction)} (${result.sizeReductionPercent.toFixed(1)}%)`,
        `**Processing time:** ${result.processingTimeMs}ms`,
        ``,
        `**Categories cleaned:** ${result.categoriesCleaned.join(', ')}`,
      ];

      if (result.removed.length > 0) {
        summary.push('', '**Removed entries:**');
        const grouped = groupBy(result.removed, e => e.category);
        for (const [cat, entries] of Object.entries(grouped)) {
          summary.push(`  ${cat}: ${entries.map(e => `${e.label}=${truncate(e.displayValue, 30)}`).join(', ')}`);
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: summary.join('\n'),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Tool: inspect_metadata
// ============================================================

server.tool(
  'inspect_metadata',
  'View all metadata in a file with privacy risk assessment. Shows GPS coordinates, device info, timestamps, author data, AI generation markers, and more. Returns a structured report with risk scoring.',
  {
    file_path: z.string().describe('Absolute path to the file to inspect'),
    format: z.enum(['summary', 'detailed', 'json']).optional().default('detailed')
      .describe('Output format. summary=overview only, detailed=full breakdown, json=raw JSON'),
  },
  async ({ file_path, format }) => {
    try {
      const result = await ms.inspect(file_path);

      if (format === 'json') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      }

      const lines: string[] = [];

      // Header
      lines.push(`**File:** ${result.filePath}`);
      lines.push(`**Type:** ${result.fileType} (${result.fileCategory})`);
      lines.push(`**Size:** ${formatSize(result.fileSize)}`);
      lines.push(`**Metadata entries:** ${result.totalEntries}`);
      lines.push(`**Standards found:** ${result.standards.join(', ')}`);
      lines.push('');

      // Risk
      lines.push(`**Privacy Risk: ${result.risk.level.toUpperCase()} (${result.risk.score}/100)**`);
      lines.push(result.risk.summary);
      if (result.risk.risks.length > 0) {
        for (const risk of result.risk.risks) {
          lines.push(`  ⚠️ [${risk.severity.toUpperCase()}] ${risk.description}`);
        }
      }
      lines.push('');

      // GPS
      if (result.gps) {
        lines.push('**🚨 GPS LOCATION FOUND:**');
        lines.push(`  Latitude: ${result.gps.latitude.toFixed(6)}`);
        lines.push(`  Longitude: ${result.gps.longitude.toFixed(6)}`);
        if (result.gps.altitude) lines.push(`  Altitude: ${result.gps.altitude.toFixed(1)}m`);
        lines.push(`  Map: https://www.google.com/maps?q=${result.gps.latitude},${result.gps.longitude}`);
        lines.push('');
      }

      // AI detection
      if (result.isAIGenerated) {
        lines.push('**🤖 AI-Generated Image Detected**');
        if (result.aiDetails?.model) lines.push(`  Model: ${result.aiDetails.model}`);
        if (result.aiDetails?.prompt) lines.push(`  Prompt: ${result.aiDetails.prompt}`);
        lines.push('');
      }

      // Detailed entries
      if (format === 'detailed') {
        const categories = Object.entries(result.byCategory)
          .filter(([, entries]) => entries.length > 0);

        for (const [category, entries] of categories) {
          lines.push(`**${category.toUpperCase()} (${entries.length} entries):**`);
          for (const entry of entries) {
            lines.push(`  ${entry.label}: ${truncate(entry.displayValue, 60)}`);
          }
          lines.push('');
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n'),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Tool: compare_metadata
// ============================================================

server.tool(
  'compare_metadata',
  'Compare metadata between an original file and its cleaned version. Shows what was removed, added, modified, and kept. Includes before/after risk assessment.',
  {
    original_path: z.string().describe('Path to the original file'),
    cleaned_path: z.string().describe('Path to the cleaned file'),
  },
  async ({ original_path, cleaned_path }) => {
    try {
      const result = await ms.compare(original_path, cleaned_path);

      const lines: string[] = [
        `**Metadata Comparison**`,
        ``,
        `**Risk Before:** ${result.riskBefore.level.toUpperCase()} (${result.riskBefore.score}/100)`,
        `**Risk After:** ${result.riskAfter.level.toUpperCase()} (${result.riskAfter.score}/100)`,
        `**Risk Reduction:** ${result.riskBefore.score - result.riskAfter.score} points`,
        ``,
        `**Removed:** ${result.removed.length} entries`,
        `**Added:** ${result.added.length} entries`,
        `**Modified:** ${result.modified.length} entries`,
        `**Unchanged:** ${result.unchanged.length} entries`,
      ];

      if (result.removed.length > 0) {
        lines.push('', '**Removed entries:**');
        for (const entry of result.removed) {
          lines.push(`  ❌ [${entry.category}] ${entry.label}: ${truncate(entry.displayValue, 50)}`);
        }
      }

      if (result.modified.length > 0) {
        lines.push('', '**Modified entries:**');
        for (const mod of result.modified) {
          lines.push(`  🔄 ${mod.key}: "${truncate(mod.before.displayValue, 25)}" → "${truncate(mod.after.displayValue, 25)}"`);
        }
      }

      if (result.unchanged.length > 0) {
        lines.push('', `**Unchanged:** ${result.unchanged.length} entries preserved`);
      }

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n'),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Tool: batch_strip
// ============================================================

server.tool(
  'batch_strip',
  'Process multiple files at once, removing metadata from all of them. Returns a summary with per-file results.',
  {
    file_paths: z.array(z.string()).describe('Array of file paths to process'),
    output_dir: z.string().optional().describe('Directory for cleaned files. Default: same directory as originals'),
    categories: z.array(z.enum(['gps', 'device', 'timestamps', 'software', 'author', 'ai', 'icc', 'thumbnail', 'xmp', 'iptc', 'other']))
      .optional()
      .describe('Categories to remove. Default: all except ICC'),
    keep: z.array(z.enum(['gps', 'device', 'timestamps', 'software', 'author', 'ai', 'icc', 'thumbnail', 'xmp', 'iptc', 'other']))
      .optional()
      .describe('Categories to keep'),
    concurrency: z.number().min(1).max(10).optional().default(4)
      .describe('Max files to process in parallel. Default: 4'),
  },
  async ({ file_paths, output_dir, categories, keep, concurrency }) => {
    try {
      const result = await ms.batch(file_paths, {
        outputDir: output_dir,
        categories: categories as MetadataCategory[] | undefined,
        keep: keep as MetadataCategory[] | undefined,
        concurrency,
        continueOnError: true,
      });

      const lines: string[] = [
        `**Batch Processing Complete**`,
        ``,
        `**Files processed:** ${result.totalFiles}`,
        `**Succeeded:** ${result.successCount}`,
        `**Failed:** ${result.failureCount}`,
        `**Total metadata removed:** ${result.totalEntriesRemoved} entries`,
        `**Total size saved:** ${formatSize(result.totalSizeReduction)}`,
        `**Processing time:** ${result.totalProcessingTimeMs}ms`,
      ];

      if (result.results.length > 0) {
        lines.push('', '**Per-file results:**');
        for (const r of result.results) {
          if (r.success) {
            lines.push(`  ✅ ${r.inputPath} → ${r.outputPath} (${r.entriesRemoved} removed, ${formatSize(r.sizeReduction)} saved)`);
          } else {
            lines.push(`  ❌ ${r.inputPath}: ${r.error}`);
          }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n'),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ============================================================
// Utilities
// ============================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const key = fn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

// ============================================================
// Start Server
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MetaStrip MCP server failed to start:', err);
  process.exit(1);
});
