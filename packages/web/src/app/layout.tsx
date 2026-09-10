import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import Nav from '@/components/nav';
import Footer from '@/components/footer';
import JsonLd from '@/components/json-ld';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', weight: ['700', '800'] });

export const metadata: Metadata = {
  title: {
    default: 'MetaStrip — Free Metadata Remover, No Uploads',
    template: '%s — MetaStrip',
  },
  description: 'Inspect and remove supported metadata from images, documents, audio and video. Free local browser processing, no signup and no file uploads.',
  keywords: ['metadata remover', 'exif remover', 'remove gps from photo', 'strip metadata', 'image privacy', 'photo metadata', 'remove exif data', 'strip gps from photo', 'online metadata tool', 'image metadata cleaner'],
  authors: [{ name: 'MetaStrip', url: 'https://metastrip.ai' }],
  creator: 'MetaStrip',
  publisher: 'MetaStrip',
  metadataBase: new URL('https://metastrip.ai'),
  openGraph: {
    title: 'MetaStrip — Remove Hidden Metadata from Your Images',
    description: 'Your photos reveal more than you think. GPS coordinates, device serial numbers, timestamps — all hidden in metadata. Remove it instantly, for free.',
    type: 'website',
    url: 'https://metastrip.ai',
    siteName: 'MetaStrip',
    locale: 'en_US',
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: 'MetaStrip — free, local metadata removal',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MetaStrip — Free Image Metadata Remover',
    description: 'Remove GPS, device info, and hidden metadata from photos. Free, instant, private.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '48x48', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'technology',
};

const jsonLdData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': 'https://metastrip.ai/#organization', name: 'MetaStrip', url: 'https://metastrip.ai/', logo: 'https://metastrip.ai/icon-512.png', sameAs: ['https://github.com/ICXCNIKAanon/metastrip', 'https://www.npmjs.com/org/metastrip'] },
    { '@type': 'WebSite', '@id': 'https://metastrip.ai/#website', name: 'MetaStrip', alternateName: 'MetaStrip.ai', url: 'https://metastrip.ai/', publisher: { '@id': 'https://metastrip.ai/#organization' } },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <JsonLd data={jsonLdData} />
      </head>
      <body className={`${inter.variable} ${jetbrains.variable} ${playfair.variable} font-sans`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-button focus:text-sm focus:font-semibold">
          Skip to main content
        </a>
        <Nav />
        <main id="main-content" className="min-h-screen">{children}</main>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
