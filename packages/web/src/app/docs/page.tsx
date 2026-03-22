import type { Metadata } from 'next';
import CodeBlock from '@/components/code-block';
import Breadcrumbs from '@/components/breadcrumbs';

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
      <Breadcrumbs items={[{ name: 'Documentation', href: '/docs' }]} />
      {/* Supported Formats */}
      <section id="formats">
        <h2 className="text-2xl font-bold text-text-primary mb-4">
          Supported Formats
        </h2>
        <p className="text-text-secondary mb-6">
          MetaStrip supports 20 file formats across images, documents, audio, and video.
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
                ['HEIC/HEIF', 'Image', 'udta box, GPS, iTunes metadata', 'None'],
                ['AVIF', 'Image', 'udta box, GPS, iTunes metadata', 'None'],
                ['M4A', 'Audio', 'udta box, iTunes metadata', 'None'],
                ['AVI', 'Video', 'LIST/INFO, JUNK', 'None'],
                ['MKV/WebM', 'Video', 'Tags element', 'None'],
                ['EPUB', 'Document', 'DC metadata (creator, publisher, date, rights)', 'None'],
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

      {/* Browser Extension */}
      <section id="browser-extension">
        <h2 className="text-2xl font-bold text-text-primary mb-4">Browser Extension</h2>
        <p className="text-text-secondary mb-4">
          The MetaStrip Chrome extension automatically strips metadata from images before you upload
          them to any website. It also lets you right-click any image on any page to inspect its metadata.
        </p>

        <h3 className="text-lg font-semibold text-text-primary mt-6 mb-3">Chrome — Install from GitHub</h3>
        <ol className="text-text-secondary space-y-2 mb-6 list-decimal list-inside">
          <li>Download or clone the repo: <code className="text-primary bg-surface px-1.5 py-0.5 rounded text-sm font-mono">git clone https://github.com/ICXCNIKAanon/metastrip.git</code></li>
          <li>Open Chrome and go to <code className="text-primary bg-surface px-1.5 py-0.5 rounded text-sm font-mono">chrome://extensions</code></li>
          <li>Enable <strong className="text-text-primary">Developer mode</strong> (toggle in top-right)</li>
          <li>Click <strong className="text-text-primary">Load unpacked</strong></li>
          <li>Select the <code className="text-primary bg-surface px-1.5 py-0.5 rounded text-sm font-mono">packages/browser-extension</code> folder</li>
        </ol>

        <h3 className="text-lg font-semibold text-text-primary mt-6 mb-3">Firefox — Install from GitHub</h3>
        <ol className="text-text-secondary space-y-2 mb-6 list-decimal list-inside">
          <li>Clone this repo: <code className="text-primary bg-surface px-1.5 py-0.5 rounded text-sm font-mono">git clone https://github.com/ICXCNIKAanon/metastrip.git</code></li>
          <li>Open <code className="text-primary bg-surface px-1.5 py-0.5 rounded text-sm font-mono">about:debugging#/runtime/this-firefox</code></li>
          <li>Click <strong className="text-text-primary">Load Temporary Add-on...</strong></li>
          <li>Select <code className="text-primary bg-surface px-1.5 py-0.5 rounded text-sm font-mono">manifest.json</code> from <code className="text-primary bg-surface px-1.5 py-0.5 rounded text-sm font-mono">packages/firefox-extension</code></li>
        </ol>

        <h3 className="text-lg font-semibold text-text-primary mt-6 mb-3">Features</h3>
        <ul className="text-text-secondary space-y-2 mb-6 list-disc list-inside">
          <li><strong className="text-text-primary">Auto-strip on standard file uploads</strong> — strips metadata when you use a file picker on forms, job applications, and most websites</li>
          <li><strong className="text-text-primary">Right-click → Inspect Metadata</strong> — view GPS, device info, and timestamps on any image</li>
          <li><strong className="text-text-primary">Scan All Images on Page</strong> — right-click the page to scan every image for metadata</li>
          <li><strong className="text-text-primary">Drag &amp; paste alerts</strong> — warns when dragged or pasted images contain metadata</li>
          <li><strong className="text-text-primary">Toggle on/off</strong> — click the extension icon to pause protection</li>
        </ul>
        <div className="bg-surface border border-border rounded-card px-4 py-3 mb-6">
          <p className="text-sm text-text-secondary">
            <strong className="text-text-primary">Note:</strong> Gmail, Slack, and Discord use custom upload handlers that bypass standard file inputs. For these apps, strip your files first using the{' '}
            <a href="/" className="text-primary hover:underline">web tool</a>
            {' '}or CLI.
          </p>
        </div>
      </section>

      {/* VS Code Extension */}
      <section id="vscode">
        <h2 className="text-2xl font-bold text-text-primary mb-4">VS Code Extension</h2>
        <p className="text-text-secondary mb-4">
          Right-click any image file or folder in VS Code to strip metadata instantly.
        </p>

        <h3 className="text-lg font-semibold text-text-primary mt-6 mb-3">Install from Source</h3>
        <CodeBlock language="bash" code={`git clone https://github.com/ICXCNIKAanon/metastrip.git
cd metastrip/packages/vscode
npm install && npm run build
npx @vscode/vsce package
# Install the .vsix file: code --install-extension metastrip-0.1.0.vsix`} />

        <h3 className="text-lg font-semibold text-text-primary mt-6 mb-3">Usage</h3>
        <ul className="text-text-secondary space-y-2 mb-6 list-disc list-inside">
          <li>Right-click any <code className="text-primary bg-surface px-1.5 py-0.5 rounded text-sm font-mono">.jpg/.jpeg/.png/.webp</code> file → <strong className="text-text-primary">MetaStrip: Strip Metadata</strong></li>
          <li>Right-click any folder → <strong className="text-text-primary">MetaStrip: Strip All Images in Folder</strong></li>
        </ul>
      </section>

      {/* Git Hooks */}
      <section id="hooks">
        <h2 className="text-2xl font-bold text-text-primary mb-4">Git Hooks</h2>
        <p className="text-text-secondary mb-4">
          Automatically strip metadata from every image you commit. One command to install, works forever.
        </p>
        <CodeBlock language="bash" code={`# Install the pre-commit hook
npx metastrip-hooks install

# That's it. Every commit now auto-strips image metadata.
# To uninstall:
npx metastrip-hooks uninstall`} />
        <p className="text-text-secondary mt-4 mb-6">
          Also built into{' '}
          <a href="https://shipsafe.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ShipSafe</a>
          {' '}— if you use ShipSafe, metadata stripping is automatic with no extra setup.
        </p>
      </section>

      {/* REST API */}
      <section id="api">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-2xl font-bold text-text-primary">REST API</h2>
          <span className="text-xs font-semibold uppercase tracking-wide bg-primary/10 text-primary px-2 py-1 rounded">
            Live — Free Beta
          </span>
        </div>
        <p className="text-text-secondary mb-4">
          Strip metadata from any supported file via HTTP. Send a file, get back the cleaned version. Supports all 20 formats.
        </p>

        <h3 className="text-lg font-semibold text-text-primary mt-6 mb-3">POST /api/v1/strip</h3>
        <p className="text-text-secondary mb-3">Upload a file, receive the cleaned version with metadata removed.</p>
        <CodeBlock language="bash" code={`curl -X POST https://metastrip.ai/api/v1/strip \\
  -F file=@photo.jpg \\
  -o photo.cleaned.jpg`} />
        <p className="text-text-secondary text-sm mt-2 mb-6">Response headers include <code className="text-primary bg-surface px-1 py-0.5 rounded text-xs font-mono">X-MetaStrip-Original-Size</code>, <code className="text-primary bg-surface px-1 py-0.5 rounded text-xs font-mono">X-MetaStrip-Stripped-Size</code>, and <code className="text-primary bg-surface px-1 py-0.5 rounded text-xs font-mono">X-MetaStrip-Saved</code>.</p>

        <h3 className="text-lg font-semibold text-text-primary mt-6 mb-3">POST /api/v1/inspect</h3>
        <p className="text-text-secondary mb-3">Upload a file, receive a JSON report of what metadata was found.</p>
        <CodeBlock language="bash" code={`curl -X POST https://metastrip.ai/api/v1/inspect \\
  -F file=@photo.jpg`} />
        <CodeBlock language="json" code={`{
  "file": { "name": "photo.jpg", "type": "image/jpeg", "size": 3145728, "format": "jpeg" },
  "metadata": { "found": true, "bytesRemovable": 12458 },
  "strippedSize": 3133270
}`} />

        <div className="bg-surface border border-border rounded-card px-4 py-3 mt-6">
          <p className="text-sm text-text-secondary">
            <strong className="text-text-primary">Free beta:</strong> The API is currently free with no authentication required. Rate limits and paid tiers will be introduced in the future. Max file size: 50MB.
          </p>
        </div>
      </section>
    </div>
  );
}
