import ExifReader from 'exifreader';
import JSZip from 'jszip';
import { categorizeTag, RISK_LEVELS, type MetadataCategory, type RiskLevel } from './categories';
import { isZip } from './strip-office';
import { isPdf } from './strip-pdf';
import { isMp3 } from './strip-mp3';
import { isWav } from './strip-wav';
import { isFlac } from './strip-flac';
import { isMp4 } from './strip-mp4';
import { isHeic } from './strip-heic';
import { isAvif } from './strip-avif';
import { isM4a } from './strip-m4a';
import { isAvi } from './strip-avi';
import { isMkv } from './strip-mkv';
import { isEpub } from './strip-epub';

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

  // Check for comments (DOCX)
  const docxCommentFiles = ['word/comments.xml', 'word/commentsExtended.xml', 'word/commentsIds.xml'];
  for (const commentFile of docxCommentFiles) {
    if (zip.file(commentFile)) {
      const xml = await zip.file(commentFile)!.async('string');
      // Count comment elements
      const commentMatches = xml.match(/<w:comment\b/g);
      const count = commentMatches ? commentMatches.length : 1;
      entries.push({
        key: 'DocxComments',
        label: 'Comments',
        value: `${count} comment(s) found in ${commentFile}`,
        category: 'author',
        risk: RISK_LEVELS['author'],
      });
      break; // only report once for the first found file
    }
  }

  // Check for comments (XLSX)
  let xlsxCommentFound = false;
  zip.forEach((relativePath, _file) => {
    if (!xlsxCommentFound && /^xl\/comments\d*\.xml$/.test(relativePath)) {
      xlsxCommentFound = true;
      entries.push({
        key: 'XlsxComments',
        label: 'Spreadsheet Comments',
        value: `Comments found in ${relativePath}`,
        category: 'author',
        risk: RISK_LEVELS['author'],
      });
    }
  });

  // Check for threaded comments (XLSX)
  let threadedCommentFound = false;
  zip.forEach((relativePath, _file) => {
    if (!threadedCommentFound && relativePath.startsWith('xl/threadedComments/')) {
      threadedCommentFound = true;
      entries.push({
        key: 'XlsxThreadedComments',
        label: 'Threaded Comments',
        value: `Threaded comments found (${relativePath})`,
        category: 'author',
        risk: RISK_LEVELS['author'],
      });
    }
  });

  // Check for comments (PPTX)
  let pptxCommentFound = false;
  zip.forEach((relativePath, _file) => {
    if (!pptxCommentFound && relativePath.startsWith('ppt/comments/')) {
      pptxCommentFound = true;
      entries.push({
        key: 'PptxComments',
        label: 'Slide Comments',
        value: `Comments found in ${relativePath}`,
        category: 'author',
        risk: RISK_LEVELS['author'],
      });
    }
  });

  // Check for comment authors (PPTX)
  if (zip.file('ppt/commentAuthors.xml')) {
    const xml = await zip.file('ppt/commentAuthors.xml')!.async('string');
    const authorMatches = xml.match(/<p:cmAuthor\b/g);
    const count = authorMatches ? authorMatches.length : 1;
    entries.push({
      key: 'PptxCommentAuthors',
      label: 'Comment Authors',
      value: `${count} comment author(s) in ppt/commentAuthors.xml`,
      category: 'author',
      risk: RISK_LEVELS['author'],
    });
  }

  // Check for people/contributors (DOCX)
  if (zip.file('word/people.xml')) {
    const xml = await zip.file('word/people.xml')!.async('string');
    const personMatches = xml.match(/<w:person\b/g);
    const count = personMatches ? personMatches.length : 1;
    entries.push({
      key: 'DocxPeople',
      label: 'Contributors',
      value: `${count} contributor(s) found in word/people.xml`,
      category: 'author',
      risk: RISK_LEVELS['author'],
    });
  }

  // Check for people/contributors (XLSX)
  if (zip.file('xl/persons.xml')) {
    const xml = await zip.file('xl/persons.xml')!.async('string');
    const personMatches = xml.match(/<x:person\b|<person\b/g);
    const count = personMatches ? personMatches.length : 1;
    entries.push({
      key: 'XlsxPersons',
      label: 'Contributors',
      value: `${count} contributor(s) found in xl/persons.xml`,
      category: 'author',
      risk: RISK_LEVELS['author'],
    });
  }

  // Check for tracked changes in word/document.xml
  if (zip.file('word/document.xml')) {
    const xml = await zip.file('word/document.xml')!.async('string');
    const hasTrackedChanges =
      /<w:ins\b/.test(xml) ||
      /<w:del\b/.test(xml) ||
      /<w:rPrChange\b/.test(xml) ||
      /<w:pPrChange\b/.test(xml) ||
      /<w:sectPrChange\b/.test(xml);
    if (hasTrackedChanges) {
      const insCount = (xml.match(/<w:ins\b/g) ?? []).length;
      const delCount = (xml.match(/<w:del\b/g) ?? []).length;
      entries.push({
        key: 'TrackedChanges',
        label: 'Tracked Changes',
        value: `Yes — ${insCount} insertion(s), ${delCount} deletion(s)`,
        category: 'author',
        risk: RISK_LEVELS['author'],
      });
    }
  }

  // Check for customXml directory
  let customXmlFound = false;
  zip.forEach((relativePath, _file) => {
    if (!customXmlFound && relativePath.startsWith('customXml/') && !_file.dir) {
      customXmlFound = true;
      entries.push({
        key: 'CustomXml',
        label: 'Custom XML Data',
        value: 'Custom XML directory present (may contain arbitrary data)',
        category: 'other',
        risk: RISK_LEVELS['other'],
      });
    }
  });

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

