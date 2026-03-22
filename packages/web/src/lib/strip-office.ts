import JSZip from 'jszip';

export type OfficeFormat = 'docx' | 'xlsx' | 'pptx';

const METADATA_PATHS = [
  'docProps/core.xml',
  'docProps/app.xml',
  'docProps/custom.xml',
  'docProps/thumbnail.jpeg',
  'docProps/thumbnail.jpg',
  'docProps/thumbnail.wmf',
];

export function isZip(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer);
  // ZIP magic bytes: PK\x03\x04
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export async function stripOffice(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);

  // Remove all metadata files
  for (const path of METADATA_PATHS) {
    if (zip.file(path)) {
      zip.remove(path);
    }
  }

  // Update [Content_Types].xml — remove Override entries for docProps files
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    let contentTypes = await contentTypesFile.async('string');
    contentTypes = contentTypes.replace(/<Override[^>]*PartName="\/docProps\/[^"]*"[^>]*\/>/g, '');
    zip.file('[Content_Types].xml', contentTypes);
  }

  // Update _rels/.rels — remove Relationship entries pointing to docProps/
  const relsFile = zip.file('_rels/.rels');
  if (relsFile) {
    let rels = await relsFile.async('string');
    rels = rels.replace(/<Relationship[^>]*Target="docProps\/[^"]*"[^>]*\/>/g, '');
    zip.file('_rels/.rels', rels);
  }

  const result = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return result;
}
