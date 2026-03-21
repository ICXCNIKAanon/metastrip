import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  MetadataProcessor, InspectionResult, StripResult, StripOptions,
  MetadataEntry, MetadataCategory, MetadataStandard, GPSData,
  FileCategory, SupportedFormat,
} from '../types';

const execFileAsync = promisify(execFile);

/**
 * Video processor using ffmpeg/ffprobe for metadata operations.
 * FFmpeg is required to be installed on the system.
 */
export class VideoProcessor implements MetadataProcessor {
  supportedExtensions = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'];

  canProcess(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  private async checkFfmpeg(): Promise<boolean> {
    try {
      await execFileAsync('ffprobe', ['-version']);
      return true;
    } catch {
      return false;
    }
  }

  async inspect(filePath: string): Promise<InspectionResult> {
    const stat = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (!await this.checkFfmpeg()) {
      throw new Error('ffprobe is required for video metadata inspection. Install ffmpeg: https://ffmpeg.org/download.html');
    }

    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);

    const probeData = JSON.parse(stdout);
    const entries: MetadataEntry[] = [];
    const byCategory: Record<MetadataCategory, MetadataEntry[]> = {
      gps: [], device: [], timestamps: [], software: [], author: [],
      ai: [], icc: [], thumbnail: [], xmp: [], iptc: [], other: [],
    };

    // Extract format-level metadata
    if (probeData.format?.tags) {
      for (const [key, value] of Object.entries(probeData.format.tags)) {
        const category = categorizeVideoTag(key);
        const entry: MetadataEntry = {
          key,
          label: key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim(),
          value,
          displayValue: String(value),
          standard: 'unknown' as MetadataStandard,
          category,
          riskLevel: category === 'gps' ? 'high' : category === 'device' ? 'medium' : 'low',
        };
        entries.push(entry);
        byCategory[category].push(entry);
      }
    }

    // Extract stream-level metadata
    for (const stream of (probeData.streams ?? [])) {
      if (stream.tags) {
        for (const [key, value] of Object.entries(stream.tags)) {
          if (entries.some(e => e.key === key)) continue; // Skip duplicates
          const category = categorizeVideoTag(key);
          const entry: MetadataEntry = {
            key: `stream:${key}`,
            label: `Stream: ${key.replace(/_/g, ' ')}`,
            value,
            displayValue: String(value),
            standard: 'unknown' as MetadataStandard,
            category,
            riskLevel: category === 'gps' ? 'high' : 'low',
          };
          entries.push(entry);
          byCategory[category].push(entry);
        }
      }
    }

    // Try to extract GPS from common locations
    const gps = extractVideoGPS(entries);

    const risk = {
      score: gps ? 60 : entries.length > 5 ? 30 : 10,
      level: (gps ? 'critical' : entries.length > 5 ? 'medium' : 'low') as 'critical' | 'high' | 'medium' | 'low' | 'none',
      risks: gps ? [{
        category: 'gps' as MetadataCategory,
        severity: 'critical' as const,
        description: `Video contains GPS location data`,
        entries: entries.filter(e => e.category === 'gps').map(e => e.key),
      }] : [],
      summary: gps ? 'CRITICAL: Video contains GPS location data.' : `Found ${entries.length} metadata entries.`,
    };

    return {
      filePath,
      fileType: detectVideoFormat(ext),
      fileCategory: 'video' as FileCategory,
      fileSize: stat.size,
      mimeType: detectVideoMime(ext),
      entries,
      byCategory,
      byStandard: { unknown: entries, exif: [], xmp: [], iptc: [], icc: [], id3: [], 'pdf-info': [], 'docx-core': [] } as Record<MetadataStandard, MetadataEntry[]>,
      gps,
      risk,
      standards: ['unknown'],
      totalEntries: entries.length,
      isAIGenerated: false,
    };
  }

