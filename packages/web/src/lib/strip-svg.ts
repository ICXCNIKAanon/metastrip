/**
 * SVG text-based metadata stripper.
 *
 * SVG files are XML text. Metadata can appear in several places:
 *   - <metadata>...</metadata> elements (often containing RDF/XMP)
 *   - XML comments <!-- ... -->
 *   - <desc> and <title> elements (can contain author/tool info)
 *   - Inkscape/Sodipodi namespace attributes and declarations
 *   - Dublin Core (dc:), Creative Commons (cc:), RDF namespace content
 *   - Processing instructions <?...?> (except the XML declaration)
 *
 * This stripper operates on the raw text content using regex-based transforms
 * so it works in both browser and Node.js environments without a DOM parser.
 *
 * What is stripped:
 *   - <metadata>...</metadata> blocks and their contents
 *   - XML comments <!-- ... -->
 *   - Processing instructions <?...?> (except <?xml ...?>)
 *   - Inkscape/Sodipodi namespace declarations and attributes on elements
 *   - Dublin Core / Creative Commons / RDF namespace declarations
 *   - <desc>...</desc> and <title>...</title> elements
 *
 * What is preserved:
 *   - All visual elements: <svg>, <g>, <path>, <circle>, <rect>, <text>,
 *     <image>, <use>, <defs>, <style>, <symbol>, etc.
 *   - CSS styles and classes
 *   - viewBox, width, height, xmlns (SVG namespace)
 *   - Gradients, filters, masks, clip paths
 *   - Animation elements (<animate>, <animateTransform>)
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the buffer content looks like an SVG file.
 * Checks for <?xml or <svg at the start of the text (after trimming).
 */
export function isSvg(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength === 0) return false;
  // Decode the first 1024 bytes (enough to detect the header).
  const sample = new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength));
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(sample);
  } catch {
    return false;
  }
  // Strip leading XML comments and whitespace before checking for SVG markers.
  // This handles files that begin with <!-- ... --> before the root element.
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '').trimStart();
  return stripped.startsWith('<?xml') || stripped.startsWith('<svg');
}

/**
 * Strips metadata from an SVG buffer.
 *
 * The input is decoded as UTF-8 text, transformed with a series of regex
 * passes, then re-encoded as UTF-8 and returned as a new ArrayBuffer.
 *
 * @throws {Error} if the buffer is not a valid SVG.
 */
export function stripSvg(buffer: ArrayBuffer): ArrayBuffer {
  if (!isSvg(buffer)) {
    throw new Error('Input is not a valid SVG: content does not start with <?xml or <svg');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  } catch {
    throw new Error('Input SVG could not be decoded as UTF-8 text');
  }

  text = applySvgStripping(text);

  const encoded = new TextEncoder().encode(text);
  return encoded.buffer;
}

// ---------------------------------------------------------------------------
// Internal: stripping pipeline
// ---------------------------------------------------------------------------

/**
 * Applies all metadata-stripping transforms to an SVG string and returns
 * the cleaned result.
 */
export function applySvgStripping(text: string): string {
  // 1. Remove <metadata>...</metadata> blocks (non-greedy, dotAll).
  text = text.replace(/<metadata[\s\S]*?<\/metadata>/gi, '');

  // 2. Remove <desc>...</desc> elements (may contain author/tool info).
  text = text.replace(/<desc[\s\S]*?<\/desc>/gi, '');

  // 3. Remove <title>...</title> elements (may contain document/author info).
  text = text.replace(/<title[\s\S]*?<\/title>/gi, '');

  // 4. Remove XML comments <!-- ... --> (dotAll).
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // 5. Remove processing instructions except <?xml ...?>.
  text = text.replace(/<\?(?!xml)[\s\S]*?\?>/gi, '');

  // 6. Remove Inkscape/Sodipodi namespace declarations from the <svg> element.
  //    e.g. xmlns:inkscape="..." xmlns:sodipodi="..."
  text = text.replace(/\s+xmlns:(inkscape|sodipodi|dc|cc|rdf)="[^"]*"/gi, '');
  text = text.replace(/\s+xmlns:(inkscape|sodipodi|dc|cc|rdf)='[^']*'/gi, '');

  // 7. Remove Inkscape/Sodipodi attributes on elements.
  //    e.g. inkscape:label="..." sodipodi:nodetypes="..."
  text = text.replace(/\s+(?:inkscape|sodipodi):[a-zA-Z0-9_:-]+="[^"]*"/g, '');
  text = text.replace(/\s+(?:inkscape|sodipodi):[a-zA-Z0-9_:-]+='[^']*'/g, '');

  // 8. Remove RDF/DC/CC namespace attributes.
  //    e.g. dc:creator="..." cc:license="..." rdf:about="..."
  text = text.replace(/\s+(?:dc|cc|rdf):[a-zA-Z0-9_:-]+="[^"]*"/g, '');
  text = text.replace(/\s+(?:dc|cc|rdf):[a-zA-Z0-9_:-]+='[^']*'/g, '');

  // 9. Clean up multiple consecutive blank lines left by removed blocks.
  text = text.replace(/\n{3,}/g, '\n\n');

  // 10. Trim trailing whitespace.
  text = text.trim();

  return text;
}