// ---------------------------------------------------------------------------
// Audio file analysis helpers
// ---------------------------------------------------------------------------

/** Reads a little-endian uint32 from a Uint8Array at the given offset. */
function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>> 0
  );
}

/** Reads a big-endian uint32 from a Uint8Array at the given offset. */
function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>> 0
  );
}

function buildAudioAnalysis(
  fileName: string,
  fileSize: number,
  entries: MetadataEntry[],
): FileAnalysis {
  const riskScore = computeRiskScore(entries);
  const riskLevel = scoreToLevel(riskScore);
  const byCategory: Record<MetadataCategory, MetadataEntry[]> = {} as Record<MetadataCategory, MetadataEntry[]>;
  for (const cat of ALL_CATEGORIES) byCategory[cat] = [];
  for (const entry of entries) byCategory[entry.category].push(entry);
  return { fileName, fileSize, entries, gps: null, riskScore, riskLevel, isAI: false, byCategory };
}

function analyzeMp3Buffer(buffer: ArrayBuffer, fileName: string): FileAnalysis {
  const bytes = new Uint8Array(buffer);
  const entries: MetadataEntry[] = [];

  // Detect ID3v2 at start
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const majorVersion = bytes[3]!;
    const minorVersion = bytes[4]!;
    const size =
      ((bytes[6]! & 0x7F) << 21) |
      ((bytes[7]! & 0x7F) << 14) |
      ((bytes[8]! & 0x7F) << 7) |
       (bytes[9]! & 0x7F);

    entries.push(makeEntry('ID3v2Tag', `ID3 v2.${majorVersion}.${minorVersion} (${size + 10} bytes)`));
  }

  // Detect ID3v1 at end
  if (bytes.length >= 128) {
    const tagOffset = bytes.length - 128;
    if (bytes[tagOffset] === 0x54 && bytes[tagOffset + 1] === 0x41 && bytes[tagOffset + 2] === 0x47) {
      // Decode title (30 bytes at offset 3), artist (30 bytes at offset 33)
      const decode = (start: number, len: number) => {
        let str = '';
        for (let i = 0; i < len; i++) {
          const ch = bytes[tagOffset + start + i]!;
          if (ch === 0) break;
          str += String.fromCharCode(ch);
        }
        return str.trim();
      };
      entries.push(makeEntry('ID3v1Tag', '128 bytes at end of file'));
      const title = decode(3, 30);
      const artist = decode(33, 30);
      const album = decode(63, 30);
      const year = decode(93, 4);
      if (title) entries.push(makeEntry('Title', title));
      if (artist) entries.push(makeEntry('Artist', artist));
      if (album) entries.push(makeEntry('Album', album));
      if (year) entries.push(makeEntry('Year', year));
    }
  }

  return buildAudioAnalysis(fileName, buffer.byteLength, entries);
}

