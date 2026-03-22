import Link from 'next/link';
import Image from 'next/image';
import ShipSafeBadge from '@/components/shipsafe-badge';

export default function Footer() {
  return (
    <footer className="bg-bg border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Three-column link grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
          {/* Product */}
          <div>
            <h3 className="text-text-primary text-sm font-semibold mb-4 uppercase tracking-wider">
              Product
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/"
                  className="text-text-secondary hover:text-text-primary text-sm transition-colors duration-150"
                >
                  Web Tool
                </Link>
              </li>
              <li>
                <Link
                  href="/docs#cli"
                  className="text-text-secondary hover:text-text-primary text-sm transition-colors duration-150"
                >
                  CLI
                </Link>
              </li>
              <li>
                <Link
                  href="/docs#mcp"
                  className="text-text-secondary hover:text-text-primary text-sm transition-colors duration-150"
                >
                  MCP Server
                </Link>
              </li>
              <li>
                <span className="text-text-tertiary text-sm cursor-default">
                  API{' '}
                  <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-surface border border-border text-text-tertiary ml-1">
                    Coming Soon
                  </span>
                </span>
              </li>
              <li>
                <Link
                  href="/changelog"
                  className="text-text-secondary hover:text-text-primary text-sm transition-colors duration-150"
                >
                  Changelog
                </Link>
              </li>
            </ul>
          </div>

          {/* Developers */}
          <div>
            <h3 className="text-text-primary text-sm font-semibold mb-4 uppercase tracking-wider">
              Developers
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/docs"
                  className="text-text-secondary hover:text-text-primary text-sm transition-colors duration-150"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <a
                  href="https://www.npmjs.com/package/@metastrip/cli"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-secondary hover:text-text-primary text-sm transition-colors duration-150"
                >
                  npm Package
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/ICXCNIKAanon/metastrip"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-secondary hover:text-text-primary text-sm transition-colors duration-150"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-text-primary text-sm font-semibold mb-4 uppercase tracking-wider">
              Company
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/privacy"
                  className="text-text-secondary hover:text-text-primary text-sm transition-colors duration-150"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="text-text-secondary hover:text-text-primary text-sm transition-colors duration-150"
                >
                  Blog
                </Link>
              </li>
              <li>
                <a
                  href="mailto:hello@metastrip.ai"
                  className="text-text-secondary hover:text-text-primary text-sm transition-colors duration-150"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom row */}
        <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-text-tertiary text-sm">
            <Image src="/icon.svg" alt="MetaStrip" width={20} height={20} className="w-5 h-5" />
            <span>&copy; 2026 MetaStrip.ai</span>
          </p>
          <div className="flex items-center gap-4 text-sm text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-primary flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Files never leave your browser.
            </span>
            <span className="hidden sm:inline text-border">|</span>
            <span className="hidden sm:inline">
              Powering <ShipSafeBadge size={14} />
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
