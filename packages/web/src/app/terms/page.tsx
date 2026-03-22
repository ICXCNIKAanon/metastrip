import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'MetaStrip Terms of Service. Free to use, no warranty, your responsibility. The web tool is provided as-is.',
  alternates: {
    canonical: 'https://metastrip.ai/terms',
  },
  openGraph: {
    title: 'Terms of Service | MetaStrip',
    description:
      'MetaStrip Terms of Service. Free to use, no warranty, your responsibility.',
    url: 'https://metastrip.ai/terms',
    type: 'website',
    siteName: 'MetaStrip',
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen py-16 md:py-24 px-4 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-xs text-text-tertiary mb-8">
        <Link href="/" className="hover:text-primary transition-colors">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-text-primary">Terms of Service</span>
      </nav>

      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-text-primary mb-4">
        Terms of Service
      </h1>
      <p className="text-text-tertiary mb-2">Last updated: March 2026</p>
      <p className="text-text-secondary mb-16">
        Questions?{' '}
        <a
          href="mailto:hello@metastrip.ai"
          className="text-primary hover:text-primary/80 transition-colors"
        >
          hello@metastrip.ai
        </a>
      </p>

      <div className="space-y-12">
        {/* The service */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">The Service</h2>
          <p className="text-text-secondary leading-relaxed mb-4">
            MetaStrip provides tools for removing metadata from image files — including GPS location,
            device info, timestamps, and other hidden data. The web tool is available free of charge
            with no account required.
          </p>
          <p className="text-text-secondary leading-relaxed">
            MetaStrip is provided <strong className="text-text-primary">"as is"</strong> without
            warranty of any kind, express or implied. We do our best to keep things running well, but
            we make no guarantees about uptime, availability, or suitability for any particular purpose.
          </p>
        </section>

        {/* Your responsibilities */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Your Responsibilities</h2>
          <p className="text-text-secondary leading-relaxed mb-4">
            By using MetaStrip, you agree to the following:
          </p>
          <ul className="space-y-3">
            {[
              'You are solely responsible for the files you process. MetaStrip does not inspect your images.',
              'Do not use MetaStrip to facilitate illegal activity of any kind.',
              'Do not attempt to reverse-engineer, attack, scrape abusively, or otherwise abuse the service.',
              'Do not use automated tools to hammer our servers beyond normal use.',
            ].map((item, i) => (
              <li key={i} className="flex gap-3 text-text-secondary leading-relaxed">
                <span className="text-primary shrink-0 mt-1">&#8226;</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Backups */}
        <section className="bg-surface border border-primary/20 rounded-card p-6">
          <h2 className="text-lg font-bold text-text-primary mb-3">Keep backups of your files</h2>
          <p className="text-text-secondary leading-relaxed">
            We engineer MetaStrip for zero quality loss — we perform binary-level metadata surgery
            rather than re-encoding images. That said, we cannot guarantee that every file will be
            processed without issue. Always keep a copy of your original files before processing.
          </p>
        </section>

        {/* Intellectual property */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Intellectual Property</h2>
          <p className="text-text-secondary leading-relaxed mb-4">
            MetaStrip's source code is available on{' '}
            <a
              href="https://github.com/ICXCNIKAanon/metastrip"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors"
            >
              GitHub
            </a>{' '}
            under the MIT License. You are free to use, modify, and distribute the code under those
            terms.
          </p>
          <p className="text-text-secondary leading-relaxed">
            The MetaStrip name, logo, and branding are the property of MetaStrip. The MIT License does
            not grant you rights to use our trademarks or brand identity.
          </p>
        </section>

        {/* Limitation of liability */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Limitation of Liability</h2>
          <p className="text-text-secondary leading-relaxed mb-4">
            To the maximum extent permitted by law, MetaStrip and its operators are not liable for any
            damages — direct, indirect, incidental, consequential, or otherwise — arising from your use
            of the service or inability to use the service.
          </p>
          <p className="text-text-secondary leading-relaxed">
            This includes, but is not limited to, any loss of data, loss of files, or unintended
            metadata remaining in a processed file. Use MetaStrip at your own risk and always keep
            backups.
          </p>
        </section>

        {/* API terms */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">API Terms (Coming Soon)</h2>
          <p className="text-text-secondary leading-relaxed mb-4">
            MetaStrip's REST API is currently in development. When it launches, the following will
            apply:
          </p>
          <ul className="space-y-3">
            {[
              'API usage will be subject to rate limits and fair use policies.',
              'Abuse of the API — including but not limited to automated scraping or denial-of-service attempts — may result in immediate access revocation.',
              'Pricing and terms for paid API tiers will be published separately at launch.',
            ].map((item, i) => (
              <li key={i} className="flex gap-3 text-text-secondary leading-relaxed">
                <span className="text-primary shrink-0 mt-1">&#8226;</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Availability and termination */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Availability</h2>
          <p className="text-text-secondary leading-relaxed mb-4">
            We reserve the right to modify, suspend, or discontinue any part of MetaStrip at any time,
            with or without notice.
          </p>
          <p className="text-text-secondary leading-relaxed">
            Our intent is to keep the web tool free indefinitely. Free tier access may be adjusted in
            the future, but we will provide reasonable notice before any significant changes.
          </p>
        </section>

        {/* Governing law */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Governing Law</h2>
          <p className="text-text-secondary leading-relaxed">
            These terms are governed by the laws of the United States, without regard to conflict of
            law principles.
          </p>
        </section>

        {/* Changes */}
        <section>
          <h2 className="text-2xl font-bold text-text-primary mb-4">Changes to These Terms</h2>
          <p className="text-text-secondary leading-relaxed">
            We may update these terms from time to time. When we do, we'll update the date at the top
            of the page. Continued use of MetaStrip after changes are posted constitutes acceptance of
            the updated terms.
          </p>
        </section>

        {/* Contact */}
        <section className="bg-surface border border-border rounded-card p-6">
          <h2 className="text-lg font-bold text-text-primary mb-3">Questions?</h2>
          <p className="text-text-secondary leading-relaxed">
            Reach us at{' '}
            <a
              href="mailto:hello@metastrip.ai"
              className="text-primary hover:text-primary/80 transition-colors"
            >
              hello@metastrip.ai
            </a>
            . We'll respond as quickly as we can.
          </p>
        </section>
      </div>

      {/* Bottom nav */}
      <nav className="border-t border-border pt-8 mt-16 flex flex-wrap gap-4 text-sm">
        <Link href="/privacy" className="text-text-tertiary hover:text-primary transition-colors">
          Privacy Policy
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