function analyzeWavBuffer(buffer: ArrayBuffer, fileName: string): FileAnalysis {
  const bytes = new Uint8Array(buffer);
  const entries: MetadataEntry[] = [];

  // Parse RIFF chunks looking for LIST/INFO and bext
  let offset = 12; // skip RIFF header
  while (offset + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
    const chunkSize = readUint32LE(bytes, offset + 4);
    const paddedSize = chunkSize + (chunkSize & 1);

    if (fourcc === 'LIST' && offset + 12 <= bytes.length) {
      const listType = String.fromCharCode(bytes[offset + 8]!, bytes[offset + 9]!, bytes[offset + 10]!, bytes[offset + 11]!);
      if (listType === 'INFO') {
        entries.push(makeEntry('LIST_INFO', `${chunkSize} bytes — text metadata chunk`));
        // Parse sub-chunks
        let subOffset = offset + 12;
        const listEnd = offset + 8 + paddedSize;
        while (subOffset + 8 <= listEnd && subOffset + 8 <= bytes.length) {
          const subFourcc = String.fromCharCode(bytes[subOffset]!, bytes[subOffset + 1]!, bytes[subOffset + 2]!, bytes[subOffset + 3]!);
          const subSize = readUint32LE(bytes, subOffset + 4);
          if (subSize > 0 && subOffset + 8 + subSize <= bytes.length) {
            let val = '';
            for (let i = 0; i < subSize; i++) {
              const ch = bytes[subOffset + 8 + i]!;
              if (ch === 0) break;
              val += String.fromCharCode(ch);
            }
            val = val.trim();
            if (val) {
              const keyMap: Record<string, string> = {
                INAM: 'Title', IART: 'Artist', IPRD: 'Album',
                ICRD: 'Date', ICMT: 'Comment', ISFT: 'Software',
                IGNR: 'Genre', ITRK: 'Track',
              };
              entries.push(makeEntry(keyMap[subFourcc] ?? subFourcc, val));
            }
          }
          subOffset += 8 + subSize + (subSize & 1);
        }
      }
    } else if (fourcc === 'bext') {
      entries.push(makeEntry('BroadcastWaveExtension', `${chunkSize} bytes — broadcast metadata`));
    } else if (fourcc === 'id3 ') {
      entries.push(makeEntry('EmbeddedID3', `${chunkSize} bytes — embedded ID3 tag`));
    }

    offset += 8 + paddedSize;
    if (offset <= 8) break; // overflow guard
  }

  return buildAudioAnalysis(fileName, buffer.byteLength, entries);
}

