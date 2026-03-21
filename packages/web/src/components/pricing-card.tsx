import Link from 'next/link';

interface PricingCardProps {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
  comingSoon?: boolean;
}

export default function PricingCard({
  name,
  price,
  description,
  features,
  cta,
  ctaHref,
  highlighted = false,
  comingSoon = false,
}: PricingCardProps) {
  const isFreeTier = price === 'Free' || price === 'Custom';

  const cardClasses = [
    'bg-surface border rounded-card p-6 flex flex-col gap-6',
    highlighted
      ? 'border-primary ring-1 ring-primary/20'
      : 'border-border',
  ].join(' ');

  const ctaBaseClasses =
    'relative w-full py-2.5 px-4 rounded-button text-sm font-semibold text-center transition-colors duration-150 block';

  const ctaClasses = highlighted
    ? `${ctaBaseClasses} bg-primary text-white hover:bg-primary/90`
    : `${ctaBaseClasses} bg-surface border border-border text-text-primary hover:border-primary/50`;

  const ctaDisabledClasses = `${ctaBaseClasses} ${
    highlighted
      ? 'bg-primary/40 text-white/50'
      : 'bg-surface border border-border text-text-tertiary'
  } cursor-not-allowed opacity-60`;

  return (
    <div className={cardClasses}>
      {/* Header */}
      <div className="flex flex-col gap-1">
        <span className="text-xl font-bold text-text-primary">{name}</span>
        <div className="flex items-end gap-1 mt-2">
          <span className="text-4xl font-extrabold text-text-primary leading-none">
            {price}
          </span>
          {!isFreeTier && (
            <span className="text-text-secondary text-sm mb-0.5">/mo</span>
          )}
        </div>
        <p className="text-text-secondary text-sm mt-1">{description}</p>
      </div>

      {/* Features */}
      <ul className="flex flex-col gap-2.5 flex-1">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            {/* Checkmark icon */}
            <svg
              className="w-4 h-4 text-primary flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-text-secondary text-sm">{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      {comingSoon ? (
        <div className={ctaDisabledClasses} aria-disabled="true">
          <span className="opacity-0 select-none">{cta}</span>
          <span className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm font-semibold">
            Coming Soon
          </span>
        </div>
      ) : (
        <Link href={ctaHref} className={ctaClasses}>
          {cta}
        </Link>
      )}
    </div>
  );
}
