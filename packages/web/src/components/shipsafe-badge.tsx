/**
 * ShipSafe inline brand mark — sailboat logo + "ShipSafe" wordmark
 * in ShipSafe's gold (#d4a54a) with serif font, matching shipsafe.org's nav styling.
 * Used as an inline element within text or as a standalone link.
 */

interface ShipSafeBadgeProps {
  size?: number;
  className?: string;
  linked?: boolean;
}

function SailboatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="inline-block shrink-0"
    >
      {/* Mast */}
      <line x1="28" y1="8" x2="28" y2="48" stroke="#d4a54a" strokeWidth="2.5" strokeLinecap="round" />
      {/* Main sail */}
      <path d="M29 10 L29 44 L52 38 Z" fill="#d4a54a" opacity="0.85" />
      {/* Jib sail */}
      <path d="M27 14 L27 38 L10 34 Z" fill="#d4a54a" opacity="0.55" />
      {/* Hull */}
      <path d="M8 48 C8 48 14 56 32 56 C50 56 56 48 56 48 L48 48 C48 48 44 54 32 54 C20 54 16 48 16 48 Z" fill="#d4a54a" opacity="0.95" />
      {/* Waterline */}
      <path d="M12 50 Q22 54 32 52 Q42 50 52 52" stroke="#d4a54a" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.3" />
    </svg>
  );
}

export default function ShipSafeBadge({ size = 18, className = '', linked = true }: ShipSafeBadgeProps) {
  const content = (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <SailboatIcon size={size} />
      <span
        className="font-extrabold tracking-tight"
        style={{ color: '#d4a54a', fontFamily: 'var(--font-playfair), Georgia, serif' }}
      >
        ShipSafe
      </span>
    </span>
  );

  if (!linked) return content;

  return (
    <a
      href="https://shipsafe.org"
      target="_blank"
      rel="noopener noreferrer"
      className="hover:opacity-80 transition-opacity duration-150"
    >
      {content}
    </a>
  );
}