function analyzeFlacBuffer(buffer: ArrayBuffer, fileName: string): FileAnalysis {
  const bytes = new Uint8Array(buffer);
  const entries: MetadataEntry[] = [];

  let offset = 4; // skip "fLaC" magic
  while (offset + 4 <= bytes.length) {
    const headerByte = bytes[offset]!;
    const isLast = (headerByte & 0x80) !== 0;
    const blockType = headerByte & 0x7F;
    const blockLen = (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const dataStart = offset + 4;

    if (blockType === 4 && dataStart + 4 <= bytes.length) {
      // VORBIS_COMMENT
      const vendorLen = readUint32LE(bytes, dataStart);
      const vendorEnd = dataStart + 4 + vendorLen;
      if (vendorLen > 0 && vendorEnd <= bytes.length) {
        const vendor = new TextDecoder().decode(bytes.slice(dataStart + 4, vendorEnd));
        if (vendor.trim()) entries.push(makeEntry('VorbisVendor', vendor));
      }

      if (vendorEnd + 4 <= bytes.length) {
        const commentCount = readUint32LE(bytes, vendorEnd);
        let pos = vendorEnd + 4;
        for (let i = 0; i < commentCount && pos + 4 <= bytes.length; i++) {
          const commentLen = readUint32LE(bytes, pos);
          pos += 4;
          if (commentLen > 0 && pos + commentLen <= bytes.length) {
            const comment = new TextDecoder().decode(bytes.slice(pos, pos + commentLen));
            const eqIdx = comment.indexOf('=');
            if (eqIdx !== -1) {
              const key = comment.slice(0, eqIdx).trim();
              const val = comment.slice(eqIdx + 1).trim();
              if (key && val) entries.push(makeEntry(key, val));
            }
          }
          pos += commentLen;
        }
      }
    } else if (blockType === 6) {
      // PICTURE
      entries.push(makeEntry('EmbeddedPicture', `${blockLen} bytes — cover art`));
    }

    if (isLast) break;
    offset += 4 + blockLen;
  }

  return buildAudioAnalysis(fileName, buffer.byteLength, entries);
}

// ---------------------------------------------------------------------------
// MP4/MOV file analysis helpers (ISOBMFF container)
// ---------------------------------------------------------------------------

/** iTunes metadata atom keys found in moov/udta/meta/ilst */
const ILST_ATOM_MAP: Record<string, [string, MetadataCategory]> = {
  '\xA9nam': ['Title', 'other'],
  '\xA9ART': ['Artist', 'author'],
  '\xA9alb': ['Album', 'other'],
  '\xA9day': ['Year', 'timestamps'],
  '\xA9too': ['Encoding Tool', 'software'],
  '\xA9cmt': ['Comment', 'other'],
  '\xA9aut': ['Author', 'author'],
  '\xA9wrt': ['Composer', 'author'],
  '\xA9enc': ['Encoded By', 'author'],
  '\xA9gen': ['Genre', 'other'],
  'covr': ['Cover Art', 'thumbnail'],
  'aART': ['Album Artist', 'author'],
  'cprt': ['Copyright', 'author'],
  'desc': ['Description', 'other'],
  'ldes': ['Long Description', 'other'],
  'tvnn': ['TV Network Name', 'other'],
  'tvsh': ['TV Show Name', 'other'],
  'tvsn': ['TV Season', 'other'],
  'tven': ['TV Episode', 'other'],
  'tves': ['TV Episode Number', 'other'],
  'keyw': ['Keywords', 'other'],
  'catg': ['Category', 'other'],
  'hdvd': ['HD Video', 'other'],
  'pgap': ['Gapless Playback', 'other'],
  'stik': ['Media Type', 'other'],
  'rtng': ['Content Rating', 'other'],
  'pcst': ['Podcast', 'other'],
  'purl': ['Podcast URL', 'other'],
  'egid': ['Episode Global Unique ID', 'other'],
  'sosn': ['Sort Show', 'other'],
  'soar': ['Sort Artist', 'author'],
  'soal': ['Sort Album', 'other'],
  'sonm': ['Sort Name', 'other'],
  'soco': ['Sort Composer', 'author'],
  'soaa': ['Sort Album Artist', 'author'],
};

/**
 * Reads a 4-byte big-endian uint32 from bytes at the given offset.
 * Returns 0 if out of range.
 */
function readBE32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return 0;
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>> 0
  );
}

/** Reads a 4-char FourCC string from bytes at the given offset. */
function readFourCC(bytes: Uint8Array, offset: number): string {
  if (offset + 8 > bytes.length) return '';
  return String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
}

/**
 * Walks ISOBMFF boxes at [start, end) and calls the visitor for each box.
 * The visitor receives (type, dataStart, dataEnd) — the data region excluding the 8-byte header.
 */
