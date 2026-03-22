const METADATA_KEYS = [
  'Author', 'Creator', 'Producer', 'Title', 'Subject', 'Keywords',
  'Company', 'Manager', 'SourceModified',
];

const DATE_KEYS = ['CreationDate', 'ModDate'];

export function stripPdf(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);

  // Convert to string using latin1 so every byte value 0–255 maps 1-to-1
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }

  // Replace parenthesized metadata values: /Author (value) → /Author (     )
  // Keeping the same length preserves all byte offsets so xref tables stay valid.
  for (const key of METADATA_KEYS) {
    // Parenthesized form: /Key (value)
    const regex = new RegExp('/' + key + '\\s*\\(([^)]*?)\\)', 'g');
    str = str.replace(regex, (_match, value: string) => {
      const spaces = ' '.repeat(value.length);
      return '/' + key + ' (' + spaces + ')';
    });

    // Hex-encoded form: /Key <hex>
    const hexRegex = new RegExp('/' + key + '\\s*<([0-9a-fA-F]*?)>', 'g');
    str = str.replace(hexRegex, (_match, hex: string) => {
      const zeros = '0'.repeat(hex.length);
      return '/' + key + ' <' + zeros + '>';
    });
  }

  // Replace date values with a same-length generic date to keep offsets stable
  for (const key of DATE_KEYS) {
    const regex = new RegExp('/' + key + '\\s*\\(([^)]*?)\\)', 'g');
    str = str.replace(regex, (_match, value: string) => {
      const generic = 'D:19700101000000';
      const padded = generic + ' '.repeat(Math.max(0, value.length - generic.length));
      return '/' + key + ' (' + padded.slice(0, value.length) + ')';
    });
  }

  // Blank out XMP metadata streams.
  // XMP is delimited by <?xpacket begin … ?> … <?xpacket end … ?>
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

    // Find where the opening xpacket tag ends
    const openClose = str.indexOf('?>', xmpStart);
    if (openClose === -1 || openClose >= xmpEnd) break;
    const contentStart = openClose + 2;

    // Replace only the content between the two xpacket tags with newlines
    if (contentStart < xmpEnd) {
      const contentLen = xmpEnd - contentStart;
      str = str.slice(0, contentStart) + '\n'.repeat(contentLen) + str.slice(xmpEnd);
    }

    searchPos = xmpAbsEnd;
  }

  // Convert back to bytes (latin1: charCodeAt gives 0–255)
  const output = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    output[i] = str.charCodeAt(i) & 0xff;
  }

  return output.buffer;
}

export function isPdf(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const bytes = new Uint8Array(buffer);
  // Magic bytes: %PDF-
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d    // -
  );
}
