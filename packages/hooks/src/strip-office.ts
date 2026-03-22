/**
 * Office document metadata stripper (Node.js port).
 *
 * Strips metadata from DOCX, XLSX, PPTX files (ZIP-based Office Open XML).
 * Removes docProps/core.xml, docProps/app.xml, docProps/custom.xml, and
 * thumbnail files, then updates [Content_Types].xml and _rels/.rels.
 */

import JSZip from 'jszip';

export interface StripOfficeResult {
  output: Buffer;
  categories: string[];
}

const METADATA_PATHS = [
  'docProps/core.xml',
  'docProps/app.xml',
  'docProps/custom.xml',
  'docProps/thumbnail.jpeg',
  'docProps/thumbnail.jpg',
  'docProps/thumbnail.wmf',
];

export function isZip(buf: Buffer): boolean {
  if (buf.byteLength < 4) return false;
  return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

export function isOffice(buf: Buffer, fileName?: string): boolean {
  if (!isZip(buf)) return false;
  if (!fileName) return false;
  const lower = fileName.toLowerCase();
  return lower.endsWith('.docx') || lower.endsWith('.xlsx') || lower.endsWith('.pptx');
}

export async function stripOffice(input: Buffer): Promise<StripOfficeResult> {
  if (!isZip(input)) {
    throw new Error('Input is not a valid Office document: missing ZIP header');
  }

  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  const zip = await JSZip.loadAsync(ab);

  const categories: string[] = [];
  const categorySeen = new Set<string>();

  function addCategory(cat: string) {
    if (!categorySeen.has(cat)) {
      categorySeen.add(cat);
      categories.push(cat);
    }
  }

  for (const p of METADATA_PATHS) {
    if (zip.file(p)) {
      zip.remove(p);
      addCategory('document info');
    }
  }

  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    let contentTypes = await contentTypesFile.async('string');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/docProps\/[^"]*"[^>]*\/>/g, '');
    zip.file('[Content_Types].xml', contentTypes);
  }

  const relsFile = zip.file('_rels/.rels');
  if (relsFile) {
    let rels = await relsFile.async('string');
    rels = rels.replace(/<Relationship[^>]*Target="docProps\/[^"]*"[^>]*\/>/g, '');
    zip.file('_rels/.rels', rels);
  }

  const result = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return { output: Buffer.from(result), categories };
}