function walkBoxes(
  bytes: Uint8Array,
  start: number,
  end: number,
  visitor: (type: string, dataStart: number, dataEnd: number) => void,
): void {
  let offset = start;
  while (offset + 8 <= end) {
    let size = readBE32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    let headerSize = 8;

    if (size === 1 && offset + 16 <= end) {
      // Extended 64-bit size
      const hi = readBE32(bytes, offset + 8);
      const lo = readBE32(bytes, offset + 12);
      size = hi * 0x100000000 + lo;
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) break;
    visitor(type, offset + headerSize, offset + size);
    offset += size;
  }
}

/** Decodes a UTF-8 string from bytes[start..end], trimming null bytes. */
function decodeUtf8(bytes: Uint8Array, start: number, end: number): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(start, end)).replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

/**
 * Parses the moov/udta box to extract metadata entries.
 * Handles iTunes-style ilst atoms and GPS ©xyz atom.
 */
function parseMoovUdta(bytes: Uint8Array, udtaStart: number, udtaEnd: number): MetadataEntry[] {
  const entries: MetadataEntry[] = [];

  walkBoxes(bytes, udtaStart, udtaEnd, (type, dataStart, dataEnd) => {
    // GPS location: ©xyz
    if (type === '\xA9xyz') {
      const val = decodeUtf8(bytes, dataStart, dataEnd);
      if (val) {
        entries.push({
          key: 'GPSCoordinates',
          label: 'GPS Coordinates',
          value: val,
          category: 'gps',
          risk: RISK_LEVELS['gps'],
        });
      }
      return;
    }

    // meta box contains ilst
    if (type === 'meta') {
      // meta has a 4-byte version/flags before its children
      const metaChildStart = dataStart + 4;
      walkBoxes(bytes, metaChildStart, dataEnd, (metaChildType, metaDataStart, metaDataEnd) => {
        if (metaChildType === 'ilst') {
          parseMp4Ilst(bytes, metaDataStart, metaDataEnd, entries);
        }
      });
      return;
    }

    // Direct ilst (some encoders put it directly in udta)
    if (type === 'ilst') {
      parseMp4Ilst(bytes, dataStart, dataEnd, entries);
    }
  });

  return entries;
}

/**
 * Parses an ilst box and pushes MetadataEntry items into the entries array.
 * Each child of ilst is a metadata atom (e.g. ©nam, ©ART) containing a 'data' sub-atom.
 */
function parseMp4Ilst(bytes: Uint8Array, start: number, end: number, entries: MetadataEntry[]): void {
  walkBoxes(bytes, start, end, (type, dataStart, dataEnd) => {
    const known = ILST_ATOM_MAP[type];
    const label = known ? known[0] : type;
    const category: MetadataCategory = known ? known[1] : 'other';

    // Each ilst item contains a 'data' atom: [version 1B][flags 3B][locale 4B][value...]
    walkBoxes(bytes, dataStart, dataEnd, (subType, subDataStart, subDataEnd) => {
      if (subType !== 'data') return;
      // data atom: 1 byte version + 3 bytes flags + 4 bytes locale = 8 bytes prefix before value
      const valueStart = subDataStart + 8;
      if (valueStart >= subDataEnd) return;

      // flags byte 3 encodes type: 1 = UTF-8, 13 = JPEG/PNG (cover art), 21 = integer
      const flags = bytes[subDataStart + 3]!;

      let value: string;
      if (flags === 13 || flags === 14) {
        value = `${subDataEnd - valueStart} bytes (cover art image)`;
      } else if (flags === 1 || flags === 0) {
        value = decodeUtf8(bytes, valueStart, subDataEnd);
      } else {
        // Integer or other — just report the byte count
        value = `${subDataEnd - valueStart} bytes`;
      }

      if (value) {
        entries.push({
          key: type.replace(/[^\x20-\x7E]/g, '_'),
          label,
          value,
          category,
          risk: RISK_LEVELS[category],
        });
      }
    });
  });
}

