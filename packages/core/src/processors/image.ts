import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import ExifReader from 'exifreader';
import type {
  MetadataProcessor, InspectionResult, StripResult, StripOptions,
  MetadataEntry, MetadataCategory, MetadataStandard, RiskAssessment,
  RiskItem, GPSData, SupportedFormat, FileCategory,
} from '../types';

// Map of EXIF tags to privacy categories
const TAG_CATEGORIES: Record<string, MetadataCategory> = {
  GPSLatitude: 'gps', GPSLongitude: 'gps', GPSAltitude: 'gps',
  GPSLatitudeRef: 'gps', GPSLongitudeRef: 'gps', GPSAltitudeRef: 'gps',
  GPSTimeStamp: 'gps', GPSDateStamp: 'gps', GPSMapDatum: 'gps',
  GPSSpeed: 'gps', GPSSpeedRef: 'gps', GPSImgDirection: 'gps',
  GPSDestLatitude: 'gps', GPSDestLongitude: 'gps',

  Make: 'device', Model: 'device', LensMake: 'device', LensModel: 'device',
  BodySerialNumber: 'device', LensSerialNumber: 'device',
  CameraSerialNumber: 'device', InternalSerialNumber: 'device',
  ImageUniqueID: 'device', OwnerName: 'device',

  DateTime: 'timestamps', DateTimeOriginal: 'timestamps',
  DateTimeDigitized: 'timestamps', CreateDate: 'timestamps',
  ModifyDate: 'timestamps', SubSecTime: 'timestamps',

  Software: 'software', ProcessingSoftware: 'software',
  HostComputer: 'software', CreatorTool: 'software',
  HistorySoftwareAgent: 'software',

  Artist: 'author', Copyright: 'author', Author: 'author',
  Creator: 'author', Rights: 'author', CopyrightNotice: 'author',
  'By-line': 'author', Credit: 'author',

  // AI generation metadata
  'Dream': 'ai', 'ai:model': 'ai', 'ai:prompt': 'ai',
  'Parameters': 'ai', 'generation_data': 'ai',
  'stable-diffusion-webui': 'ai',
};

const RISK_LEVELS: Record<MetadataCategory, 'high' | 'medium' | 'low' | 'none'> = {
  gps: 'high',
  device: 'medium',
  timestamps: 'medium',
  software: 'low',
  author: 'medium',
  ai: 'low',
  icc: 'none',
  thumbnail: 'medium', // Thumbnails can contain original GPS data!
  xmp: 'low',
  iptc: 'low',
  other: 'low',
};

function categorizeTag(key: string): MetadataCategory {
  if (TAG_CATEGORIES[key]) return TAG_CATEGORIES[key];
  if (key.startsWith('GPS')) return 'gps';
  if (key.includes('Date') || key.includes('Time')) return 'timestamps';
  if (key.includes('Serial') || key.includes('Device')) return 'device';
  if (key.includes('Software') || key.includes('Tool')) return 'software';
  if (key.includes('Author') || key.includes('Copyright') || key.includes('Creator')) return 'author';
  if (key.includes('ICC') || key.includes('Profile')) return 'icc';
  return 'other';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'description' in (value as Record<string, unknown>)) {
    return String((value as Record<string, string>).description);
  }
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

function extractGPS(entries: MetadataEntry[]): GPSData | null {
  const gpsEntries = entries.filter(e => e.category === 'gps');
  const lat = gpsEntries.find(e => e.key === 'GPSLatitude');
  const lon = gpsEntries.find(e => e.key === 'GPSLongitude');

  if (!lat?.value || !lon?.value) return null;

  let latitude = typeof lat.value === 'number' ? lat.value : parseFloat(String(lat.value));
  let longitude = typeof lon.value === 'number' ? lon.value : parseFloat(String(lon.value));

  // Handle ExifReader's description format
  if (lat.value && typeof lat.value === 'object' && 'description' in (lat.value as Record<string, unknown>)) {
    latitude = parseFloat(String((lat.value as Record<string, string>).description));
  }
  if (lon.value && typeof lon.value === 'object' && 'description' in (lon.value as Record<string, unknown>)) {
    longitude = parseFloat(String((lon.value as Record<string, string>).description));
  }

  if (isNaN(latitude) || isNaN(longitude)) return null;

  // Apply hemisphere references
  const latRef = gpsEntries.find(e => e.key === 'GPSLatitudeRef');
  const lonRef = gpsEntries.find(e => e.key === 'GPSLongitudeRef');
  if (latRef && formatValue(latRef.value).includes('S')) latitude = -latitude;
  if (lonRef && formatValue(lonRef.value).includes('W')) longitude = -longitude;

  const altEntry = gpsEntries.find(e => e.key === 'GPSAltitude');
  const altitude = altEntry ? parseFloat(formatValue(altEntry.value)) : undefined;

  return { latitude, longitude, ...(altitude !== undefined && !isNaN(altitude) ? { altitude } : {}) };
}

