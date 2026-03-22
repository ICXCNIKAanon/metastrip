import type { Metadata } from 'next';
import CodeBlock from '@/components/code-block';

export const metadata: Metadata = {
  title: 'Documentation — MetaStrip',
  description:
    'Full documentation for MetaStrip: CLI, MCP server, npm package, and REST API reference.',
};

const GETTING_STARTED_CODE = `# Install the CLI
npm install -g @metastrip/cli

# Inspect a file's metadata
metastrip inspect photo.jpg

# Strip all metadata
metastrip clean photo.jpg

# Preview what would be removed
metastrip diff photo.jpg`;

const CLI_INSPECT_CODE = `metastrip inspect photo.jpg
metastrip inspect photo.jpg --format json
metastrip inspect photo.jpg --format summary`;

const CLI_CLEAN_CODE = `# Strip all metadata
metastrip clean photo.jpg

# Write to a new file
metastrip clean photo.jpg --output cleaned.jpg

# Keep specific fields
metastrip clean photo.jpg --keep author,icc

# Strip only certain categories
metastrip clean photo.jpg --categories gps,device

# Control JPEG quality (default: 92)
metastrip clean photo.jpg --quality 85

# Remove ICC color profile
metastrip clean photo.jpg --no-color-profile

# Batch with JSON output
metastrip clean *.jpg --json

# Multiple files
metastrip clean a.jpg b.png c.webp`;

const CLI_DIFF_CODE = `metastrip diff photo.jpg
metastrip diff photo.jpg --keep author,icc`;

const CLI_FORMATS_CODE = `metastrip formats`;

const MCP_CONFIG_CODE = `{
  "mcpServers": {
    "metastrip": {
      "command": "npx",
      "args": ["@metastrip/mcp-server"]
    }
  }
}`;

const NPM_CODE = `import { MetaStrip } from '@metastrip/core';

const ms = new MetaStrip();

// Inspect
const report = await ms.inspect('photo.jpg');
console.log(report.gps);
console.log(report.risk.score);

// Strip
const result = await ms.strip('photo.jpg');
console.log(result.entriesRemoved);

// Strip selectively
await ms.strip('photo.jpg', { keep: ['author', 'icc'] });

// Batch
const batch = await ms.batch(['a.jpg', 'b.png', 'c.webp']);`;

