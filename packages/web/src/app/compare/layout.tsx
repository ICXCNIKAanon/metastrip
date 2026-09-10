import type { Metadata } from 'next';
import JsonLd from '@/components/json-ld';

export const metadata: Metadata = {
  openGraph: { title: 'Compare file metadata — MetaStrip', description: 'Compare detected fields locally. Metadata matches are clues, not proof of identity.', url: '/compare', images: ['/og-image.png'] },
  twitter: { card: 'summary_large_image', title: 'Compare file metadata — MetaStrip', description: 'Compare detected fields locally. Metadata matches are clues, not proof of identity.', images: ['/og-image.png'] },
  alternates: { canonical: 'https://metastrip.ai/compare' },
  title: 'Compare Files',
  description:
    'Compare detected camera and identifier metadata in two JPEG, PNG or WebP files locally. Metadata matches are clues, not proof of device identity.',
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://metastrip.ai/' },
    { '@type': 'ListItem', position: 2, name: 'Compare Files', item: 'https://metastrip.ai/compare' },
  ],
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      {children}
    </>
  );
}
