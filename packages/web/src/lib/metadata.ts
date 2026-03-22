import ExifReader from 'exifreader';
import JSZip from 'jszip';
import { categorizeTag, RISK_LEVELS, type MetadataCategory, type RiskLevel } from './categories';
import { isZip } from './strip-office';
import { isPdf } from './strip-pdf';

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

function makeEntry(key: string, value: string): MetadataEntry {
  const category = categorizeTag(key);
  return {
    key,
    label: key.replace(/([A-Z])/g, ' $1').trim(),
    value,
    category,
    risk: RISK_LEVELS[category],
  };
}

/** Extract text content from a simple XML element, e.g. <dc:creator>Alice</dc:creator> */
function extractXmlText(xml: string, tag: string): string | null {
  // Match both namespaced and plain tags
  const patterns = [
    new RegExp(`<[^>]*:${tag}[^>]*>([^<]*)<\/[^>]*:${tag}>`, 'i'),
    new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

/** Extract an attribute value from an XML element */
function extractXmlAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<[^>]*:?${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

async function analyzeOfficeFile(buffer: ArrayBuffer, fileName: string): Promise<FileAnalysis> {
  const zip = await JSZip.loadAsync(buffer);
  const entries: MetadataEntry[] = [];

  // Parse docProps/core.xml — Dublin Core metadata
  const coreFile = zip.file('docProps/core.xml');
  if (coreFile) {
    const xml = await coreFile.async('string');

    const coreFields: Array<[string, string]> = [
      ['creator', 'Creator'],
      ['lastModifiedBy', 'Last Modified By'],
      ['title', 'Title'],
      ['subject', 'Subject'],
      ['description', 'Description'],
      ['keywords', 'Keywords'],
      ['category', 'Category'],
      ['contentStatus', 'Content Status'],
      ['revision', 'Revision'],
      ['created', 'Created'],
      ['modified', 'Modified'],
    ];

    for (const [tag, label] of coreFields) {
      const val = extractXmlText(xml, tag);
      if (val) {
        const isTimestamp = tag === 'created' || tag === 'modified';
        const isRevision = tag === 'revision';
        const isAuthor = tag === 'creator' || tag === 'lastModifiedBy';

        let category: MetadataCategory;
        if (isTimestamp) category = 'timestamps';
        else if (isRevision) category = 'other';
        else if (isAuthor) category = 'author';
        else category = 'other';

        entries.push({
          key: tag,
          label,
          value: val,
          category,
          risk: RISK_LEVELS[category],
        });
      }
    }
  }

  // Parse docProps/app.xml — application metadata
  const appFile = zip.file('docProps/app.xml');
  if (appFile) {
    const xml = await appFile.async('string');

    const appFields: Array<[string, string, MetadataCategory]> = [
      ['Application', 'Application', 'software'],
      ['AppVersion', 'App Version', 'software'],
      ['Company', 'Company', 'author'],
      ['Manager', 'Manager', 'author'],
      ['TotalTime', 'Total Editing Time (min)', 'other'],
      ['Template', 'Template', 'other'],
      ['DocSecurity', 'Document Security', 'other'],
    ];

    for (const [tag, label, category] of appFields) {
      const val = extractXmlText(xml, tag);
      if (val) {
        entries.push({
          key: tag,
          label,
          value: val,
          category,
          risk: RISK_LEVELS[category],
        });
      }
    }
  }

  // Parse docProps/custom.xml — custom properties (key-value pairs)
  const customFile = zip.file('docProps/custom.xml');
  if (customFile) {
    const xml = await customFile.async('string');
    // Each property: <vt:property fmtid="..." pid="..." name="PropName"><vt:lpwstr>Value</vt:lpwstr></vt:property>
    const propRe = /<[^>]*:?property[^>]*\sname="([^"]*)"[^>]*>([\s\S]*?)<\/[^>]*:?property>/gi;
    let match;
    while ((match = propRe.exec(xml)) !== null) {
      const propName = match[1].trim();
      // Extract inner text from any vt: element
      const innerMatch = match[2].match(/<[^>]+>([^<]*)<\/[^>]+>/);
      const val = innerMatch ? innerMatch[1].trim() : '';
      if (propName && val) {
        entries.push(makeEntry(propName, val));
      }
    }
  }

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
    fileName,
    fileSize: buffer.byteLength,
    entries,
    gps: null,
    riskScore,
    riskLevel,
    isAI,
    byCategory,
  };
}

