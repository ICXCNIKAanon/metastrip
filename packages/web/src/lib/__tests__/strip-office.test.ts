import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { isZip, stripOffice } from '../strip-office';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal DOCX-like ZIP with optional docProps files. */
async function buildOfficeZip(options: {
  coreXml?: string;
  appXml?: string;
  customXml?: boolean;
  contentXml?: string;
  relsXml?: string;
} = {}): Promise<ArrayBuffer> {
  const zip = new JSZip();

  const coreXml = options.coreXml ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:creator>Alice Smith</dc:creator>
  <cp:lastModifiedBy>Bob Jones</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2024-01-01T00:00:00Z</dcterms:created>
  <cp:revision>42</cp:revision>
</cp:coreProperties>`;

  const appXml = options.appXml ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Microsoft Office Word</Application>
  <AppVersion>16.0000</AppVersion>
  <Company>Acme Corp</Company>
  <TotalTime>120</TotalTime>
</Properties>`;

  const contentTypesXml = options.contentXml ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = options.relsXml ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  zip.file('docProps/core.xml', coreXml);
  zip.file('docProps/app.xml', appXml);
  if (options.customXml) {
    zip.file('docProps/custom.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="ProjectCode">
    <vt:lpwstr xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">TOP-SECRET-123</vt:lpwstr>
  </property>
</Properties>`);
  }
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Hello World</w:t></w:r></w:p></w:body></w:document>');

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------------------
// isZip
// ---------------------------------------------------------------------------

describe('isZip', () => {
  it('returns true for a valid ZIP buffer (PK magic bytes)', async () => {
    const buf = await buildOfficeZip();
    expect(isZip(buf)).toBe(true);
  });

  it('returns false for a JPEG buffer', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(isZip(jpeg.buffer)).toBe(false);
  });

  it('returns false for a PNG buffer', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isZip(png.buffer)).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isZip(new ArrayBuffer(0))).toBe(false);
  });

  it('returns false for a 3-byte buffer', () => {
    expect(isZip(new Uint8Array([0x50, 0x4b, 0x03]).buffer)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripOffice — docProps removal
// ---------------------------------------------------------------------------

describe('stripOffice – removes metadata files', () => {
  it('removes docProps/core.xml', async () => {
    const input = await buildOfficeZip();
    const output = await stripOffice(input);

    const zip = await JSZip.loadAsync(output);
    expect(zip.file('docProps/core.xml')).toBeNull();
  });

  it('removes docProps/app.xml', async () => {
    const input = await buildOfficeZip();
    const output = await stripOffice(input);

    const zip = await JSZip.loadAsync(output);
    expect(zip.file('docProps/app.xml')).toBeNull();
  });

  it('removes docProps/custom.xml when present', async () => {
    const input = await buildOfficeZip({ customXml: true });
    const output = await stripOffice(input);

    const zip = await JSZip.loadAsync(output);
    expect(zip.file('docProps/custom.xml')).toBeNull();
  });

  it('does not fail when docProps files are absent', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
    zip.file('word/document.xml', '<doc>empty</doc>');
    const input = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(stripOffice(input)).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// stripOffice — content preservation
// ---------------------------------------------------------------------------

describe('stripOffice – preserves document content', () => {
  it('preserves word/document.xml', async () => {
    const input = await buildOfficeZip();
    const output = await stripOffice(input);

    const zip = await JSZip.loadAsync(output);
    const doc = zip.file('word/document.xml');
    expect(doc).not.toBeNull();
    const content = await doc!.async('string');
    expect(content).toContain('Hello World');
  });

  it('output is a valid ZIP (can be loaded by JSZip)', async () => {
    const input = await buildOfficeZip();
    const output = await stripOffice(input);
    await expect(JSZip.loadAsync(output)).resolves.toBeTruthy();
  });

  it('output still has PK magic bytes (is a ZIP)', async () => {
    const input = await buildOfficeZip();
    const output = await stripOffice(input);
    expect(isZip(output)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stripOffice — [Content_Types].xml cleanup
// ---------------------------------------------------------------------------

describe('stripOffice – cleans [Content_Types].xml', () => {
  it('removes Override entries for /docProps/ paths', async () => {
    const input = await buildOfficeZip();
    const output = await stripOffice(input);

    const zip = await JSZip.loadAsync(output);
    const ct = zip.file('[Content_Types].xml');
    expect(ct).not.toBeNull();
    const xml = await ct!.async('string');
    expect(xml).not.toContain('/docProps/');
  });

  it('preserves Override entry for word/document.xml', async () => {
    const input = await buildOfficeZip();
    const output = await stripOffice(input);

    const zip = await JSZip.loadAsync(output);
    const xml = await zip.file('[Content_Types].xml')!.async('string');
    expect(xml).toContain('/word/document.xml');
  });
});

// ---------------------------------------------------------------------------
// stripOffice — _rels/.rels cleanup
// ---------------------------------------------------------------------------

describe('stripOffice – cleans _rels/.rels', () => {
  it('removes Relationship entries pointing to docProps/', async () => {
    const input = await buildOfficeZip();
    const output = await stripOffice(input);

    const zip = await JSZip.loadAsync(output);
    const rels = zip.file('_rels/.rels');
    expect(rels).not.toBeNull();
    const xml = await rels!.async('string');
    expect(xml).not.toContain('docProps/');
  });

  it('preserves Relationship entry for word/document.xml', async () => {
    const input = await buildOfficeZip();
    const output = await stripOffice(input);

    const zip = await JSZip.loadAsync(output);
    const xml = await zip.file('_rels/.rels')!.async('string');
    expect(xml).toContain('word/document.xml');
  });
});

// ---------------------------------------------------------------------------
// stripOffice — author/company data gone
// ---------------------------------------------------------------------------

describe('stripOffice – author data stripped', () => {
  it('does not contain creator name in any remaining file', async () => {
    const input = await buildOfficeZip();
    const output = await stripOffice(input);

    const zip = await JSZip.loadAsync(output);
    for (const [name, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const text = await file.async('string');
      expect(text).not.toContain('Alice Smith');
      expect(text).not.toContain('Bob Jones');
      expect(text).not.toContain('Acme Corp');
    }
  });
});
