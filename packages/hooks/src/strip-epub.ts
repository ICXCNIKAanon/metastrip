/**
 * EPUB metadata stripper (Node.js port).
 *
 * EPUB is a ZIP archive containing OPF metadata files.
 * Removes Dublin Core author/publisher/date/rights/etc. elements from all
 * .opf files. Required fields (identifier, title, language) are preserved.
 */

import JSZip from 'jszip';

export interface StripEpubResult {
  output: Buffer;
  categories: string[];
}

export function isEpub(buf: Buffer): boolean {
  if (buf.byteLength < 58) return false;
  if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) return false;
  const windowEnd = Math.min(buf.byteLength, 200);
  const str = String.fromCharCode.apply(null, Array.from(buf.slice(0, windowEnd)));
  return str.indexOf('application/epub+zip') >= 0;
}

export async function stripEpub(input: Buffer): Promise<StripEpubResult> {
  if (!isEpub(input)) {
    throw new Error('Input is not a valid EPUB: missing application/epub+zip marker');
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

  for (const [path, file] of Object.entries(zip.files)) {
    if (!path.endsWith('.opf') || file.dir) continue;

    let content = await file.async('string');
    const original = content;

    content = content.replace(/<dc:creator[^>]*>[\s\S]*?<\/dc:creator>/gi, '');
    content = content.replace(/<dc:publisher[^>]*>[\s\S]*?<\/dc:publisher>/gi, '');
    content = content.replace(/<dc:rights[^>]*>[\s\S]*?<\/dc:rights>/gi, '');
    content = content.replace(/<dc:contributor[^>]*>[\s\S]*?<\/dc:contributor>/gi, '');
    content = content.replace(/<dc:date[^>]*>[\s\S]*?<\/dc:date>/gi, '');
    content = content.replace(/<dc:description[^>]*>[\s\S]*?<\/dc:description>/gi, '');
    content = content.replace(/<dc:source[^>]*>[\s\S]*?<\/dc:source>/gi, '');
    content = content.replace(/<dc:subject[^>]*>[\s\S]*?<\/dc:subject>/gi, '');
    content = content.replace(/<meta\s+name="[^"]*"\s+content="[^"]*"\s*\/?>/gi, '');
    content = content.replace(/<meta\s+content="[^"]*"\s+name="[^"]*"\s*\/?>/gi, '');

    if (content !== original) {
      addCategory('document info');
    }

    zip.file(path, content);
  }

  const result = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return { output: Buffer.from(result), categories };
}