function assessRisk(entries: MetadataEntry[], gps: GPSData | null): RiskAssessment {
  const risks: RiskItem[] = [];

  if (gps) {
    risks.push({
      category: 'gps',
      severity: 'critical',
      description: `File contains GPS coordinates (${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}). Anyone with this file can see exactly where it was taken.`,
      entries: entries.filter(e => e.category === 'gps').map(e => e.key),
    });
  }

  const deviceEntries = entries.filter(e => e.category === 'device');
  if (deviceEntries.length > 0) {
    const serialEntries = deviceEntries.filter(e => e.key.includes('Serial'));
    if (serialEntries.length > 0) {
      risks.push({
        category: 'device',
        severity: 'high',
        description: `File contains device serial number(s) that can uniquely identify your camera.`,
        entries: serialEntries.map(e => e.key),
      });
    } else {
      risks.push({
        category: 'device',
        severity: 'medium',
        description: `File contains device information (${deviceEntries.map(e => formatValue(e.value)).join(', ')}).`,
        entries: deviceEntries.map(e => e.key),
      });
    }
  }

  const authorEntries = entries.filter(e => e.category === 'author');
  if (authorEntries.length > 0) {
    risks.push({
      category: 'author',
      severity: 'medium',
      description: `File contains author/creator information.`,
      entries: authorEntries.map(e => e.key),
    });
  }

  const timestampEntries = entries.filter(e => e.category === 'timestamps');
  if (timestampEntries.length > 0) {
    risks.push({
      category: 'timestamps',
      severity: 'low',
      description: `File contains ${timestampEntries.length} timestamp(s) revealing when the photo was taken.`,
      entries: timestampEntries.map(e => e.key),
    });
  }

  // Calculate score
  const severityScores = { critical: 40, high: 25, medium: 15, low: 5 };
  const score = Math.min(100, risks.reduce((sum, r) => sum + severityScores[r.severity], 0));
  const level = score >= 60 ? 'critical' : score >= 40 ? 'high' : score >= 20 ? 'medium' : score > 0 ? 'low' : 'none';

  const summary = score === 0
    ? 'No privacy risks detected.'
    : `Found ${risks.length} privacy risk(s) with a score of ${score}/100. ${risks.filter(r => r.severity === 'critical').length > 0 ? 'CRITICAL: GPS location data found!' : ''}`;

  return { score, level, risks, summary };
}

function detectFormat(ext: string): SupportedFormat | 'unknown' {
  const map: Record<string, SupportedFormat> = {
    '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp',
    '.heic': 'heic', '.heif': 'heic', '.tiff': 'tiff', '.tif': 'tiff',
    '.gif': 'gif', '.avif': 'avif',
  };
  return map[ext.toLowerCase()] ?? 'unknown';
}

function detectMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.heic': 'image/heic', '.tiff': 'image/tiff',
    '.gif': 'image/gif', '.avif': 'image/avif',
  };
  return map[ext.toLowerCase()] ?? 'application/octet-stream';
}

export class ImageProcessor implements MetadataProcessor {
  supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tiff', '.tif', '.gif', '.avif'];

