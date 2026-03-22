# MetaStrip

**The world's most complete metadata privacy platform.**

Remove GPS coordinates, device identifiers, timestamps, and hidden metadata from images, videos, and documents. Available as a free web tool, CLI, npm package, and MCP server for AI agents.

## Quick Start

### Web App
Visit [metastrip.ai](https://metastrip.ai) — drag, drop, done. No signup, no upload. Files processed in your browser.

### CLI
```bash
npm install -g @metastrip/cli

# Inspect metadata
metastrip inspect photo.jpg

# Strip all metadata
metastrip clean photo.jpg

# Keep copyright, remove everything else
metastrip clean photo.jpg --keep author

# Process all JPEGs in a directory
metastrip clean *.jpg --output ./cleaned/

# Dry run — see what would be removed
metastrip diff photo.jpg
```

### MCP Server (AI Agents)
```bash
npm install -g @metastrip/mcp-server
```

Add to your MCP client config (Claude Desktop, Cursor, etc.):
```json
{
  "mcpServers": {
    "metastrip": {
      "command": "npx",
      "args": ["@metastrip/mcp-server"]
    }
  }
}
```

Now any AI agent can use these tools:
- **strip_metadata** — Remove metadata from a file
- **inspect_metadata** — View metadata with privacy risk assessment
- **compare_metadata** — Before/after metadata diff
- **batch_strip** — Process multiple files at once

### GitHub Action

Automatically strip metadata from images in pull requests. Zero quality loss — binary-level stripping, no re-encoding.

```yaml
# .github/workflows/strip-metadata.yml
name: Strip Image Metadata

on:
  pull_request:
    paths: ['**.jpg', '**.jpeg', '**.png', '**.webp']

permissions:
  contents: write

jobs:
  strip-metadata:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.head_ref }}

      - uses: ICXCNIKAanon/metastrip@v1
        with:
          path: '.'
          commit: 'true'

      - name: Push changes
        run: git push
```

#### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `path` | `.` | Directory to scan for images |
| `commit` | `true` | Auto-commit stripped files |
| `commit-message` | `chore: strip image metadata [MetaStrip]` | Commit message |
| `webhook-url` | `` | Webhook URL to POST results to (Slack, Discord, or any endpoint) |
| `notify` | `true` | Send notification when files are stripped (requires `webhook-url`) |

#### Outputs

| Output | Description |
|--------|-------------|
| `files-stripped` | Number of files that had metadata removed |
| `files-clean` | Number of files already clean |
| `files-total` | Total number of image files scanned |

#### Slack / Discord notifications

Add a `webhook-url` to get a notification whenever MetaStrip cleans images. The payload is compatible with Slack Incoming Webhooks, Discord webhooks, and any generic HTTP endpoint.

```yaml
      - uses: ICXCNIKAanon/metastrip@main
        with:
          path: '.'
          commit: 'true'
          webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
```

Store your webhook URL as a [GitHub Actions secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets) (`SLACK_WEBHOOK_URL` or `DISCORD_WEBHOOK_URL`). Notifications are only sent when at least one file is actually stripped — no noise on clean runs. Set `notify: 'false'` to disable.

See [examples/github-action-workflow.yml](examples/github-action-workflow.yml) for a full workflow example.

### Library (npm)
```bash
npm install @metastrip/core
```

```typescript
import { MetaStrip } from '@metastrip/core';

const ms = new MetaStrip();

// Inspect
const report = await ms.inspect('photo.jpg');
console.log(report.gps);         // { latitude: 37.7749, longitude: -122.4194 }
console.log(report.risk.score);  // 85 (critical - GPS found!)

// Strip
const result = await ms.strip('photo.jpg');
console.log(result.entriesRemoved); // 47

// Strip selectively
await ms.strip('photo.jpg', { keep: ['author', 'icc'] });

// Batch
const batch = await ms.batch(['a.jpg', 'b.png', 'c.webp']);
console.log(batch.totalEntriesRemoved); // 142
```

## Supported Formats

| Type | Formats | Processing |
|------|---------|-----------|
| Images | JPEG, PNG, WebP, HEIC, TIFF, GIF, AVIF | Client-side (WASM) or native |
| Videos | MP4, MOV, MKV, AVI, WebM | FFmpeg (server-side) |
| Audio | MP3, FLAC, WAV, OGG, AAC | Coming soon |
| Documents | PDF, DOCX, XLSX, PPTX | Coming soon |

## What Gets Removed

| Category | Examples | Risk Level |
|----------|----------|-----------|
| GPS | Latitude, longitude, altitude, direction | Critical |
| Device | Camera make/model, serial numbers, lens info | High |
| Author | Artist name, copyright, creator | Medium |
| Timestamps | Date taken, date modified, date digitized | Medium |
| Software | Editing software, processing history | Low |
| AI | Generation model, prompt, parameters | Low |
| Thumbnails | Embedded preview images (can contain original GPS!) | Medium |

## Architecture

```
@metastrip/core         → Rust-grade metadata engine in TypeScript
  ├── ImageProcessor    → Sharp + ExifReader for EXIF/XMP/IPTC
  ├── VideoProcessor    → FFmpeg bindings for container metadata
  ├── AudioProcessor    → music-metadata for ID3/Vorbis (planned)
  └── DocProcessor      → PDF/Office metadata (planned)

@metastrip/cli          → Commander-based CLI with beautiful output
@metastrip/mcp-server   → MCP SDK server with 4 tools
@metastrip/web          → Next.js 15 + client-side WASM processing
```

## Project Structure

```
metastrip/
├── packages/
│   ├── core/           # Core processing engine
│   ├── cli/            # CLI tool
│   ├── hooks/          # Git hooks — auto-strip on commit
│   ├── mcp-server/     # MCP server for AI agents
│   └── web/            # Next.js web application
├── action.yml          # GitHub Action definition
├── action/strip.mjs    # GitHub Action runner script
├── examples/           # Example workflows
├── .github/workflows/  # CI/CD
└── package.json        # Workspace root
```

## Development

```bash
# Install dependencies
npm install

# Build everything
npm run build

# Build individual packages
npm run build:core
npm run build:cli
npm run build:mcp

# Run web app in dev mode
npm run dev:web

# Run CLI locally
node packages/cli/dist/index.js inspect photo.jpg
```

## API (Coming Soon)

```bash
# Strip metadata
curl -X POST https://api.metastrip.ai/v1/strip \
  -F file=@photo.jpg \
  -H "Authorization: Bearer ms_xxx"

# Inspect metadata
curl -X POST https://api.metastrip.ai/v1/inspect \
  -F file=@photo.jpg
```

## Privacy

- **Images**: Processed client-side in the browser (WASM). Files never touch our servers.
- **Videos**: Server-side processing required. Files encrypted in transit, processed in ephemeral containers, deleted within 60 seconds.
- **API**: Files processed in memory where possible. No disk writes for files under 50MB.
- **We never store, analyze, or log the metadata we remove.**

## License

MIT
