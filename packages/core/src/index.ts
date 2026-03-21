/**
 * @metastrip/core
 *
 * The core metadata processing engine for MetaStrip.
 * Handles reading, stripping, and comparing metadata across
 * images, videos, audio, and documents.
 *
 * @example
 * ```ts
 * import { MetaStrip } from '@metastrip/core';
 *
 * const ms = new MetaStrip();
 *
 * // Inspect a file
 * const report = await ms.inspect('photo.jpg');
 * console.log(report.gps);        // GPS coordinates
 * console.log(report.risk.score); // Privacy risk score
 *
 * // Strip all metadata
 * const result = await ms.strip('photo.jpg');
 * console.log(result.entriesRemoved); // How many entries removed
 *
 * // Strip selectively (keep copyright)
 * const result2 = await ms.strip('photo.jpg', { keep: ['author'] });
 *
 * // Compare before/after
 * const diff = await ms.compare('photo.jpg', 'photo.cleaned.jpg');
 * ```
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { ImageProcessor } from './processors/image';
import { VideoProcessor } from './processors/video';
import type {
  MetadataProcessor, InspectionResult, StripResult, StripOptions,
  CompareResult, BatchOptions, BatchResult, FileCategory,
} from './types';

// Re-export all types
export * from './types';
export { ImageProcessor } from './processors/image';
export { VideoProcessor } from './processors/video';

export class MetaStrip {
  private processors: MetadataProcessor[] = [];

  constructor() {
    this.processors = [
      new ImageProcessor(),
      new VideoProcessor(),
    ];
  }

  /**
   * Register a custom processor for additional file types
   */
  registerProcessor(processor: MetadataProcessor): void {
    this.processors.unshift(processor); // Custom processors take priority
  }

  /**
   * Get the appropriate processor for a file
   */
  private getProcessor(filePath: string): MetadataProcessor | null {
    return this.processors.find(p => p.canProcess(filePath)) ?? null;
  }

  /**
   * Detect the file category based on extension
   */
  detectCategory(filePath: string): FileCategory {
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.tif', '.gif', '.avif'];
    const videoExts = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'];
    const audioExts = ['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a'];
    const docExts = ['.pdf', '.docx', '.xlsx', '.pptx'];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (docExts.includes(ext)) return 'document';
    return 'unknown';
  }

  /**
   * Check if a file type is supported
   */
  isSupported(filePath: string): boolean {
    return this.getProcessor(filePath) !== null;
  }

  /**
   * Get all supported file extensions
   */
  getSupportedExtensions(): string[] {
    return this.processors.flatMap(p => p.supportedExtensions);
  }

  /**
   * Inspect a file's metadata without modifying it
   */
  async inspect(filePath: string): Promise<InspectionResult> {
    // Verify file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    const processor = this.getProcessor(filePath);
    if (!processor) {
      const ext = path.extname(filePath);
      throw new Error(
        `Unsupported file type: ${ext}. Supported formats: ${this.getSupportedExtensions().join(', ')}`
      );
    }

    return processor.inspect(filePath);
  }

  /**
   * Strip metadata from a file
   */
  async strip(filePath: string, options: StripOptions = {}): Promise<StripResult> {
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    const processor = this.getProcessor(filePath);
    if (!processor) {
      const ext = path.extname(filePath);
      throw new Error(
        `Unsupported file type: ${ext}. Supported formats: ${this.getSupportedExtensions().join(', ')}`
      );
    }

    return processor.strip(filePath, options);
  }

  /**
   * Compare metadata between two files (typically original and cleaned)
   */
  async compare(originalPath: string, cleanedPath: string): Promise<CompareResult> {
    const [before, after] = await Promise.all([
      this.inspect(originalPath),
      this.inspect(cleanedPath),
    ]);

    const afterKeys = new Set(after.entries.map(e => e.key));
    const beforeKeys = new Set(before.entries.map(e => e.key));

    const removed = before.entries.filter(e => !afterKeys.has(e.key));
    const added = after.entries.filter(e => !beforeKeys.has(e.key));
    const modified: CompareResult['modified'] = [];
    const unchanged: CompareResult['unchanged'] = [];

    for (const entry of before.entries) {
      if (afterKeys.has(entry.key)) {
        const afterEntry = after.entries.find(e => e.key === entry.key)!;
        if (entry.displayValue !== afterEntry.displayValue) {
          modified.push({ key: entry.key, before: entry, after: afterEntry });
        } else {
          unchanged.push(entry);
        }
      }
    }

    return {
      removed,
      added,
      modified,
      unchanged,
      riskBefore: before.risk,
      riskAfter: after.risk,
    };
  }

  /**
   * Process multiple files in batch
   */
  async batch(filePaths: string[], options: BatchOptions = {}): Promise<BatchResult> {
    const startTime = Date.now();
    const concurrency = options.concurrency ?? 4;
    const continueOnError = options.continueOnError ?? true;
    const results: BatchResult['results'] = [];

    // Process in chunks for concurrency control
    for (let i = 0; i < filePaths.length; i += concurrency) {
      const chunk = filePaths.slice(i, i + concurrency);
      const chunkPromises = chunk.map(async (inputPath) => {
        const stripOptions: StripOptions = { ...options };
        if (options.outputDir) {
          const ext = path.extname(inputPath);
          const baseName = path.basename(inputPath, ext);
          stripOptions.outputPath = path.join(options.outputDir, `${baseName}.cleaned${ext}`);
        }

        try {
          const result = await this.strip(inputPath, stripOptions);
          return { ...result, inputPath };
        } catch (err) {
          if (!continueOnError) throw err;
          return {
            success: false,
            inputPath,
            outputPath: stripOptions.outputPath ?? '',
            originalSize: 0, cleanedSize: 0, sizeReduction: 0, sizeReductionPercent: 0,
            entriesRemoved: 0, entriesKept: 0, removed: [], kept: [],
            categoriesCleaned: [],
            processingTimeMs: 0,
            error: err instanceof Error ? err.message : String(err),
          } as BatchResult['results'][0];
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return {
      totalFiles: filePaths.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
      results,
      totalProcessingTimeMs: Date.now() - startTime,
      totalEntriesRemoved: results.reduce((sum, r) => sum + r.entriesRemoved, 0),
      totalSizeReduction: results.reduce((sum, r) => sum + r.sizeReduction, 0),
    };
  }
}

// Default export for convenience
export default MetaStrip;
