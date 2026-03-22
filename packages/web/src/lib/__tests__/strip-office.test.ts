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
  // New options for extended metadata
  wordCommentsXml?: string;
  wordPeopleXml?: string;
  wordDocumentXml?: string;
  wordSettingsXml?: string;
  xlCommentsXml?: string;
  xlPersonsXml?: string;
  xlThreadedCommentsXml?: string;
  pptCommentAuthorsXml?: string;
  pptCommentXml?: string;
  customXmlData?: string;
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

  // word/document.xml — use custom or default (with or without tracked changes)
  zip.file(
    'word/document.xml',
    options.wordDocumentXml ??
      '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Hello World</w:t></w:r></w:p></w:body></w:document>',
  );

  // Optional DOCX-specific files
  if (options.wordCommentsXml !== undefined) {
    zip.file('word/comments.xml', options.wordCommentsXml);
  }
  if (options.wordPeopleXml !== undefined) {
    zip.file('word/people.xml', options.wordPeopleXml);
  }
  if (options.wordSettingsXml !== undefined) {
    zip.file('word/settings.xml', options.wordSettingsXml);
  }

  // Optional XLSX-specific files
  if (options.xlCommentsXml !== undefined) {
    zip.file('xl/comments1.xml', options.xlCommentsXml);
  }
  if (options.xlPersonsXml !== undefined) {
    zip.file('xl/persons.xml', options.xlPersonsXml);
  }
  if (options.xlThreadedCommentsXml !== undefined) {
    zip.file('xl/threadedComments/threadedComment1.xml', options.xlThreadedCommentsXml);
  }

  // Optional PPTX-specific files
  if (options.pptCommentAuthorsXml !== undefined) {
    zip.file('ppt/commentAuthors.xml', options.pptCommentAuthorsXml);
  }
  if (options.pptCommentXml !== undefined) {
    zip.file('ppt/comments/comment1.xml', options.pptCommentXml);
  }

  // Optional customXml
  if (options.customXmlData !== undefined) {
    zip.file('customXml/item1.xml', options.customXmlData);
  }

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

// ---------------------------------------------------------------------------
// stripOffice — DOCX comments and people files removed
// ---------------------------------------------------------------------------