export default function DocsPage() {
  return (
    <div className="space-y-16">
      {/* Supported Formats */}
      <section id="formats">
        <h2 className="text-2xl font-bold text-text-primary mb-4">
          Supported Formats
        </h2>
        <p className="text-text-secondary mb-6">
          MetaStrip supports 14 file formats across images, documents, audio, and video.
        </p>
        <div className="overflow-x-auto rounded-card border border-border mb-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-4 py-3 text-text-tertiary font-medium">Format</th>
                <th className="text-left px-4 py-3 text-text-tertiary font-medium">Type</th>
                <th className="text-left px-4 py-3 text-text-tertiary font-medium">What Gets Removed</th>
                <th className="text-left px-4 py-3 text-text-tertiary font-medium">Quality Loss</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['JPEG', 'Image', 'EXIF, XMP, IPTC, comments', 'None'],
                ['PNG', 'Image', 'tEXt, iTXt, zTXt, eXIf chunks', 'None'],
                ['WebP', 'Image', 'EXIF, XMP chunks', 'None'],
                ['GIF', 'Image', 'Comment extensions, app extensions', 'None'],
                ['SVG', 'Image', 'metadata elements, comments, editor data', 'None'],
                ['PDF', 'Document', 'Author, creator, dates, XMP', 'None'],
                ['DOCX', 'Document', 'Author, company, revision history', 'None'],
                ['XLSX', 'Document', 'Author, company, revision history', 'None'],
                ['PPTX', 'Document', 'Author, company, revision history', 'None'],
                ['MP3', 'Audio', 'ID3v1, ID3v2 tags', 'None'],
                ['WAV', 'Audio', 'LIST/INFO, broadcast extension', 'None'],
                ['FLAC', 'Audio', 'Vorbis comments, cover art', 'None'],
                ['MP4', 'Video', 'User data, GPS, iTunes metadata', 'None'],
                ['MOV', 'Video', 'User data, GPS, iTunes metadata', 'None'],
              ].map(([format, type, removed, quality]) => (
                <tr key={format} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-mono text-text-primary font-medium">{format}</td>
                  <td className="px-4 py-3 text-text-secondary">{type}</td>
                  <td className="px-4 py-3 text-text-secondary">{removed}</td>
                  <td className="px-4 py-3 text-text-secondary">{quality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-text-tertiary text-sm">
          All processing uses binary-level surgery — file content data is never decoded or re-encoded.
        </p>
      </section>

      {/* Getting Started */}
      <section id="getting-started">
        <h1 className="text-3xl font-bold text-text-primary mb-4">
          Getting Started
        </h1>
        <p className="text-text-secondary mb-6">
          Install the MetaStrip CLI globally and start cleaning metadata from your images in seconds.
          The CLI processes files locally — nothing is sent to a server.
        </p>
        <CodeBlock code={GETTING_STARTED_CODE} language="bash" />
      </section>

      {/* CLI Reference */}
      <section id="cli">
        <h2 className="text-2xl font-bold text-text-primary mb-4">
          CLI Reference
        </h2>
        <p className="text-text-secondary mb-8">
          The MetaStrip CLI exposes four commands for inspecting, cleaning, diffing, and listing supported formats.
        </p>

        {/* inspect */}
        <div className="mb-10">
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            <code className="font-mono text-primary">metastrip inspect &lt;file&gt;</code>
          </h3>
          <p className="text-text-secondary text-sm mb-4">
            Show all metadata fields found in a file. Use{' '}
            <code className="font-mono text-text-primary text-xs">--format</code> to control output style.
          </p>
          <div className="mb-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-6 text-text-tertiary font-medium">Option</th>
                  <th className="text-left py-2 text-text-tertiary font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-6 font-mono text-text-primary text-xs">--format table|json|summary</td>
                  <td className="py-2 text-text-secondary">Output format (default: table)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <CodeBlock code={CLI_INSPECT_CODE} language="bash" />
        </div>

        {/* clean */}
        <div className="mb-10">
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            <code className="font-mono text-primary">metastrip clean &lt;files...&gt;</code>
          </h3>
          <p className="text-text-secondary text-sm mb-4">
            Strip metadata from one or more files. Supports glob patterns. Overwrites in-place by default.
          </p>
          <div className="mb-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-6 text-text-tertiary font-medium">Option</th>
                  <th className="text-left py-2 text-text-tertiary font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['--output <path>', 'Write cleaned file to a different path'],
                  ['--keep <fields>', 'Comma-separated fields to preserve (e.g. author,icc)'],
                  ['--categories <cats>', 'Strip only specified categories (gps, device, timestamps…)'],
                  ['--quality <n>', 'JPEG re-encode quality 1–100 (default: 92)'],
                  ['--no-color-profile', 'Remove embedded ICC color profile'],
                  ['--json', 'Output results as JSON (useful for scripting)'],
                ].map(([opt, desc]) => (
                  <tr key={opt as string} className="border-b border-border/50">
                    <td className="py-2 pr-6 font-mono text-text-primary text-xs whitespace-nowrap">{opt}</td>
                    <td className="py-2 text-text-secondary">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CodeBlock code={CLI_CLEAN_CODE} language="bash" />
        </div>

        {/* diff */}
        <div className="mb-10">
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            <code className="font-mono text-primary">metastrip diff &lt;file&gt;</code>
          </h3>
          <p className="text-text-secondary text-sm mb-4">
            Preview which metadata fields would be removed without modifying the file.
          </p>
          <div className="mb-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-6 text-text-tertiary font-medium">Option</th>
                  <th className="text-left py-2 text-text-tertiary font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-6 font-mono text-text-primary text-xs">--keep &lt;fields&gt;</td>
                  <td className="py-2 text-text-secondary">Fields to simulate keeping</td>
                </tr>
              </tbody>
            </table>
          </div>
          <CodeBlock code={CLI_DIFF_CODE} language="bash" />
        </div>

        {/* formats */}
        <div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            <code className="font-mono text-primary">metastrip formats</code>
          </h3>
          <p className="text-text-secondary text-sm mb-4">
            Print all supported file formats and which metadata types are stripped for each.
          </p>
          <CodeBlock code={CLI_FORMATS_CODE} language="bash" />
        </div>
      </section>

      {/* MCP Server */}
      <section id="mcp-server">
        <h2 className="text-2xl font-bold text-text-primary mb-4">
          MCP Server
        </h2>
        <p className="text-text-secondary mb-6">
          MetaStrip ships an{' '}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 transition-colors"
          >
            MCP (Model Context Protocol)
          </a>{' '}
          server so AI assistants like Claude can strip and inspect metadata on your behalf.
          Add it to your Claude Desktop or Cursor config:
        </p>
        <CodeBlock code={MCP_CONFIG_CODE} language="json" />

        <div className="mt-8">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Available tools</h3>
          <div className="space-y-3">
            {[
              {
                name: 'strip_metadata',
                desc: 'Remove all (or selected) metadata from an image file and return the cleaned buffer.',
              },
              {
                name: 'inspect_metadata',
                desc: 'Return a structured report of every metadata field present in a file.',
              },
              {
                name: 'compare_metadata',
                desc: 'Diff two files and show which metadata fields differ between them.',
              },
              {
                name: 'batch_strip',
                desc: 'Strip metadata from multiple files in a single call, returning per-file results.',
              },
            ].map(({ name, desc }) => (
              <div key={name} className="flex gap-4 bg-surface border border-border rounded-card px-4 py-3">
                <code className="font-mono text-sm text-primary shrink-0">{name}</code>
                <p className="text-sm text-text-secondary">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* npm Package */}
      <section id="npm">
        <h2 className="text-2xl font-bold text-text-primary mb-4">
          npm Package
        </h2>
        <p className="text-text-secondary mb-6">
          Use <code className="font-mono text-text-primary text-sm">@metastrip/core</code> directly in your Node.js or
          TypeScript project. Fully typed, zero runtime dependencies.
        </p>
        <div className="mb-6">
          <CodeBlock code="npm install @metastrip/core" language="bash" />
        </div>
        <CodeBlock code={NPM_CODE} language="typescript" />

        <div className="mt-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              <code className="font-mono text-primary text-sm">ms.inspect(path)</code>
            </h3>
            <p className="text-sm text-text-secondary">
              Returns a <code className="font-mono text-text-primary text-xs">MetaReport</code> object containing
              all detected metadata fields, categories, and a{' '}
              <code className="font-mono text-text-primary text-xs">risk</code> object with a score (0–100)
              and a human-readable label.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              <code className="font-mono text-primary text-sm">ms.strip(path, options?)</code>
            </h3>
            <p className="text-sm text-text-secondary">
              Strips metadata from the given file. Returns a{' '}
              <code className="font-mono text-text-primary text-xs">StripResult</code> with{' '}
              <code className="font-mono text-text-primary text-xs">entriesRemoved</code>,{' '}
              <code className="font-mono text-text-primary text-xs">bytesSaved</code>, and the cleaned buffer.
              Pass <code className="font-mono text-text-primary text-xs">{'{ keep: [...] }'}</code> to preserve specific fields.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              <code className="font-mono text-primary text-sm">ms.batch(paths, options?)</code>
            </h3>
            <p className="text-sm text-text-secondary">
              Process multiple files concurrently. Returns an array of{' '}
              <code className="font-mono text-text-primary text-xs">StripResult</code> in the same order as the input paths.
            </p>
          </div>
        </div>
      </section>

      {/* REST API */}
      <section id="api">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-2xl font-bold text-text-primary">REST API</h2>
          <span className="text-xs font-semibold uppercase tracking-wide bg-primary/10 text-primary px-2 py-1 rounded">
            Coming Soon
          </span>
        </div>
        <p className="text-text-secondary mb-4">
          A hosted REST API is in development for teams that need to integrate metadata stripping
          into backend pipelines, mobile apps, or workflows where client-side processing is not an option.
        </p>
        <p className="text-text-secondary mb-6">
          The API will support all formats available in the CLI and npm package, with per-request
          and monthly volume pricing tiers.
        </p>
        <a
          href="/pricing#waitlist"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          Join the waitlist on the Pricing page
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </section>
    </div>
  );
}
