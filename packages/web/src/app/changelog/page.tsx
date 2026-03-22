import type { Metadata } from 'next';
import Link from 'next/link';
import FeatureRequest from '@/components/feature-request';
import JsonLd from '@/components/json-ld';

export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'MetaStrip changelog — every release, feature, and improvement. Web app, CLI, MCP server, git hooks, browser extension, and more.',
  alternates: {
    canonical: 'https://metastrip.ai/changelog',
  },
  openGraph: {
    title: 'Changelog | MetaStrip',
    description: 'Full version history for MetaStrip. Track every feature, fix, and improvement.',
    url: 'https://metastrip.ai/changelog',
    type: 'website',
  },
};

interface ChangelogEntry {
  version: string;
  date: string;
  highlights: string[];
}

const changelog: ChangelogEntry[] = [
  {
    version: '0.3.0',
    date: 'March 22, 2026',
    highlights: [
      'Custom metadata injection: type any address → geocodes to GPS coordinates via OpenStreetMap, set custom device make/model, pick any date/time',
      '14 file formats: added GIF, SVG, PDF, DOCX, XLSX, PPTX, MP3, WAV, FLAC, MP4, MOV — all with zero quality loss',
      'File comparison mode at /compare: upload two files to detect if same device (serial number + camera matching)',
      'Chrome extension: embedded dark map with pin for GPS locations in inspect panel',
      'Chrome extension: network-level interception (fetch/XHR) for broader upload coverage',
      'Chrome extension: honest notifications — only claims success when verifiably stripped',
      'Chrome extension: "Scan All Images on Page" — right-click to scan every image on any webpage',
      'GitHub Action: webhook/Slack/Discord notifications when images are stripped in CI',
      'CLI: shell autocomplete for bash, zsh, and fish',
      'CLI: .metastriprc config file for default settings',
      '10 new SEO blog posts (14 total) covering platform comparisons, format guides, security risks',
      'Privacy policy and Terms of Service pages',
      'Changelog page with feature request section (GitHub Discussions)',
    ],
  },
  {
    version: '0.2.0',
    date: 'March 21, 2026',
    highlights: [
      'Chrome extension: right-click any image → "Inspect Metadata" — see GPS, device info, timestamps in a side panel',
      'Chrome extension: auto-strip metadata on standard file uploads',
      'VS Code extension: right-click any image or folder to strip metadata',
      'GitHub Action: `uses: ICXCNIKAanon/metastrip@main` — auto-strip images in CI/CD pipelines',
      'REST API foundation: `/v1/strip` and `/v1/inspect` endpoints (Hono-based)',
      'Fake metadata injection: toggle to inject random decoy GPS, device, and timestamps after stripping',
      'Bulk drag-and-drop: process multiple images at once on the web tool',
    ],
  },
  {
    version: '0.1.1',
    date: 'March 20, 2026',
    highlights: [
      'ShipSafe integration: MetaStrip powers ShipSafe\'s automatic image metadata stripping on commit',
      'Shield logo + favicon across all surfaces',
      'OG image for social previews (iMessage, Twitter, LinkedIn)',
      'SEO optimization: sitemap.xml, robots.txt, llms.txt, llms-full.txt, ai-plugin.json',
      'HowTo + Organization JSON-LD structured data',
      'RSS feed at /feed.xml for blog content syndication',
      'Answer-first blog post restructuring for AI search engines',
      'New blog post: "MetaStrip vs ExifTool" comparison',
      'security.txt at /.well-known/security.txt',
    ],
  },
  {
    version: '0.1.0',
    date: 'March 19, 2026',
    highlights: [
      'Initial launch of MetaStrip — metadata privacy platform',
      'Web app at metastrip.ai: drag-and-drop metadata removal with privacy risk scoring',
      'Zero quality loss: binary-level metadata surgery (JPEG, PNG, WebP) — no image re-encoding',
      'Adaptive results: GPS map view when location found, risk score view otherwise',
      'Before/after comparison with download',
      'Client-side processing: files never leave the browser',
      '@metastrip/core v0.1.0: core processing engine (Sharp + ExifReader)',
      '@metastrip/cli v0.1.0: CLI tool with inspect, clean, diff, formats commands',
      '@metastrip/mcp-server v0.1.0: MCP server with 4 tools for AI agents',
      '@metastrip/hooks v0.1.0: pre-commit git hooks for automatic metadata stripping',
      'Documentation hub at /docs: CLI, MCP server, npm package, API reference',
      'Blog with 3 SEO-targeted launch posts',
      'Pricing page with free tier + API waitlist',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'MetaStrip',
          softwareVersion: '0.3.0',
          applicationCategory: 'UtilitiesApplication',
          operatingSystem: 'Web Browser, macOS, Linux, Windows',
          url: 'https://metastrip.ai',
          releaseNotes: 'https://metastrip.ai/changelog',
        }}
      />

      <div className="min-h-screen py-16 md:py-24 px-4 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <nav className="text-xs text-text-tertiary mb-8">
          <Link href="/" className="hover:text-primary transition-colors">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-text-primary">Changelog</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-text-primary mb-4">
          Changelog
        </h1>
        <p className="text-text-tertiary mb-16">
          Every release, every feature, every improvement.
        </p>

        <div className="space-y-12">
          {changelog.map((entry) => (
            <article
              key={entry.version}
              id={`v${entry.version.replace(/\./g, '-')}`}
              className="border-l-2 border-primary/20 pl-6"
            >
              <div className="flex items-center gap-4 mb-3">
                <span className="bg-primary/10 text-primary font-mono text-sm font-bold px-3 py-1 rounded-full">
                  v{entry.version}
                </span>
                <time className="text-xs text-text-tertiary font-mono uppercase tracking-wider">
                  {entry.date}
                </time>
              </div>
              <ul className="space-y-2">
                {entry.highlights.map((highlight, i) => (
                  <li key={i} className="flex gap-3 text-text-secondary text-sm leading-relaxed">
                    <span className="text-primary shrink-0 mt-0.5">&#8226;</span>
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        {/* CTA */}
        <section className="mt-20 mb-12 bg-surface border border-border rounded-card p-8 text-center">
          <h2 className="text-2xl font-extrabold text-text-primary mb-3">
            Try the Latest Version
          </h2>
          <p className="text-text-secondary mb-6">
            Strip metadata from your images — free, instant, private.
          </p>
          <code className="block bg-bg text-primary font-mono text-sm px-6 py-3 rounded-lg mb-6 mx-auto max-w-md border border-border">
            npm install -g @metastrip/cli
          </code>
          <Link
            href="/"
            className="inline-block rounded-button bg-primary px-6 py-3 text-sm font-bold text-white transition-all hover:bg-primary/90"
          >
            Use the Web Tool
          </Link>
        </section>

        {/* Related links */}
        <nav className="border-t border-border pt-8 flex flex-wrap gap-4 text-sm">
          <Link href="/docs" className="text-text-tertiary hover:text-primary transition-colors">
            Documentation
          </Link>
          <Link href="/blog" className="text-text-tertiary hover:text-primary transition-colors">
            Blog
          </Link>
          <Link href="/pricing" className="text-text-tertiary hover:text-primary transition-colors">
            Pricing
          </Link>
          <Link href="/" className="text-text-tertiary hover:text-primary transition-colors">
            Home
          </Link>
        </nav>
      </div>

      {/* Feature request */}
      <FeatureRequest />
    </>
  );
}