describe('stripOffice – DOCX comments and people files removed', () => {
  const DOCX_COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="1" w:author="Alice Smith" w:date="2024-01-01T10:00:00Z" w:initials="AS">
    <w:p><w:r><w:t>Please review this section.</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;

  const DOCX_PEOPLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:people xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:person w:author="Alice Smith">
    <w:presenceInfo w:providerId="None" w:userId="alice@example.com"/>
  </w:person>
</w:people>`;

  it('removes word/comments.xml', async () => {
    const input = await buildOfficeZip({ wordCommentsXml: DOCX_COMMENTS_XML });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    expect(zip.file('word/comments.xml')).toBeNull();
  });

  it('removes word/people.xml', async () => {
    const input = await buildOfficeZip({ wordPeopleXml: DOCX_PEOPLE_XML });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    expect(zip.file('word/people.xml')).toBeNull();
  });

  it('commenter name not present in any remaining file after removing comments.xml', async () => {
    const input = await buildOfficeZip({ wordCommentsXml: DOCX_COMMENTS_XML });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    for (const [, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const text = await file.async('string');
      expect(text).not.toContain('Please review this section.');
    }
  });

  it('contributor name not present in any remaining file after removing people.xml', async () => {
    const input = await buildOfficeZip({ wordPeopleXml: DOCX_PEOPLE_XML });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    for (const [, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const text = await file.async('string');
      expect(text).not.toContain('alice@example.com');
    }
  });
});

// ---------------------------------------------------------------------------
// stripOffice — tracked change author/date attributes stripped
// ---------------------------------------------------------------------------

describe('stripOffice – tracked change attributes stripped from document.xml', () => {
  const DOC_WITH_TRACKED_CHANGES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:body>
    <w:p w:rsidR="00A12345" w:rsidRDefault="00B67890" w14:paraId="1A2B3C4D" w14:textId="5E6F7A8B">
      <w:ins w:id="1" w:author="Alice Smith" w:date="2024-01-15T09:30:00Z">
        <w:r><w:t>inserted text</w:t></w:r>
      </w:ins>
      <w:del w:id="2" w:author="Bob Jones" w:date="2024-01-16T14:00:00Z">
        <w:r><w:delText>deleted text</w:delText></w:r>
      </w:del>
    </w:p>
    <w:p>
      <w:r w:rsidRPr="00C11111"><w:t>Hello World</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  it('strips w:author attributes from tracked change elements', async () => {
    const input = await buildOfficeZip({ wordDocumentXml: DOC_WITH_TRACKED_CHANGES });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).not.toContain('w:author=');
  });

  it('strips w:date attributes from tracked change elements', async () => {
    const input = await buildOfficeZip({ wordDocumentXml: DOC_WITH_TRACKED_CHANGES });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).not.toContain('w:date=');
  });

  it('strips w:rsidR attributes (revision session fingerprint)', async () => {
    const input = await buildOfficeZip({ wordDocumentXml: DOC_WITH_TRACKED_CHANGES });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).not.toContain('w:rsidR=');
  });

  it('strips w:rsidRDefault attributes', async () => {
    const input = await buildOfficeZip({ wordDocumentXml: DOC_WITH_TRACKED_CHANGES });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).not.toContain('w:rsidRDefault=');
  });

  it('strips w14:paraId attributes', async () => {
    const input = await buildOfficeZip({ wordDocumentXml: DOC_WITH_TRACKED_CHANGES });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).not.toContain('w14:paraId=');
  });

  it('strips w14:textId attributes', async () => {
    const input = await buildOfficeZip({ wordDocumentXml: DOC_WITH_TRACKED_CHANGES });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).not.toContain('w14:textId=');
  });

  it('preserves document text content after attribute stripping', async () => {
    const input = await buildOfficeZip({ wordDocumentXml: DOC_WITH_TRACKED_CHANGES });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).toContain('Hello World');
    expect(doc).toContain('inserted text');
    expect(doc).toContain('deleted text');
  });

  it('author names are not in any remaining file', async () => {
    const input = await buildOfficeZip({ wordDocumentXml: DOC_WITH_TRACKED_CHANGES });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    for (const [, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const text = await file.async('string');
      expect(text).not.toContain('Alice Smith');
      expect(text).not.toContain('Bob Jones');
    }
  });
});

// ---------------------------------------------------------------------------
// stripOffice — word/settings.xml rsid stripping
// ---------------------------------------------------------------------------

describe('stripOffice – rsid values stripped from word/settings.xml', () => {
  const SETTINGS_WITH_RSIDS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:rsids>
    <w:rsidDel w:val="00A11111"/>
    <w:rsid w:val="00B22222"/>
    <w:rsid w:val="00C33333"/>
  </w:rsids>
  <w:defaultTabStop w:val="720"/>
</w:settings>`;

  it('removes w:rsids block from settings.xml', async () => {
    const input = await buildOfficeZip({ wordSettingsXml: SETTINGS_WITH_RSIDS });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    const settings = await zip.file('word/settings.xml')!.async('string');
    expect(settings).not.toContain('<w:rsids>');
    expect(settings).not.toContain('</w:rsids>');
  });

  it('preserves other settings elements', async () => {
    const input = await buildOfficeZip({ wordSettingsXml: SETTINGS_WITH_RSIDS });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    const settings = await zip.file('word/settings.xml')!.async('string');
    expect(settings).toContain('w:zoom');
    expect(settings).toContain('w:defaultTabStop');
  });
});

// ---------------------------------------------------------------------------
// stripOffice — customXml directory removed
// ---------------------------------------------------------------------------

