/**
 * PDF binary metadata stripper (Node.js port).
 *
 * Replaces metadata values in-place (same byte lengths) so xref tables
 * remain valid. Blanks XMP metadata streams.
 */

const METADATA_KEYS = [
  'Author', 'Creator', 'Producer', 'Title', 'Subject', 'Keywords',
  'Company', 'Manager', 'SourceModified',
];

const DATE_KEYS = ['CreationDate', 'ModDate'];

export interface StripPdfResult {
  output: Buffer;
  categories: string[];
}

export function isPdf(buf: Buffer): boolean {
  if (buf.byteLength < 5) return false;
  return (
    buf[0] === 0x25 && // %
    buf[1] === 0x50 && // P
    buf[2] === 0x44 && // D
    buf[3] === 0x46 && // F
    buf[4] === 0x2d    // -
  );
}

export function stripPdf(input: Buffer): StripPdfResult {
  if (!isPdf(input)) {
    throw new Error('Input is not a valid PDF: missing %PDF- header');
  }

  const ab = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  const bytes = new Uint8Array(ab);

  // Convert to latin1 string (1:1 byte mapping)
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]!);
  }

  const original = str;
  const categories: string[] = [];
  const categorySeen = new Set<string>();

  function addCategory(cat: string) {
    if (!categorySeen.has(cat)) {
      categorySeen.add(cat);
      categories.push(cat);
    }
  }

  // Parse PDF strings rather than using a regex that stops at escaped or
  // nested parentheses. Only change values outside content streams/comments.
  // Every replacement has the exact same length, preserving xref offsets.
  const keys = new Set([...METADATA_KEYS, ...DATE_KEYS]);
  const replacements: Array<[number, number, string]> = [];
  function literalEnd(start: number): number {
    let depth = 1;
    for (let i = start + 1; i < str.length; i++) {
      if (str[i] === '\\') { i++; continue; }
      if (str[i] === '(') depth++;
      if (str[i] === ')' && --depth === 0) return i;
    }
    throw new Error('Unterminated PDF string; file was not modified');
  }
  let cursor = 0;
  while (cursor < str.length) {
    if (str[cursor] === '%') { const end = str.indexOf('\n', cursor); cursor = end < 0 ? str.length : end + 1; continue; }
    if (str.startsWith('stream', cursor) && /[\r\n]/.test(str[cursor + 6] ?? '')) {
      const end = str.indexOf('endstream', cursor + 6);
      if (end < 0) throw new Error('Unterminated PDF stream; file was not modified');
      cursor = end + 9; continue;
    }
    if (str[cursor] === '(') { cursor = literalEnd(cursor) + 1; continue; }
    if (str[cursor] === '<' && str[cursor + 1] === '<') { cursor += 2; continue; }
    if (str[cursor] === '<' && str[cursor + 1] !== '<') { const end = str.indexOf('>', cursor); cursor = end < 0 ? str.length : end + 1; continue; }
    if (str[cursor] !== '/') { cursor++; continue; }
    const match = /^\/([A-Za-z]+)/.exec(str.slice(cursor));
    if (!match) { cursor++; continue; }
    const key = match[1];
    cursor += match[0].length;
    if (key === 'Encrypt') throw new Error('Encrypted PDF cleaning is not supported; decrypt a copy locally first.');
    if (!keys.has(key)) continue;
    while (/\s/.test(str[cursor] ?? '') && cursor < str.length) cursor++;
    if (str[cursor] === '(') {
      const end = literalEnd(cursor);
      addCategory(DATE_KEYS.includes(key) ? 'timestamps' : 'document info');
      const length = end - cursor - 1;
      const value = DATE_KEYS.includes(key) ? 'D:19700101000000'.padEnd(length).slice(0, length) : ' '.repeat(length);
      replacements.push([cursor + 1, end, value]);
      cursor = end + 1;
    } else if (str[cursor] === '<' && str[cursor + 1] !== '<') {
      const end = str.indexOf('>', cursor);
      if (end < 0) throw new Error('Unterminated PDF hex string');
      addCategory('document info');
      replacements.push([cursor + 1, end, str.slice(cursor + 1, end).replace(/[0-9a-f]/gi, '0')]);
      cursor = end + 1;
    }
  }
  for (const [start, end, value] of replacements.reverse()) str = str.slice(0, start) + value + str.slice(end);

  // Blank XMP metadata streams
  const xmpStartPattern = '<?xpacket begin';
  const xmpEndPattern = '<?xpacket end';
  let searchPos = 0;
  while (true) {
    const xmpStart = str.indexOf(xmpStartPattern, searchPos);
    if (xmpStart === -1) break;

    const xmpEnd = str.indexOf(xmpEndPattern, xmpStart);
    if (xmpEnd === -1) break;

    const endClose = str.indexOf('?>', xmpEnd);
    if (endClose === -1) break;
    const xmpAbsEnd = endClose + 2;

    const openClose = str.indexOf('?>', xmpStart);
    if (openClose === -1 || openClose >= xmpEnd) break;
    const contentStart = openClose + 2;

    if (contentStart < xmpEnd) {
      const contentLen = xmpEnd - contentStart;
      str = str.slice(0, contentStart) + '\n'.repeat(contentLen) + str.slice(xmpEnd);
      addCategory('XMP');
    }

    searchPos = xmpAbsEnd;
  }

  // Convert back to bytes
  const output = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    output[i] = str.charCodeAt(i) & 0xff;
  }

  return { output: Buffer.from(output.buffer, output.byteOffset, output.byteLength), categories };
}
