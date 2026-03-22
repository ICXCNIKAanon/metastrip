/**
 * Office document metadata stripper (Node.js port).
 *
 * Strips metadata from DOCX, XLSX, PPTX files (ZIP-based Office Open XML).
 * Removes docProps/core.xml, docProps/app.xml, docProps/custom.xml, and
 * thumbnail files, then updates [Content_Types].xml and _rels/.rels.
 *
 * Also removes tracked changes author/date attributes, comments files,
 * people files, revision IDs, and customXml directories.
 */

import JSZip from 'jszip';

export interface StripOfficeResult {
  output: Buffer;
  categories: string[];
}

// Files to remove entirely
const FILES_TO_REMOVE = [
  'docProps/core.xml',
  'docProps/app.xml',
  'docProps/custom.xml',
  'docProps/thumbnail.jpeg',
  'docProps/thumbnail.jpg',
  'docProps/thumbnail.wmf',
  // DOCX comments/people
  'word/comments.xml',
  'word/commentsExtended.xml',
  'word/commentsIds.xml',
  'word/people.xml',
  // XLSX comments/people
  'xl/persons.xml',
  // PPTX comment authors
  'ppt/commentAuthors.xml',
];

// Directory prefixes to remove entirely
const DIRS_TO_REMOVE = [
  'customXml/',
  'xl/threadedComments/',
  'ppt/comments/',
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

  // Remove all individual metadata/comment/people files
  for (const p of FILES_TO_REMOVE) {
    if (zip.file(p)) {
      zip.remove(p);
      if (p.startsWith('docProps/')) {
        addCategory('document info');
      } else if (p.includes('comments') || p.includes('Comments') || p.includes('people') || p.includes('persons')) {
        addCategory('comments & people');
      }
    }
  }

  // Remove entire directories (customXml/, xl/threadedComments/, ppt/comments/)
  zip.forEach((relativePath, _file) => {
    for (const dir of DIRS_TO_REMOVE) {
      if (relativePath.startsWith(dir)) {
        zip.remove(relativePath);
        if (dir === 'customXml/') {
          addCategory('custom xml');
        } else {
          addCategory('comments & people');
        }
        break;
      }
    }
  });

  // Remove xl/comments*.xml (e.g. xl/comments1.xml, xl/comments2.xml)
  zip.forEach((relativePath, _file) => {
    if (/^xl\/comments\d*\.xml$/.test(relativePath)) {
      zip.remove(relativePath);
      addCategory('comments & people');
    }
  });

  // Strip tracked change metadata from word/document.xml
  if (zip.file('word/document.xml')) {
    let doc = await zip.file('word/document.xml')!.async('string');
    const original = doc;
    // Remove author and date from tracked changes
    doc = doc.replace(/\s+w:author="[^"]*"/g, '');
    doc = doc.replace(/\s+w:date="[^"]*T[^"]*"/g, '');
    // Remove revision save IDs (fingerprint editing sessions)
    doc = doc.replace(/\s+w:rsidR="[^"]*"/g, '');
    doc = doc.replace(/\s+w:rsidRPr="[^"]*"/g, '');
    doc = doc.replace(/\s+w:rsidDel="[^"]*"/g, '');
    doc = doc.replace(/\s+w:rsidP="[^"]*"/g, '');
    doc = doc.replace(/\s+w:rsidRDefault="[^"]*"/g, '');
    doc = doc.replace(/\s+w14:paraId="[^"]*"/g, '');
    doc = doc.replace(/\s+w14:textId="[^"]*"/g, '');
    if (doc !== original) {
      addCategory('tracked changes');
    }
    zip.file('word/document.xml', doc);
  }

  // Strip rsid values from word/settings.xml
  if (zip.file('word/settings.xml')) {
    let settings = await zip.file('word/settings.xml')!.async('string');
    const original = settings;
    // Remove the entire <w:rsids> block first (before removing self-closing rsid elements)
    settings = settings.replace(/<w:rsids>[\s\S]*?<\/w:rsids>/g, '');
    // Remove any remaining self-closing <w:rsid.../> elements
    settings = settings.replace(/<w:rsid[^>]*\/>/g, '');
    if (settings !== original) {
      addCategory('tracked changes');
    }
    zip.file('word/settings.xml', settings);
  }

  // Update [Content_Types].xml — remove Override entries for removed parts
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    let contentTypes = await contentTypesFile.async('string');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/docProps\/[^"]*"[^>]*\/>/g, '');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/word\/comments[^"]*"[^>]*\/>/g, '');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/word\/people\.xml"[^>]*\/>/g, '');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/xl\/comments[^"]*"[^>]*\/>/g, '');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/xl\/persons\.xml"[^>]*\/>/g, '');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/xl\/threadedComments\/[^"]*"[^>]*\/>/g, '');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/ppt\/comments\/[^"]*"[^>]*\/>/g, '');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/ppt\/commentAuthors\.xml"[^>]*\/>/g, '');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/customXml\/[^"]*"[^>]*\/>/g, '');
    zip.file('[Content_Types].xml', contentTypes);
  }

  // Update _rels/.rels — remove Relationship entries pointing to removed parts
  const relsFile = zip.file('_rels/.rels');
  if (relsFile) {
    let rels = await relsFile.async('string');
    rels = rels.replace(/<Relationship[^>]*Target="docProps\/[^"]*"[^>]*\/>/g, '');
    rels = rels.replace(/<Relationship[^>]*Target="customXml\/[^"]*"[^>]*\/>/g, '');
    zip.file('_rels/.rels', rels);
  }

  const result = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return { output: Buffer.from(result), categories };
}
