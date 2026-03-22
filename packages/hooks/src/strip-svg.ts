/**
 * SVG text-based metadata stripper (Node.js port).
 *
 * Removes metadata elements, comments, Inkscape/Sodipodi namespace attributes,
 * RDF/DC/CC namespace content, and processing instructions from SVG files.
 */

export interface StripSvgResult {
  output: Buffer;
  categories: string[];
}

export function isSvg(buf: Buffer): boolean {
  if (buf.byteLength === 0) return false;
  const sample = buf.slice(0, Math.min(1024, buf.byteLength));
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(sample);
  } catch {
    return false;
  }
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '').trimStart();
  return stripped.startsWith('<?xml') || stripped.startsWith('<svg');
}

export function stripSvg(input: Buffer): StripSvgResult {
  if (!isSvg(input)) {
    throw new Error('Input is not a valid SVG: content does not start with <?xml or <svg');
  }

  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(ab);
  } catch {
    throw new Error('Input SVG could not be decoded as UTF-8 text');
  }

  const categories: string[] = [];
  const categorySeen = new Set<string>();

  function addCategory(cat: string) {
    if (!categorySeen.has(cat)) {
      categorySeen.add(cat);
      categories.push(cat);
    }
  }

  let stripped = false;

  const original = text;

  // Remove <metadata>...</metadata> blocks
  text = text.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');
  // Remove <desc>...</desc>
  text = text.replace(/<desc[\s\S]*?<\/desc>/gi, '');
  // Remove <title>...</title>
  text = text.replace(/<title[\s\S]*?<\/title>/gi, '');
  // Remove XML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Remove processing instructions except <?xml ...?>
  text = text.replace(/<\?(?!xml)[\s\S]*?\?>/gi, '');
  // Remove Inkscape/Sodipodi namespace declarations
  text = text.replace(/\s+xmlns:(inkscape|sodipodi|dc|cc|rdf)="[^"]*"/gi, '');
  text = text.replace(/\s+xmlns:(inkscape|sodipodi|dc|cc|rdf)='[^']*'/gi, '');
  // Remove Inkscape/Sodipodi attributes
  text = text.replace(/\s+(?:inkscape|sodipodi):[a-zA-Z0-9_:-]+="[^"]*"/g, '');
  text = text.replace(/\s+(?:inkscape|sodipodi):[a-zA-Z0-9_:-]+='[^']*'/g, '');
  // Remove RDF/DC/CC namespace attributes
  text = text.replace(/\s+(?:dc|cc|rdf):[a-zA-Z0-9_:-]+="[^"]*"/g, '');
  text = text.replace(/\s+(?:dc|cc|rdf):[a-zA-Z0-9_:-]+='[^']*'/g, '');
  // Clean up blank lines
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  if (text !== original) {
    addCategory('metadata');
    addCategory('comments');
  }

  const encoded = new TextEncoder().encode(text);
  return { output: Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength), categories };
}
