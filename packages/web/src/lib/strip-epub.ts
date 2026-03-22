/**
 * EPUB metadata stripper.
 *
 * EPUB is a ZIP archive containing XHTML content + OPF metadata files.
 * Metadata lives in one or more .opf files (typically OEBPS/content.opf
 * or package.opf) in Dublin Core (dc:) namespace elements.
 *
 * Elements removed:
 *   dc:creator      — author name
 *   dc:publisher    — publisher name
 *   dc:rights       — copyright statement
 *   dc:contributor  — contributor names
 *   dc:date         — publication date
 *   dc:description  — book description
 *   dc:source       — source reference
 *   dc:subject      — subject/category
 *   <meta name="..." content="..."> — calibre/Adobe reader metadata
 *
 * Elements preserved (required by EPUB spec):
 *   dc:identifier   — unique book ID
 *   dc:title        — book title
 *   dc:language     — content language
 *   All manifest, spine, and guide elements
 */

import JSZip from 'jszip';

/**
 * Returns true if the buffer is an EPUB file.
 * EPUBs are ZIP files whose first local file is named "mimetype" and contains
 * the string "application/epub+zip".
 */
export function isEpub(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 58) return false;
  const bytes = new Uint8Array(buffer);
  // ZIP local file header magic: PK\x03\x04
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return false;
  // The first entry in a valid EPUB is always the uncompressed "mimetype" file.
  // Bytes 30 onward contain the filename then the data.
  // Check a wide window for 'application/epub+zip' string near the start.
  const windowEnd = Math.min(bytes.length, 200);
  const str = String.fromCharCode.apply(null, Array.from(bytes.slice(0, windowEnd)));
  return str.indexOf('application/epub+zip') >= 0;
}

/**
 * Strips private metadata from an EPUB buffer.
 *
 * Removes Dublin Core author/publisher/date/rights/etc. elements from all
 * .opf files found in the ZIP archive. Required fields (identifier, title,
 * language) are preserved so the EPUB remains spec-compliant.
 *
 * Returns a new ArrayBuffer containing the modified ZIP (DEFLATE compressed).
 */
export async function stripEpub(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);

  for (const [path, file] of Object.entries(zip.files)) {
    if (!path.endsWith('.opf') || file.dir) continue;

    let content = await file.async('string');

    // Remove Dublin Core elements that expose personal/publisher data.
    // dc:identifier, dc:title, and dc:language are preserved (EPUB spec requires them).
    content = content.replace(/<dc:creator[^>]*>[\s\S]*?<\/dc:creator>/gi, '');
    content = content.replace(/<dc:publisher[^>]*>[\s\S]*?<\/dc:publisher>/gi, '');
    content = content.replace(/<dc:rights[^>]*>[\s\S]*?<\/dc:rights>/gi, '');
    content = content.replace(/<dc:contributor[^>]*>[\s\S]*?<\/dc:contributor>/gi, '');
    content = content.replace(/<dc:date[^>]*>[\s\S]*?<\/dc:date>/gi, '');
    content = content.replace(/<dc:description[^>]*>[\s\S]*?<\/dc:description>/gi, '');
    content = content.replace(/<dc:source[^>]*>[\s\S]*?<\/dc:source>/gi, '');
    content = content.replace(/<dc:subject[^>]*>[\s\S]*?<\/dc:subject>/gi, '');

    // Remove <meta name="..." content="..."/> elements (calibre, Adobe, etc.)
    content = content.replace(/<meta\s+name="[^"]*"\s+content="[^"]*"\s*\/?>/gi, '');
    content = content.replace(/<meta\s+content="[^"]*"\s+name="[^"]*"\s*\/?>/gi, '');

    zip.file(path, content);
  }

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
