import type { Metadata } from 'next';
import PricingCard from '@/components/pricing-card';
import Breadcrumbs from '@/components/breadcrumbs';

export const metadata: Metadata = {
  openGraph: { title: 'MetaStrip pricing', description: 'Free browser metadata cleaning. Hosted API plans are coming soon.', url: '/pricing', images: ['/og-image.png'] },
  twitter: { card: 'summary_large_image', title: 'MetaStrip pricing', description: 'Free browser metadata cleaning. Hosted API plans are coming soon.', images: ['/og-image.png'] },
  alternates: { canonical: 'https://metastrip.ai/pricing' },
  title: 'Pricing',
  description:
    'The MetaStrip browser tool is free with no signup. Hosted API plans are coming soon; use the local CLI and MCP server today.',
};

const FREE_FEATURES = [
  'Free processing; 50 files / 500 MB per batch',
  'Supported image, document, audio and video formats',
  'Client-side processing — files never leave your browser',
  'No signup required',
  'No image or media recompression',
];

const DEVELOPER_FEATURES = [
  '10,000 files/month',
  'REST API access',
  'All image formats + video',
  'Batch processing',
  'Email support',
];

const ENTERPRISE_FEATURES = [
  'Unlimited API calls',
  'SLA guarantee',
  'Priority support',
  'Custom integrations',
  'Dedicated account manager',
];

export default function PricingPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <Breadcrumbs items={[{ name: 'Pricing', href: '/pricing' }]} />
      {/* Header */}
      <div className="text-center mb-14">
        <h1 className="text-4xl font-extrabold text-center text-text-primary">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-text-secondary text-base max-w-xl mx-auto">
          The web tool is free. Hosted API plans below are planned and are not yet available.
        </p>
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <PricingCard
          name="Free"
          price="Free"
          description="Inspect and clean supported metadata locally"
          features={FREE_FEATURES}
          cta="Use Free Tool →"
          ctaHref="/"
          highlighted
        />
        <PricingCard
          name="Developer"
          price="$29"
          description="API access for apps and automation"
          features={DEVELOPER_FEATURES}
          cta="Join Waitlist"
          ctaHref="#waitlist"
          comingSoon
        />
        <PricingCard
          name="Enterprise"
          price="Custom"
          description="For teams with compliance requirements"
          features={ENTERPRISE_FEATURES}
          cta="Contact Us"
          ctaHref="mailto:hello@metastrip.ai"
          comingSoon
        />
      </div>

      {/* Waitlist section */}
      <section
        id="waitlist"
        className="mt-20 bg-surface border border-border rounded-card p-8 text-center"
      >
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          API access coming soon
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          Email us to ask about API availability. Your email app will open; nothing is submitted from this page.
        </p>
        <a href="mailto:hello@metastrip.ai?subject=MetaStrip%20API%20availability" className="inline-block px-5 py-3 rounded-button bg-primary text-bg text-sm font-semibold">Ask about API access</a>
      </section>
    </div>
  );
}