const PDF_INFO_KEYS: Array<[string, string, MetadataCategory]> = [
  ['Author', 'Author', 'author'],
  ['Creator', 'Creator', 'software'],
  ['Producer', 'Producer', 'software'],
  ['Title', 'Title', 'other'],
  ['Subject', 'Subject', 'other'],
  ['Keywords', 'Keywords', 'other'],
  ['Company', 'Company', 'author'],
  ['Manager', 'Manager', 'author'],
  ['SourceModified', 'Source Modified', 'other'],
  ['CreationDate', 'Creation Date', 'timestamps'],
  ['ModDate', 'Modified Date', 'timestamps'],
];

function analyzePdfBuffer(buffer: ArrayBuffer, fileName: string): FileAnalysis {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }

  const entries: MetadataEntry[] = [];

  for (const [key, label, category] of PDF_INFO_KEYS) {
    // Parenthesized form: /Key (value)
    const re = new RegExp('/' + key + '\\s*\\(([^)]*?)\\)');
    const m = str.match(re);
    if (m && m[1].trim()) {
      entries.push({
        key,
        label,
        value: m[1].trim(),
        category,
        risk: RISK_LEVELS[category],
      });
      continue;
    }

    // Hex form: /Key <hex>
    const hexRe = new RegExp('/' + key + '\\s*<([0-9a-fA-F]+)>');
    const hexM = str.match(hexRe);
    if (hexM && hexM[1]) {
      // Decode hex string to text
      const hex = hexM[1];
      let decoded = '';
      for (let i = 0; i < hex.length; i += 2) {
        decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      }
      if (decoded.trim()) {
        entries.push({
          key,
          label,
          value: decoded.trim(),
          category,
          risk: RISK_LEVELS[category],
        });
      }
    }
  }

  // Also check for XMP creator/title in the stream
  const xmpStart = str.indexOf('<?xpacket begin');
  if (xmpStart !== -1) {
    const xmpEnd = str.indexOf('<?xpacket end', xmpStart);
    if (xmpEnd !== -1) {
      const xmpContent = str.slice(xmpStart, xmpEnd);
      const xmpFields: Array<[string, string, string, MetadataCategory]> = [
        ['creator', 'dc:creator', 'XMP Creator', 'author'],
        ['title', 'dc:title', 'XMP Title', 'other'],
        ['description', 'dc:description', 'XMP Description', 'other'],
        ['subject', 'dc:subject', 'XMP Subject', 'other'],
      ];
      for (const [key, tag, label, category] of xmpFields) {
        const val = extractXmlText(xmpContent, tag.split(':')[1]);
        if (val && !entries.some((e) => e.key === key)) {
          entries.push({
            key: 'XMP_' + key,
            label,
            value: val,
            category,
            risk: RISK_LEVELS[category],
          });
        }
      }
    }
  }

  const riskScore = computeRiskScore(entries);
  const riskLevel = scoreToLevel(riskScore);
  const isAI = false;

  const byCategory: Record<MetadataCategory, MetadataEntry[]> = {} as Record<MetadataCategory, MetadataEntry[]>;
  for (const cat of ALL_CATEGORIES) {
    byCategory[cat] = [];
  }
  for (const entry of entries) {
    byCategory[entry.category].push(entry);
  }

  return {
    fileName,
    fileSize: buffer.byteLength,
    entries,
    gps: null,
    riskScore,
    riskLevel,
    isAI,
    byCategory,
  };
}

export async function analyzeFile(file: File): Promise<FileAnalysis> {
  const buffer = await file.arrayBuffer();

  // PDF documents
  if (isPdf(buffer)) {
    return analyzePdfBuffer(buffer, file.name);
  }

  // Office documents (DOCX, XLSX, PPTX) are ZIP archives
  const lower = file.name.toLowerCase();
  if (isZip(buffer) && (lower.endsWith('.docx') || lower.endsWith('.xlsx') || lower.endsWith('.pptx'))) {
    return analyzeOfficeFile(buffer, file.name);
  }

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
