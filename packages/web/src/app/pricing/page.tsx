import type { Metadata } from 'next';
import PricingCard from '@/components/pricing-card';

export const metadata: Metadata = {
  title: 'Pricing — MetaStrip | Free Metadata Remover',
  description:
    'MetaStrip is free forever for the web tool. Pay only when you need API access at scale. No credit card required to get started.',
};

const FREE_FEATURES = [
  'Unlimited file processing',
  '20 formats: images, docs, audio, video',
  'Client-side processing — files never leave your browser',
  'No signup required',
  'Zero quality loss',
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
      {/* Header */}
      <div className="text-center mb-14">
        <h1 className="text-4xl font-extrabold text-center text-text-primary">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-text-secondary text-base max-w-xl mx-auto">
          The web tool is free forever. Pay only when you need API access at scale.
        </p>
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <PricingCard
          name="Free"
          price="Free"
          description="Everything you need to protect your privacy"
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
          Drop your email to get early access when the API launches.
        </p>
        <form
          action="#"
          className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
        >
          <label htmlFor="waitlist-email" className="sr-only">
            Email address
          </label>
          <input
            id="waitlist-email"
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="flex-1 px-4 py-2.5 rounded-input bg-bg border border-border text-text-primary placeholder:text-text-tertiary text-sm focus:outline-none focus:border-primary/60 transition-colors duration-150"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-button bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors duration-150 whitespace-nowrap"
          >
            Notify me
          </button>
        </form>
      </section>
    </div>
  );
}