describe('stripOffice – customXml directory removed', () => {
  it('removes customXml/item1.xml', async () => {
    const input = await buildOfficeZip({
      customXmlData: '<root><secret>internal-project-code-XYZ</secret></root>',
    });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    expect(zip.file('customXml/item1.xml')).toBeNull();
  });

  it('custom XML data not present in any remaining file', async () => {
    const input = await buildOfficeZip({
      customXmlData: '<root><secret>internal-project-code-XYZ</secret></root>',
    });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    for (const [, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const text = await file.async('string');
      expect(text).not.toContain('internal-project-code-XYZ');
    }
  });
});

// ---------------------------------------------------------------------------
// stripOffice — XLSX comments removed
// ---------------------------------------------------------------------------

describe('stripOffice – XLSX comments removed', () => {
  const XL_COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <authors><author>Alice Smith</author></authors>
  <commentList>
    <comment ref="A1" authorId="0">
      <text><r><t>Budget is confidential</t></r></text>
    </comment>
  </commentList>
</comments>`;

  const XL_THREADED_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments">
  <threadedComment ref="B2" dT="2024-01-01T09:00:00" personId="123">
    <text>Check this number - Bob</text>
  </threadedComment>
</ThreadedComments>`;

  it('removes xl/comments1.xml', async () => {
    const input = await buildOfficeZip({ xlCommentsXml: XL_COMMENTS_XML });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    expect(zip.file('xl/comments1.xml')).toBeNull();
  });

  it('removes xl/threadedComments/threadedComment1.xml', async () => {
    const input = await buildOfficeZip({ xlThreadedCommentsXml: XL_THREADED_XML });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    expect(zip.file('xl/threadedComments/threadedComment1.xml')).toBeNull();
  });

  it('removes xl/persons.xml', async () => {
    const XL_PERSONS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<persons xmlns="http://schemas.microsoft.com/office/spreadsheetml/2019/namedsheetviews">
  <person displayName="Alice Smith" id="123" userId="alice@example.com"/>
</persons>`;
    const input = await buildOfficeZip({ xlPersonsXml: XL_PERSONS });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    expect(zip.file('xl/persons.xml')).toBeNull();
  });

  it('XLSX comment author name not in any remaining file', async () => {
    const input = await buildOfficeZip({ xlCommentsXml: XL_COMMENTS_XML });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    for (const [, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const text = await file.async('string');
      expect(text).not.toContain('Budget is confidential');
      expect(text).not.toContain('Alice Smith');
    }
  });
});

// ---------------------------------------------------------------------------
// stripOffice — PPTX comment authors removed
// ---------------------------------------------------------------------------

describe('stripOffice – PPTX comment authors removed', () => {
  const PPT_COMMENT_AUTHORS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:cmAuthorLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cmAuthor id="0" name="Alice Smith" initials="AS" lastIdx="1" clrIdx="0"/>
</p:cmAuthorLst>`;

  const PPT_COMMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:cmLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cm authorId="0" dt="2024-01-01T10:00:00" idx="1">
    <p:pos x="1000" y="1000"/>
    <p:text>This slide needs work - Alice</p:text>
  </p:cm>
</p:cmLst>`;

  it('removes ppt/commentAuthors.xml', async () => {
    const input = await buildOfficeZip({ pptCommentAuthorsXml: PPT_COMMENT_AUTHORS_XML });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    expect(zip.file('ppt/commentAuthors.xml')).toBeNull();
  });

  it('removes ppt/comments/comment1.xml', async () => {
    const input = await buildOfficeZip({ pptCommentXml: PPT_COMMENT_XML });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    expect(zip.file('ppt/comments/comment1.xml')).toBeNull();
  });

  it('PPTX comment author name not in any remaining file', async () => {
    const input = await buildOfficeZip({
      pptCommentAuthorsXml: PPT_COMMENT_AUTHORS_XML,
      pptCommentXml: PPT_COMMENT_XML,
    });
    const output = await stripOffice(input);
    const zip = await JSZip.loadAsync(output);
    for (const [, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const text = await file.async('string');
      expect(text).not.toContain('Alice Smith');
      expect(text).not.toContain('This slide needs work');
    }
  });
});
