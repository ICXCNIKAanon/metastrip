/**
 * MetaStrip Core Types
 *
 * These types define the contract for all metadata operations across
 * every surface (CLI, MCP, API, Web). Any change here propagates everywhere.
 */

// ============================================================
// Metadata Categories
// ============================================================

export type MetadataCategory =
  | 'gps'         // GPS coordinates, altitude, direction
  | 'device'      // Camera make/model, lens, serial number
  | 'timestamps'  // Date taken, date modified, date digitized
  | 'software'    // Software used, editing history
  | 'author'      // Author name, copyright, artist
  | 'ai'          // AI generation metadata (model, prompt, parameters)
  | 'icc'         // ICC color profiles
  | 'thumbnail'   // Embedded thumbnails (can contain original GPS!)
  | 'xmp'         // XMP sidecar data
  | 'iptc'        // IPTC news/press metadata
  | 'other';      // Anything we can't categorize

export type MetadataStandard = 'exif' | 'xmp' | 'iptc' | 'icc' | 'id3' | 'pdf-info' | 'docx-core' | 'unknown';

// ============================================================
// File Types
// ============================================================

export type SupportedImageFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'tiff' | 'gif' | 'avif';
export type SupportedVideoFormat = 'mp4' | 'mov' | 'mkv' | 'avi' | 'webm';
export type SupportedAudioFormat = 'mp3' | 'flac' | 'wav' | 'ogg' | 'aac';
export type SupportedDocFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx';
export type SupportedFormat = SupportedImageFormat | SupportedVideoFormat | SupportedAudioFormat | SupportedDocFormat;

export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'unknown';

// ============================================================
// Metadata Entry
// ============================================================

export interface MetadataEntry {
  /** The metadata key (e.g., "GPSLatitude", "Make", "Software") */
  key: string;
  /** Human-readable label (e.g., "GPS Latitude", "Camera Make") */
  label: string;
  /** The raw value */
  value: unknown;
  /** Human-readable formatted value */
  displayValue: string;
  /** Which metadata standard this comes from */
  standard: MetadataStandard;
  /** Privacy risk category */
  category: MetadataCategory;
  /** Privacy risk level for this specific field */
  riskLevel: 'high' | 'medium' | 'low' | 'none';
}

// ============================================================
// Risk Assessment
// ============================================================

export interface RiskAssessment {
  /** Overall risk score 0-100 */
  score: number;
  /** Risk level label */
  level: 'critical' | 'high' | 'medium' | 'low' | 'none';
  /** Specific risks found */
  risks: RiskItem[];
  /** Summary for display */
  summary: string;
}

export interface RiskItem {
  category: MetadataCategory;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  /** The specific metadata entries that contribute to this risk */
  entries: string[];
}

// ============================================================
// GPS Data
// ============================================================

export interface GPSData {
  latitude: number;
  longitude: number;
  altitude?: number;
  /** Human-readable location string (reverse geocoded if available) */
  locationString?: string;
}

// ============================================================
// Inspection Result
// ============================================================

export interface InspectionResult {
  /** Original file path or name */
  filePath: string;
  /** Detected file type */
  fileType: SupportedFormat | 'unknown';
  /** File category */
  fileCategory: FileCategory;
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** All metadata entries found */
  entries: MetadataEntry[];
  /** Entries grouped by category */
  byCategory: Record<MetadataCategory, MetadataEntry[]>;
  /** Entries grouped by standard */
  byStandard: Record<MetadataStandard, MetadataEntry[]>;
  /** GPS data if found */
  gps: GPSData | null;
  /** Privacy risk assessment */
  risk: RiskAssessment;
  /** Metadata standards present in this file */
  standards: MetadataStandard[];
  /** Total count of metadata entries */
  totalEntries: number;
  /** Whether AI generation metadata was detected */
  isAIGenerated: boolean;
  /** AI generation details if detected */
  aiDetails?: {
    model?: string;
    prompt?: string;
    parameters?: Record<string, unknown>;
  };
}

// ============================================================
// Strip Options & Result
// ============================================================

export interface StripOptions {
  /** Which categories to remove. Default: all */
  categories?: MetadataCategory[];
  /** Categories to explicitly keep (overrides categories) */
  keep?: MetadataCategory[];
  /** Output file path. Default: {name}.cleaned.{ext} */
  outputPath?: string;
  /** Whether to preserve ICC color profiles. Default: true */
  preserveColorProfile?: boolean;
  /** Whether to remove embedded thumbnails. Default: true */
  removeThumbnails?: boolean;
  /** Image quality for lossy formats (1-100). Default: 95 */
  quality?: number;
}

export interface StripResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Path to the cleaned file */
  outputPath: string;
  /** Original file size */
  originalSize: number;
  /** Cleaned file size */
  cleanedSize: number;
  /** Size reduction in bytes */
  sizeReduction: number;
  /** Size reduction as percentage */
  sizeReductionPercent: number;
  /** Number of metadata entries removed */
  entriesRemoved: number;
  /** Number of metadata entries kept */
  entriesKept: number;
  /** Detailed list of what was removed */
  removed: MetadataEntry[];
  /** Detailed list of what was kept */
  kept: MetadataEntry[];
  /** Categories that were cleaned */
  categoriesCleaned: MetadataCategory[];
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Error message if success is false */
  error?: string;
}

// ============================================================
// Comparison / Diff
// ============================================================

export interface CompareResult {
  /** Entries that were removed */
  removed: MetadataEntry[];
  /** Entries that were added (shouldn't happen normally) */
  added: MetadataEntry[];
  /** Entries that were modified */
  modified: Array<{ key: string; before: MetadataEntry; after: MetadataEntry }>;
  /** Entries unchanged */
  unchanged: MetadataEntry[];
  /** Risk assessment before */
  riskBefore: RiskAssessment;
  /** Risk assessment after */
  riskAfter: RiskAssessment;
}

// ============================================================
// Batch Processing
// ============================================================

export interface BatchOptions extends StripOptions {
  /** Maximum concurrent file processing */
  concurrency?: number;
  /** Continue on error (don't stop batch) */
  continueOnError?: boolean;
  /** Output directory for cleaned files */
  outputDir?: string;
}

export interface BatchResult {
  /** Total files processed */
  totalFiles: number;
  /** Files successfully cleaned */
  successCount: number;
  /** Files that failed */
  failureCount: number;
  /** Individual results */
  results: Array<StripResult & { inputPath: string }>;
  /** Total processing time */
  totalProcessingTimeMs: number;
  /** Summary of all metadata removed */
  totalEntriesRemoved: number;
  /** Total size saved */
  totalSizeReduction: number;
}

// ============================================================
// Processor Interface
// ============================================================

export interface MetadataProcessor {
  /** Supported file extensions */
  supportedExtensions: string[];
  /** Inspect file metadata */
  inspect(filePath: string): Promise<InspectionResult>;
  /** Strip metadata from file */
  strip(filePath: string, options?: StripOptions): Promise<StripResult>;
  /** Check if this processor can handle the given file */
  canProcess(filePath: string): boolean;
}
