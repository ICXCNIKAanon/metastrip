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

  for (const key of METADATA_KEYS) {
    const regex = new RegExp('/' + key + '\\s*\\(([^)]*?)\\)', 'g');
    str = str.replace(regex, (_match, value: string) => {
      addCategory('document info');
      const spaces = ' '.repeat(value.length);
      return '/' + key + ' (' + spaces + ')';
    });

    const hexRegex = new RegExp('/' + key + '\\s*<([0-9a-fA-F]*?)>', 'g');
    str = str.replace(hexRegex, (_match, hex: string) => {
      addCategory('document info');
      const zeros = '0'.repeat(hex.length);
      return '/' + key + ' <' + zeros + '>';
    });
  }

  for (const key of DATE_KEYS) {
    const regex = new RegExp('/' + key + '\\s*\\(([^)]*?)\\)', 'g');
    str = str.replace(regex, (_match, value: string) => {
      addCategory('timestamps');
      const generic = 'D:19700101000000';
      const padded = generic + ' '.repeat(Math.max(0, value.length - generic.length));
      return '/' + key + ' (' + padded.slice(0, value.length) + ')';
    });
  }

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
