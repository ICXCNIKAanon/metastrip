import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import Nav from '@/components/nav';
import Footer from '@/components/footer';
import JsonLd from '@/components/json-ld';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', weight: ['700', '800'] });

export const metadata: Metadata = {
  title: {
    default: 'MetaStrip — Free Online Metadata Remover for Images',
    template: '%s — MetaStrip',
  },
  description: 'Remove GPS location, device info, and hidden metadata from your photos. 100% free, no signup required. Files never leave your browser. Zero quality loss.',
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
      alt: 'MetaStrip — Remove hidden metadata from your photos. Risk score 85 → 0.',
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
  alternates: {
    canonical: 'https://metastrip.ai',
  },
  category: 'technology',
};

const jsonLdData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'MetaStrip',
      description: 'Free online metadata removal tool for images. Remove GPS, EXIF, and hidden data from image files without uploading them to any server.',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web Browser',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      url: 'https://metastrip.ai',
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is image metadata (EXIF data)?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Image metadata (also called EXIF data) is hidden information embedded in photo files. It can include GPS coordinates showing where the photo was taken, the device make and model, timestamps, software used, and even the photographer\'s name. This data is invisible when viewing the photo but can be read by anyone with the right tools.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is MetaStrip really free?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. MetaStrip\'s web tool is completely free with no signup required. Your files are processed entirely in your browser — they never touch our servers. We offer paid API access for developers who need programmatic metadata removal at scale.',
          },
        },
        {
          '@type': 'Question',
          name: 'Do my files get uploaded to a server?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. All processing happens client-side in your browser. Your files never leave your device.',
          },
        },
      ],
    },
    {
      '@type': 'ItemList',
      name: 'MetaStrip Features',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Image Metadata Removal', description: 'Remove EXIF, XMP, IPTC data from JPEG, PNG, WebP, HEIC' },
        { '@type': 'ListItem', position: 2, name: 'GPS Location Removal', description: 'Remove GPS coordinates that reveal where photos were taken' },
        { '@type': 'ListItem', position: 3, name: 'AI Image Detection', description: 'Detect and remove AI generation metadata from Midjourney, DALL-E, Stable Diffusion images' },
        { '@type': 'ListItem', position: 4, name: 'Privacy Risk Assessment', description: 'See a risk score showing how much your file reveals about you' },
      ],
    },
    {
      '@type': 'Organization',
      name: 'MetaStrip',
      url: 'https://metastrip.ai',
      logo: 'https://metastrip.ai/icon-512.png',
      sameAs: ['https://github.com/ICXCNIKAanon/metastrip', 'https://www.npmjs.com/org/metastrip'],
    },
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
      </body>
    </html>
  );
}
