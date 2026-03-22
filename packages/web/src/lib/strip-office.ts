import JSZip from 'jszip';

export type OfficeFormat = 'docx' | 'xlsx' | 'pptx';

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

export function isZip(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer);
  // ZIP magic bytes: PK\x03\x04
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export async function stripOffice(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);

  // Remove all individual metadata/comment/people files
  for (const path of FILES_TO_REMOVE) {
    if (zip.file(path)) {
      zip.remove(path);
    }
  }

  // Remove entire directories (customXml/, xl/threadedComments/, ppt/comments/)
  zip.forEach((relativePath, _file) => {
    for (const dir of DIRS_TO_REMOVE) {
      if (relativePath.startsWith(dir)) {
        zip.remove(relativePath);
        break;
      }
    }
  });

  // Remove xl/comments*.xml (e.g. xl/comments1.xml, xl/comments2.xml)
  zip.forEach((relativePath, _file) => {
    if (/^xl\/comments\d*\.xml$/.test(relativePath)) {
      zip.remove(relativePath);
    }
  });

  // Strip tracked change metadata from word/document.xml
  if (zip.file('word/document.xml')) {
    let doc = await zip.file('word/document.xml')!.async('string');
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
    zip.file('word/document.xml', doc);
  }

  // Strip rsid values from word/settings.xml
  if (zip.file('word/settings.xml')) {
    let settings = await zip.file('word/settings.xml')!.async('string');
    // Remove the entire <w:rsids> block first (before removing self-closing rsid elements)
    settings = settings.replace(/<w:rsids>[\s\S]*?<\/w:rsids>/g, '');
    // Remove any remaining self-closing <w:rsid.../> elements
    settings = settings.replace(/<w:rsid[^>]*\/>/g, '');
    zip.file('word/settings.xml', settings);
  }

  // Update [Content_Types].xml — remove Override entries for removed parts
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    let contentTypes = await contentTypesFile.async('string');
    // Remove docProps references
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/docProps\/[^"]*"[^>]*\/>/g, '');
    // Remove word/comments* references
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/word\/comments[^"]*"[^>]*\/>/g, '');
    // Remove word/people.xml reference
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/word\/people\.xml"[^>]*\/>/g, '');
    // Remove xl/comments* references
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/xl\/comments[^"]*"[^>]*\/>/g, '');
    // Remove xl/persons.xml reference
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/xl\/persons\.xml"[^>]*\/>/g, '');
    // Remove xl/threadedComments references
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/xl\/threadedComments\/[^"]*"[^>]*\/>/g, '');
    // Remove ppt/comments references
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/ppt\/comments\/[^"]*"[^>]*\/>/g, '');
    // Remove ppt/commentAuthors.xml reference
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/ppt\/commentAuthors\.xml"[^>]*\/>/g, '');
    // Remove customXml references
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
  return result;
}
