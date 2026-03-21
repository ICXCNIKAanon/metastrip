import ExifReader from 'exifreader';
import { categorizeTag, RISK_LEVELS, type MetadataCategory, type RiskLevel } from './categories';

export interface MetadataEntry {
  key: string;
  label: string;
  value: string;
  category: MetadataCategory;
  risk: RiskLevel;
}

export interface GPSData {
  lat: number;
  lon: number;
  alt?: number;
}

export interface FileAnalysis {
  fileName: string;
  fileSize: number;
  entries: MetadataEntry[];
  gps: GPSData | null;
  riskScore: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
  isAI: boolean;
  byCategory: Record<MetadataCategory, MetadataEntry[]>;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if ('description' in obj) return String(obj.description);
  }
  if (Array.isArray(value)) return value.map((v) => formatValue(v)).join(', ');
  return String(value);
}

function extractGPS(tags: Record<string, unknown>): GPSData | null {
  const latTag = tags['GPSLatitude'] as Record<string, unknown> | undefined;
  const lonTag = tags['GPSLongitude'] as Record<string, unknown> | undefined;
  if (!latTag || !lonTag) return null;

  const latRef = tags['GPSLatitudeRef'] as Record<string, unknown> | undefined;
  const lonRef = tags['GPSLongitudeRef'] as Record<string, unknown> | undefined;

  const latDescription = latTag['description'];
  const lonDescription = lonTag['description'];

  if (latDescription === undefined || lonDescription === undefined) return null;

  let lat = parseFloat(String(latDescription));
  let lon = parseFloat(String(lonDescription));

  if (isNaN(lat) || isNaN(lon)) return null;

  const latRefVal = latRef ? String(latRef['description'] ?? latRef['value'] ?? '') : '';
  const lonRefVal = lonRef ? String(lonRef['description'] ?? lonRef['value'] ?? '') : '';

  if (latRefVal.toUpperCase().startsWith('S')) lat = -lat;
  if (lonRefVal.toUpperCase().startsWith('W')) lon = -lon;

  const result: GPSData = { lat, lon };

  const altTag = tags['GPSAltitude'] as Record<string, unknown> | undefined;
  if (altTag?.['description'] !== undefined) {
    const alt = parseFloat(String(altTag['description']));
    if (!isNaN(alt)) result.alt = alt;
  }

  return result;
}

function computeRiskScore(entries: MetadataEntry[]): number {
  let score = 0;
  const categories = new Set(entries.map((e) => e.category));
  const keys = entries.map((e) => e.key);

  if (categories.has('gps')) score += 40;
  if (keys.some((k) => k.toLowerCase().includes('serial'))) score += 25;
  if (categories.has('device')) score += 15;
  if (categories.has('author')) score += 10;
  if (categories.has('timestamps')) score += 5;

  return Math.min(score, 100);
}

function scoreToLevel(score: number): FileAnalysis['riskLevel'] {
  if (score >= 60) return 'critical';
  if (score >= 40) return 'high';
  if (score >= 20) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

const ALL_CATEGORIES: MetadataCategory[] = [
  'gps', 'device', 'timestamps', 'software', 'author',
  'ai', 'icc', 'thumbnail', 'xmp', 'iptc', 'other',
];

export async function analyzeFile(file: File): Promise<FileAnalysis> {
  const buffer = await file.arrayBuffer();

  // Use expanded mode for properly structured GPS values
  const expanded = await ExifReader.load(buffer, { expanded: true });

  // Flatten all expanded groups into a single tag map
  const flatTags: Record<string, unknown> = {};
  for (const group of Object.values(expanded)) {
    if (group && typeof group === 'object') {
      for (const [k, v] of Object.entries(group as Record<string, unknown>)) {
        flatTags[k] = v;
      }
    }
  }

  const entries: MetadataEntry[] = [];

  for (const [key, raw] of Object.entries(flatTags)) {
    // Skip internal/file-level tags that aren't true metadata fields
    if (key === 'base64' || key === 'Thumbnail') continue;

    const value = formatValue(raw);
    if (!value) continue;

    const category = categorizeTag(key);
    const risk = RISK_LEVELS[category];

    entries.push({
      key,
      label: key.replace(/([A-Z])/g, ' $1').trim(),
      value,
      category,
      risk,
    });
  }

  const gps = extractGPS(flatTags);
  const riskScore = computeRiskScore(entries);
  const riskLevel = scoreToLevel(riskScore);
  const isAI = entries.some((e) => e.category === 'ai');

  const byCategory: Record<MetadataCategory, MetadataEntry[]> = {} as Record<MetadataCategory, MetadataEntry[]>;
  for (const cat of ALL_CATEGORIES) {
    byCategory[cat] = [];
  }
  for (const entry of entries) {
    byCategory[entry.category].push(entry);
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    entries,
    gps,
    riskScore,
    riskLevel,
    isAI,
    byCategory,
  };
}