  canProcess(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  async inspect(filePath: string): Promise<InspectionResult> {
    const stat = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    let tags: Record<string, unknown> = {};
    try {
      tags = ExifReader.load(buffer, { expanded: false });
    } catch {
      // File might not have EXIF data — that's fine
    }

    const entries: MetadataEntry[] = [];
    const byCategory: Record<MetadataCategory, MetadataEntry[]> = {
      gps: [], device: [], timestamps: [], software: [], author: [],
      ai: [], icc: [], thumbnail: [], xmp: [], iptc: [], other: [],
    };
    const byStandard: Record<string, MetadataEntry[]> = {};
    const standardsSet = new Set<MetadataStandard>();

    for (const [key, value] of Object.entries(tags)) {
      if (key === 'MakerNote' || key === 'UserComment') continue; // Skip binary blobs

      const category = categorizeTag(key);
      const riskLevel = RISK_LEVELS[category];

      // Determine standard
      let standard: MetadataStandard = 'exif';
      if (key.startsWith('ICC') || key.includes('Profile')) standard = 'icc';
      // XMP and IPTC detection via ExifReader's tag grouping

      const entry: MetadataEntry = {
        key,
        label: key.replace(/([A-Z])/g, ' $1').trim(),
        value,
        displayValue: formatValue(value),
        standard,
        category,
        riskLevel,
      };

      entries.push(entry);
      byCategory[category].push(entry);
      if (!byStandard[standard]) byStandard[standard] = [];
      byStandard[standard].push(entry);
      standardsSet.add(standard);
    }

    const gps = extractGPS(entries);
    const risk = assessRisk(entries, gps);
    const isAIGenerated = entries.some(e => e.category === 'ai');

    return {
      filePath,
      fileType: detectFormat(ext),
      fileCategory: 'image' as FileCategory,
      fileSize: stat.size,
      mimeType: detectMimeType(ext),
      entries,
      byCategory: byCategory as Record<MetadataCategory, MetadataEntry[]>,
      byStandard: byStandard as Record<MetadataStandard, MetadataEntry[]>,
      gps,
      risk,
      standards: Array.from(standardsSet),
      totalEntries: entries.length,
      isAIGenerated,
      ...(isAIGenerated ? {
        aiDetails: {
          model: entries.find(e => e.key.includes('model') && e.category === 'ai')?.displayValue,
          prompt: entries.find(e => e.key.includes('prompt') && e.category === 'ai')?.displayValue,
        },
      } : {}),
    };
  }

  async strip(filePath: string, options: StripOptions = {}): Promise<StripResult> {
    const startTime = Date.now();
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    const outputPath = options.outputPath ?? path.join(dir, `${baseName}.cleaned${ext}`);

    try {
      // Inspect before stripping
      const beforeInspection = await this.inspect(filePath);

      // Determine which categories to remove
      const categoriesToRemove = new Set<MetadataCategory>(
        options.categories ?? ['gps', 'device', 'timestamps', 'software', 'author', 'ai', 'thumbnail', 'xmp', 'iptc', 'other']
      );

      // Remove kept categories
      if (options.keep) {
        for (const cat of options.keep) {
          categoriesToRemove.delete(cat);
        }
      }

      // Preserve ICC by default
      if (options.preserveColorProfile !== false) {
        categoriesToRemove.delete('icc');
      }

      // Use sharp to strip metadata
      let pipeline = sharp(filePath);

      // Remove all metadata except ICC if preserving color profile
      if (options.preserveColorProfile !== false) {
        pipeline = pipeline.keepIccProfile();
      }

      // rotate() with no args auto-rotates based on EXIF orientation then strips
      pipeline = pipeline.rotate();

      // Set output quality
      const quality = options.quality ?? 95;

      switch (ext) {
        case '.jpg':
        case '.jpeg':
          pipeline = pipeline.jpeg({ quality, mozjpeg: true });
          break;
        case '.png':
          pipeline = pipeline.png({ quality: Math.min(quality, 100) });
          break;
        case '.webp':
          pipeline = pipeline.webp({ quality });
          break;
        case '.avif':
          pipeline = pipeline.avif({ quality });
          break;
        case '.tiff':
        case '.tif':
          pipeline = pipeline.tiff({ quality });
          break;
        default:
          // For other formats, just output as-is
          break;
      }

      await pipeline.toFile(outputPath);

      // Inspect after to verify
      const afterInspection = await this.inspect(outputPath);
      const cleanedStat = await fs.stat(outputPath);

      // Calculate what was removed vs kept
      const removed = beforeInspection.entries.filter(e => categoriesToRemove.has(e.category));
      const kept = beforeInspection.entries.filter(e => !categoriesToRemove.has(e.category));
      const actuallyRemoved = beforeInspection.entries.filter(
        e => !afterInspection.entries.some(a => a.key === e.key)
      );

      return {
        success: true,
        outputPath,
        originalSize: beforeInspection.fileSize,
        cleanedSize: cleanedStat.size,
        sizeReduction: beforeInspection.fileSize - cleanedStat.size,
        sizeReductionPercent: ((beforeInspection.fileSize - cleanedStat.size) / beforeInspection.fileSize) * 100,
        entriesRemoved: actuallyRemoved.length,
        entriesKept: afterInspection.totalEntries,
        removed: actuallyRemoved,
        kept: afterInspection.entries,
        categoriesCleaned: Array.from(categoriesToRemove),
        processingTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        outputPath,
        originalSize: 0,
        cleanedSize: 0,
        sizeReduction: 0,
        sizeReductionPercent: 0,
        entriesRemoved: 0,
        entriesKept: 0,
        removed: [],
        kept: [],
        categoriesCleaned: [],
        processingTimeMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
