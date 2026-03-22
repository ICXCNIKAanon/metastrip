'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const NPM_SNIPPET = 'npm i @metastrip/cli';

export default function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyNpm = async () => {
    try {
      await navigator.clipboard.writeText(NPM_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: silently fail
    }
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-sm bg-bg/80 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <Image src="/icon.svg" alt="MetaStrip" width={32} height={32} className="w-8 h-8" />
            <span className="text-text-primary font-bold text-lg font-sans">metastrip.ai</span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/docs"
              className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors duration-150"
            >
              Docs
            </Link>
            <Link
              href="/pricing"
              className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors duration-150"
            >
              Pricing
            </Link>
            <Link
              href="/blog"
              className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors duration-150"
            >
              Blog
            </Link>
            <Link
              href="/compare"
              className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors duration-150"
            >
              Compare
            </Link>
            <Link
              href="/changelog"
              className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors duration-150"
            >
              Changelog
            </Link>
            <a
              href="https://github.com/ICXCNIKAanon/metastrip"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-secondary hover:text-text-primary text-sm font-medium transition-colors duration-150"
            >
              GitHub
            </a>
          </nav>

          {/* Desktop right-side actions */}
          <div className="hidden md:flex items-center gap-3">
            {/* npm install snippet */}
            <button
              onClick={handleCopyNpm}
              title={copied ? 'Copied!' : 'Click to copy'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-surface border border-border hover:border-primary/50 transition-all duration-150 group"
            >
              <span className="font-mono text-xs text-text-secondary group-hover:text-text-primary transition-colors duration-150">
                {NPM_SNIPPET}
              </span>
              <svg
                className={`w-3.5 h-3.5 flex-shrink-0 transition-colors duration-150 ${copied ? 'text-primary' : 'text-text-tertiary group-hover:text-text-secondary'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                {copied ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                ) : (
                  <>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </>
                )}
              </svg>
            </button>

            {/* Get API Key CTA */}
            <Link
              href="/pricing"
              className="px-4 py-2 rounded-button bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors duration-150"
            >
              Get API Key
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Toggle mobile menu"
            className="md:hidden p-2 rounded-md text-text-secondary hover:text-text-primary transition-colors duration-150"
          >
            {mobileOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-bg/95 backdrop-blur-sm">
          <nav className="flex flex-col px-4 py-4 gap-1">
            <Link
              href="/docs"
              onClick={() => setMobileOpen(false)}
              className="text-text-secondary hover:text-text-primary text-sm font-medium py-2.5 px-3 rounded-md hover:bg-surface transition-all duration-150"
            >
              Docs
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileOpen(false)}
              className="text-text-secondary hover:text-text-primary text-sm font-medium py-2.5 px-3 rounded-md hover:bg-surface transition-all duration-150"
            >
              Pricing
            </Link>
            <Link
              href="/blog"
              onClick={() => setMobileOpen(false)}
              className="text-text-secondary hover:text-text-primary text-sm font-medium py-2.5 px-3 rounded-md hover:bg-surface transition-all duration-150"
            >
              Blog
            </Link>
            <Link
              href="/compare"
              onClick={() => setMobileOpen(false)}
              className="text-text-secondary hover:text-text-primary text-sm font-medium py-2.5 px-3 rounded-md hover:bg-surface transition-all duration-150"
            >
              Compare
            </Link>
            <Link
              href="/changelog"
              onClick={() => setMobileOpen(false)}
              className="text-text-secondary hover:text-text-primary text-sm font-medium py-2.5 px-3 rounded-md hover:bg-surface transition-all duration-150"
            >
              Changelog
            </Link>
            <a
              href="https://github.com/ICXCNIKAanon/metastrip"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileOpen(false)}
              className="text-text-secondary hover:text-text-primary text-sm font-medium py-2.5 px-3 rounded-md hover:bg-surface transition-all duration-150"
            >
              GitHub
            </a>

            <div className="mt-3 pt-3 border-t border-border flex flex-col gap-2">
              <button
                onClick={() => { handleCopyNpm(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-input bg-surface border border-border w-full text-left"
              >
                <span className="font-mono text-xs text-text-secondary flex-1">{NPM_SNIPPET}</span>
                <span className="text-xs text-text-tertiary">{copied ? 'Copied!' : 'Copy'}</span>
              </button>
              <Link
                href="/pricing"
                onClick={() => setMobileOpen(false)}
                className="block text-center px-4 py-2.5 rounded-button bg-primary hover:bg-primary/90 text-white text-sm font-semibold transition-colors duration-150"
              >
                Get API Key
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