function analyzeMp4Buffer(buffer: ArrayBuffer, fileName: string): FileAnalysis {
  const bytes = new Uint8Array(buffer);
  const entries: MetadataEntry[] = [];

  // Walk top-level boxes looking for moov
  walkBoxes(bytes, 0, bytes.length, (type, dataStart, dataEnd) => {
    if (type !== 'moov') return;

    // Inside moov, look for udta and meta
    walkBoxes(bytes, dataStart, dataEnd, (moovChild, childDataStart, childDataEnd) => {
      if (moovChild === 'udta') {
        const udtaEntries = parseMoovUdta(bytes, childDataStart, childDataEnd);
        entries.push(...udtaEntries);
      } else if (moovChild === 'meta') {
        // Some encoders put meta directly inside moov (not inside udta)
        // meta has 4 bytes version/flags before children
        const metaChildStart = childDataStart + 4;
        walkBoxes(bytes, metaChildStart, childDataEnd, (metaChild, metaDataStart, metaDataEnd) => {
          if (metaChild === 'ilst') {
            parseMp4Ilst(bytes, metaDataStart, metaDataEnd, entries);
          }
        });
      }
    });
  });

  // Build GPS from coordinates entry if present
  let gps: GPSData | null = null;
  const gpsEntry = entries.find((e) => e.key === 'GPSCoordinates');
  if (gpsEntry) {
    // Format: "+lat+lon/" or "+lat-lon/" (ISO 6709)
    const match = gpsEntry.value.match(/([+-][\d.]+)([+-][\d.]+)/);
    if (match) {
      const lat = parseFloat(match[1]!);
      const lon = parseFloat(match[2]!);
      if (!isNaN(lat) && !isNaN(lon)) {
        gps = { lat, lon };
      }
    }
  }

  const riskScore = computeRiskScore(entries);
  const riskLevel = scoreToLevel(riskScore);
  const byCategory: Record<MetadataCategory, MetadataEntry[]> = {} as Record<MetadataCategory, MetadataEntry[]>;
  for (const cat of ALL_CATEGORIES) byCategory[cat] = [];
  for (const entry of entries) byCategory[entry.category].push(entry);

  return {
    fileName,
    fileSize: buffer.byteLength,
    entries,
    gps,
    riskScore,
    riskLevel,
    isAI: false,
    byCategory,
  };
}

export async function analyzeFile(file: File): Promise<FileAnalysis> {
  const buffer = await file.arrayBuffer();

  // PDF documents
  if (isPdf(buffer)) {
    return analyzePdfBuffer(buffer, file.name);
  }

  // Audio files
  if (isMp3(buffer)) return analyzeMp3Buffer(buffer, file.name);
  // Check AVI before WAV — both RIFF, differentiated by bytes 8-11
  if (isAvi(buffer)) return analyzeWavBuffer(buffer, file.name);
  if (isWav(buffer)) return analyzeWavBuffer(buffer, file.name);
  if (isFlac(buffer)) return analyzeFlacBuffer(buffer, file.name);

  // MKV/WebM — EBML container (basic detection only)
  if (isMkv(buffer)) return buildAudioAnalysis(file.name, buffer.byteLength, []);

  // HEIC/HEIF and AVIF — ISOBMFF container, same analysis as MP4/MOV
  if (isHeic(buffer)) return analyzeMp4Buffer(buffer, file.name);
  if (isAvif(buffer)) return analyzeMp4Buffer(buffer, file.name);

  // M4A — ISOBMFF container (same analysis as MP4)
  if (isM4a(buffer)) return analyzeMp4Buffer(buffer, file.name);

  // Video files (MP4/MOV — ISOBMFF container)
  if (isMp4(buffer)) return analyzeMp4Buffer(buffer, file.name);

  // EPUB — ZIP-based format with OPF metadata
  if (isEpub(buffer)) return analyzeOfficeFile(buffer, file.name);

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
