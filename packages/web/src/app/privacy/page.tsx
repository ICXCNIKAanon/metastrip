import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'MetaStrip privacy policy. Your files are processed entirely in your browser and never uploaded to any server.',
  alternates: {
    canonical: 'https://metastrip.ai/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | MetaStrip',
    description:
      'MetaStrip privacy policy. Your files are processed entirely in your browser and never uploaded to any server.',
    url: 'https://metastrip.ai/privacy',
    type: 'website',
    siteName: 'MetaStrip',
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen py-16 md:py-24 px-4 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-xs text-text-tertiary mb-8">
        <Link href="/" className="hover:text-primary transition-colors">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-text-primary">Privacy Policy</span>
      </nav>

      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-text-primary mb-4">
        Privacy Policy
      </h1>
      <p className="text-text-tertiary mb-2">
        Last updated: March 2026
      </p>
      <p className="text-text-secondary mb-16">
        MetaStrip is operated by <strong className="text-text-primary">ICXCNIKAanon</strong>. Questions?{' '}
        <a href="mailto:hello@metastrip.ai" className="text-primary hover:text-primary/80 transition-colors">
          hello@metastrip.ai
        </a>
      </p>

      <div className="space-y-12">
        {/* The short version */}
        <section className="bg-surface border border-primary/20 rounded-card p-6">
          <h2 className="text-lg font-bold text-text-primary mb-3">The short version</h2>
          <p className="text-text-secondary leading-relaxed">
            MetaStrip's web tool runs entirely in your browser. Your files never leave your device. We do
            not have a server that receives your images. We collect minimal analytics (page views, no
            personal identifiers) and store your email only if you join the API waitlist.
          </p>
        </section>

        {/* What we do NOT collect */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">
            What we do <span className="text-primary">not</span> collect
          </h2>
          <ul className="space-y-3">
            {[
              'Your files — ever. Images are processed 100% in your browser using JavaScript. They never touch our servers.',
              'Personal information. No names, no accounts, no signup required.',
              'Tracking cookies. We do not use cookies to track you across the web.',
              'Browsing history or behavioral profiles.',
            ].map((item, i) => (
              <li key={i} className="flex gap-3 text-text-secondary leading-relaxed">
                <span className="text-primary shrink-0 mt-1">✕</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* What we DO collect */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">
            What we <span className="text-primary">do</span> collect
          </h2>
          <div className="space-y-6">
            <div className="border-l-2 border-primary/30 pl-5">
              <h3 className="text-text-primary font-semibold mb-2">Basic analytics</h3>
              <p className="text-text-secondary leading-relaxed">
                We use Vercel Analytics to understand how people use MetaStrip. This gives us page view
                counts, country-level geographic data, and device type. No personal identifiers are
                collected. Data is aggregated and anonymous.
              </p>
            </div>

            <div className="border-l-2 border-primary/30 pl-5">
              <h3 className="text-text-primary font-semibold mb-2">API waitlist emails</h3>
              <p className="text-text-secondary leading-relaxed">
                If you submit your email address to join the API waitlist, we store that email address
                solely to notify you when the API launches. We will not send marketing emails or sell
                your address to third parties.
              </p>
            </div>

            <div className="border-l-2 border-primary/30 pl-5">
              <h3 className="text-text-primary font-semibold mb-2">Web server logs</h3>
              <p className="text-text-secondary leading-relaxed">
                Our hosting provider (Vercel) retains standard server logs, which include IP addresses
                and browser user agent strings. We do not control this data. See{' '}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors"
                >
                  Vercel's privacy policy
                </a>{' '}
                for details.
              </p>
            </div>
          </div>
        </section>

        {/* Third-party services */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Third-party services</h2>
          <div className="space-y-6">
            <div className="border-l-2 border-border pl-5">
              <h3 className="text-text-primary font-semibold mb-2">Vercel (hosting)</h3>
              <p className="text-text-secondary leading-relaxed">
                MetaStrip is hosted on Vercel. Standard hosting infrastructure. See{' '}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors"
                >
                  vercel.com/legal/privacy-policy
                </a>
                .
              </p>
            </div>

            <div className="border-l-2 border-border pl-5">
              <h3 className="text-text-primary font-semibold mb-2">
                Leaflet / OpenStreetMap (GPS map tiles)
              </h3>
              <p className="text-text-secondary leading-relaxed">
                When MetaStrip detects GPS coordinates in a file, it displays them on an interactive map
                using Leaflet. Map tiles are loaded from CartoDB's CDN. This means your browser makes a
                request to CartoDB's servers, which sees your IP address. No file data is ever sent —
                only the tile requests needed to render the map. If you prefer not to do this, simply
                don't use the GPS preview feature.
              </p>
            </div>
          </div>
        </section>

        {/* Chrome Extension */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Chrome Extension</h2>
          <p className="text-text-secondary leading-relaxed mb-4">
            The MetaStrip browser extension processes all files locally in your browser. Nothing is
            sent to MetaStrip's servers or any third party.
          </p>
          <p className="text-text-secondary leading-relaxed">
            The extension stores a single setting — whether it is enabled or disabled — in Chrome's sync
            storage. This setting syncs across your Chrome devices via Google's infrastructure, subject
            to Google's own privacy policy.
          </p>
        </section>

        {/* CLI / npm */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">CLI and npm Packages</h2>
          <p className="text-text-secondary leading-relaxed">
            The <code className="bg-surface border border-border px-1.5 py-0.5 rounded text-sm text-primary font-mono">@metastrip/cli</code>,{' '}
            <code className="bg-surface border border-border px-1.5 py-0.5 rounded text-sm text-primary font-mono">@metastrip/core</code>, and{' '}
            <code className="bg-surface border border-border px-1.5 py-0.5 rounded text-sm text-primary font-mono">@metastrip/mcp-server</code>{' '}
            packages run entirely on your local machine. There is no telemetry, no analytics, and no
            phone-home of any kind.
          </p>
        </section>

        {/* Children's privacy */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Children's Privacy</h2>
          <p className="text-text-secondary leading-relaxed">
            MetaStrip is not directed at children under 13. We do not knowingly collect personal
            information from anyone under 13. If you believe a child has submitted their email address
            through our waitlist, contact us at{' '}
            <a href="mailto:hello@metastrip.ai" className="text-primary hover:text-primary/80 transition-colors">
              hello@metastrip.ai
            </a>{' '}
            and we will remove it.
          </p>
        </section>

        {/* Changes */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Changes to This Policy</h2>
          <p className="text-text-secondary leading-relaxed">
            We may update this privacy policy from time to time. When we do, we'll update the date at
            the top of the page. If the changes are significant, we'll make that clear. Continued use of
            MetaStrip after changes are posted means you accept the updated policy.
          </p>
        </section>

        {/* Contact */}
        <section className="bg-surface border border-border rounded-card p-6">
          <h2 className="text-lg font-bold text-text-primary mb-3">Questions?</h2>
          <p className="text-text-secondary leading-relaxed">
            Reach us at{' '}
            <a href="mailto:hello@metastrip.ai" className="text-primary hover:text-primary/80 transition-colors">
              hello@metastrip.ai
            </a>
            . We'll respond as quickly as we can.
          </p>
        </section>
      </div>

      {/* Bottom nav */}
      <nav className="border-t border-border pt-8 mt-16 flex flex-wrap gap-4 text-sm">
        <Link href="/terms" className="text-text-tertiary hover:text-primary transition-colors">
          Terms of Service
        </Link>
        <Link href="/docs" className="text-text-tertiary hover:text-primary transition-colors">
          Documentation
        </Link>
        <Link href="/" className="text-text-tertiary hover:text-primary transition-colors">
          Home
        </Link>
      </nav>
    </div>
  );
}
