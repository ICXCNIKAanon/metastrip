import { describe, it, expect } from 'vitest';
import { isPdf, stripPdf } from '../strip-pdf';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal synthetic PDF buffer with an optional Info dictionary and XMP stream. */
function buildPdf(options: {
  infoEntries?: Record<string, string>;
  xmp?: string;
  extraBody?: string;
} = {}): ArrayBuffer {
  const { infoEntries = {}, xmp, extraBody = '' } = options;

  // Build Info dictionary entries
  let infoDict = '';
  for (const [key, value] of Object.entries(infoEntries)) {
    infoDict += `/${key} (${value})\n`;
  }

  // Build XMP stream object if provided
  let xmpObj = '';
  if (xmp !== undefined) {
    const xmpContent =
      `<?xpacket begin="\xef\xbb\xbf" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
      xmp +
      `\n<?xpacket end="w"?>`;
    xmpObj = `3 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${xmpContent.length} >>\nstream\n${xmpContent}\nendstream\nendobj\n`;
  }

  const body =
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
    `2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n` +
    (infoDict
      ? `4 0 obj\n<<\n${infoDict}>>\nendobj\n`
      : '') +
    xmpObj +
    extraBody;

  const header = `%PDF-1.4\n`;
  const trailer =
    `xref\n0 1\n0000000000 65535 f \n` +
    `trailer\n<< /Size 1 /Root 1 0 R >>\n` +
    `startxref\n${header.length + body.length}\n%%EOF\n`;

  const full = header + body + trailer;

  const bytes = new Uint8Array(full.length);
  for (let i = 0; i < full.length; i++) {
    bytes[i] = full.charCodeAt(i) & 0xff;
  }
  return bytes.buffer;
}

/** Decode an ArrayBuffer back to a latin1 string for inspection. */
function toString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

// ---------------------------------------------------------------------------
// isPdf
// ---------------------------------------------------------------------------

describe('isPdf', () => {
  it('returns true for a buffer with %PDF- magic bytes', () => {
    const buf = buildPdf();
    expect(isPdf(buf)).toBe(true);
  });

  it('returns false for a JPEG buffer', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(isPdf(jpeg.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isPdf(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a buffer shorter than 5 bytes', () => {
    expect(isPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer)).toBe(false);
  });

  it('returns false for all-zero bytes', () => {
    expect(isPdf(new Uint8Array(16).buffer)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripPdf — byte length preservation
// ---------------------------------------------------------------------------

describe('stripPdf – byte length is preserved', () => {
  it('output length equals input length with no metadata', () => {
    const buf = buildPdf();
    expect(stripPdf(buf).byteLength).toBe(buf.byteLength);
  });

  it('output length equals input length with Author field', () => {
    const buf = buildPdf({ infoEntries: { Author: 'John Smith' } });
    expect(stripPdf(buf).byteLength).toBe(buf.byteLength);
  });

  it('output length equals input length with multiple info fields', () => {
    const buf = buildPdf({
      infoEntries: {
        Author: 'Jane Doe',
        Creator: 'Microsoft Word',
        Producer: 'macOS Quartz PDFContext',
        Title: 'Secret Document',
        Subject: 'Confidential',
        Keywords: 'private, sensitive',
      },
    });
    expect(stripPdf(buf).byteLength).toBe(buf.byteLength);
  });

  it('output length equals input length with XMP stream', () => {
    const buf = buildPdf({
      xmp: '<x:xmpmeta><dc:creator>Alice</dc:creator></x:xmpmeta>',
    });
    expect(stripPdf(buf).byteLength).toBe(buf.byteLength);
  });
});

// ---------------------------------------------------------------------------
// stripPdf — info dictionary values are blanked
// ---------------------------------------------------------------------------

describe('stripPdf – Info dictionary metadata is cleared', () => {
  it('blanks /Author value', () => {
    const buf = buildPdf({ infoEntries: { Author: 'John Smith' } });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/John Smith/);
    expect(result).toMatch(/\/Author \(\s*\)/);
  });

  it('blanks /Creator value', () => {
    const buf = buildPdf({ infoEntries: { Creator: 'Microsoft Word' } });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/Microsoft Word/);
    expect(result).toMatch(/\/Creator \(\s*\)/);
  });

  it('blanks /Producer value', () => {
    const buf = buildPdf({ infoEntries: { Producer: 'Acrobat Distiller 11.0' } });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/Acrobat Distiller/);
    expect(result).toMatch(/\/Producer \(\s*\)/);
  });

  it('blanks /Title value', () => {
    const buf = buildPdf({ infoEntries: { Title: 'My Secret Report' } });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/My Secret Report/);
    expect(result).toMatch(/\/Title \(\s*\)/);
  });

  it('blanks /Subject value', () => {
    const buf = buildPdf({ infoEntries: { Subject: 'Top Secret' } });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/Top Secret/);
  });

  it('blanks /Keywords value', () => {
    const buf = buildPdf({ infoEntries: { Keywords: 'private sensitive classified' } });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/private sensitive classified/);
  });

  it('blanks /Company value', () => {
    const buf = buildPdf({ infoEntries: { Company: 'ACME Corp' } });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/ACME Corp/);
  });

  it('blanks all fields in one pass', () => {
    const buf = buildPdf({
      infoEntries: {
        Author: 'Jane Doe',
        Creator: 'LibreOffice',
        Producer: 'Cairo PDF',
        Title: 'Internal Memo',
        Keywords: 'secret',
      },
    });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/Jane Doe/);
    expect(result).not.toMatch(/LibreOffice/);
    expect(result).not.toMatch(/Cairo PDF/);
    expect(result).not.toMatch(/Internal Memo/);
    expect(result).not.toMatch(/secret/);
  });
});

// ---------------------------------------------------------------------------
// stripPdf — hex-encoded values are zeroed
// ---------------------------------------------------------------------------

describe('stripPdf – hex-encoded metadata is zeroed', () => {
  it('zeros hex-encoded /Author value', () => {
    // Embed a raw hex-form author field directly in the body
    const hex = '4A6F686E20536D697468'; // "John Smith"
    const buf = buildPdf({ extraBody: `/Author <${hex}>\n` });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/4A6F686E/);
    expect(result).toMatch(/\/Author <0+>/);
  });
});

// ---------------------------------------------------------------------------
// stripPdf — date replacement
// ---------------------------------------------------------------------------

describe('stripPdf – dates are replaced with generic date', () => {
  it('replaces /CreationDate with D:19700101000000', () => {
    const buf = buildPdf({ infoEntries: { CreationDate: 'D:20240615120000' } });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/20240615/);
    expect(result).toMatch(/\/CreationDate \(D:19700101000000\)/);
  });

  it('replaces /ModDate with D:19700101000000', () => {
    const buf = buildPdf({ infoEntries: { ModDate: 'D:20230301090000' } });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/20230301/);
    expect(result).toMatch(/\/ModDate \(D:19700101000000\)/);
  });

  it('pads generic date to match original length', () => {
    // Original is longer than D:19700101000000 (16 chars)
    const longDate = 'D:20240615120000+05\'30\'';
    const buf = buildPdf({ infoEntries: { CreationDate: longDate } });
    const result = toString(stripPdf(buf));
    // Value inside parens must still be same length as original
    const match = result.match(/\/CreationDate \(([^)]*)\)/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBe(longDate.length);
  });
});

// ---------------------------------------------------------------------------
// stripPdf — XMP stream is blanked
// ---------------------------------------------------------------------------

describe('stripPdf – XMP metadata stream is blanked', () => {
  it('removes XMP author content', () => {
    const buf = buildPdf({
      xmp: '<x:xmpmeta><dc:creator>Alice Johnson</dc:creator></x:xmpmeta>',
    });
    const result = toString(stripPdf(buf));
    expect(result).not.toMatch(/Alice Johnson/);
  });

  it('preserves xpacket begin/end markers', () => {
    const buf = buildPdf({
      xmp: '<x:xmpmeta><dc:title>Secret</dc:title></x:xmpmeta>',
    });
    const result = toString(stripPdf(buf));
    expect(result).toMatch(/\?xpacket begin/);
    expect(result).toMatch(/\?xpacket end/);
  });

  it('keeps byte length unchanged after XMP blanking', () => {
    const buf = buildPdf({
      xmp: '<x:xmpmeta xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Bob</dc:creator></x:xmpmeta>',
    });
    expect(stripPdf(buf).byteLength).toBe(buf.byteLength);
  });

  it('handles PDF with no XMP without error', () => {
    const buf = buildPdf({ infoEntries: { Author: 'Test' } });
    expect(() => stripPdf(buf)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// stripPdf — PDF structure is preserved
// ---------------------------------------------------------------------------

describe('stripPdf – PDF structure is preserved', () => {
  it('output still starts with %PDF-', () => {
    const buf = buildPdf({ infoEntries: { Author: 'Someone' } });
    const result = toString(stripPdf(buf));
    expect(result.startsWith('%PDF-')).toBe(true);
  });

  it('output still contains %%EOF', () => {
    const buf = buildPdf({ infoEntries: { Creator: 'Word' } });
    const result = toString(stripPdf(buf));
    expect(result).toMatch(/%%EOF/);
  });

  it('isPdf returns true on stripped output', () => {
    const buf = buildPdf({ infoEntries: { Author: 'Alice', Producer: 'Tool' } });
    expect(isPdf(stripPdf(buf))).toBe(true);
  });

  it('no-metadata PDF is returned unchanged', () => {
    const buf = buildPdf();
    const result = stripPdf(buf);
    const inputStr = toString(buf);
    const outputStr = toString(result);
    expect(outputStr).toBe(inputStr);
  });
});