  async strip(filePath: string, options: StripOptions = {}): Promise<StripResult> {
    const startTime = Date.now();
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    const outputPath = options.outputPath ?? path.join(dir, `${baseName}.cleaned${ext}`);

    if (!await this.checkFfmpeg()) {
      return {
        success: false,
        outputPath,
        originalSize: 0, cleanedSize: 0, sizeReduction: 0, sizeReductionPercent: 0,
        entriesRemoved: 0, entriesKept: 0, removed: [], kept: [],
        categoriesCleaned: [], processingTimeMs: Date.now() - startTime,
        error: 'ffmpeg is required for video metadata removal. Install: https://ffmpeg.org/download.html',
      };
    }

    try {
      const beforeInspection = await this.inspect(filePath);

      // ffmpeg: copy streams, strip all metadata
      await execFileAsync('ffmpeg', [
        '-i', filePath,
        '-map_metadata', '-1',  // Strip all metadata
        '-c', 'copy',           // Copy streams without re-encoding (fast!)
        '-y',                   // Overwrite output
        outputPath,
      ]);

      const afterInspection = await this.inspect(outputPath);
      const cleanedStat = await fs.stat(outputPath);

      const removed = beforeInspection.entries.filter(
        e => !afterInspection.entries.some(a => a.key === e.key)
      );

      return {
        success: true,
        outputPath,
        originalSize: beforeInspection.fileSize,
        cleanedSize: cleanedStat.size,
        sizeReduction: beforeInspection.fileSize - cleanedStat.size,
        sizeReductionPercent: ((beforeInspection.fileSize - cleanedStat.size) / beforeInspection.fileSize) * 100,
        entriesRemoved: removed.length,
        entriesKept: afterInspection.totalEntries,
        removed,
        kept: afterInspection.entries,
        categoriesCleaned: [...new Set(removed.map(e => e.category))],
        processingTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        outputPath,
        originalSize: 0, cleanedSize: 0, sizeReduction: 0, sizeReductionPercent: 0,
        entriesRemoved: 0, entriesKept: 0, removed: [], kept: [],
        categoriesCleaned: [], processingTimeMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function categorizeVideoTag(key: string): MetadataCategory {
  const lower = key.toLowerCase();
  if (lower.includes('gps') || lower.includes('location') || lower.includes('coordinates')) return 'gps';
  if (lower.includes('date') || lower.includes('time') || lower.includes('creation')) return 'timestamps';
  if (lower.includes('make') || lower.includes('model') || lower.includes('device') || lower.includes('serial')) return 'device';
  if (lower.includes('software') || lower.includes('encoder') || lower.includes('handler') || lower.includes('tool')) return 'software';
  if (lower.includes('author') || lower.includes('artist') || lower.includes('copyright') || lower.includes('creator')) return 'author';
  return 'other';
}

function extractVideoGPS(entries: MetadataEntry[]): GPSData | null {
  const gpsEntry = entries.find(e => e.category === 'gps' && (
    e.key.toLowerCase().includes('location') || e.key.toLowerCase().includes('coordinates')
  ));
  if (!gpsEntry) return null;

  // Try to parse common GPS formats: "+37.7749-122.4194/" or "37.7749, -122.4194"
  const val = String(gpsEntry.value);
  const isoMatch = val.match(/([+-]\d+\.\d+)([+-]\d+\.\d+)/);
  if (isoMatch) {
    return { latitude: parseFloat(isoMatch[1]), longitude: parseFloat(isoMatch[2]) };
  }

  const commaMatch = val.match(/([-\d.]+)\s*,\s*([-\d.]+)/);
  if (commaMatch) {
    return { latitude: parseFloat(commaMatch[1]), longitude: parseFloat(commaMatch[2]) };
  }

  return null;
}

function detectVideoFormat(ext: string): SupportedFormat | 'unknown' {
  const map: Record<string, SupportedFormat> = {
    '.mp4': 'mp4', '.m4v': 'mp4', '.mov': 'mov', '.mkv': 'mkv',
    '.avi': 'avi', '.webm': 'webm',
  };
  return map[ext.toLowerCase()] ?? 'unknown';
}

function detectVideoMime(ext: string): string {
  const map: Record<string, string> = {
    '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.webm': 'video/webm',
  };
  return map[ext.toLowerCase()] ?? 'video/mp4';
}
