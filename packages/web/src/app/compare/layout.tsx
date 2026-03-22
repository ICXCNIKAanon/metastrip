import type { Metadata } from 'next';
import JsonLd from '@/components/json-ld';

export const metadata: Metadata = {
  title: 'Compare Files',
  description:
    'Upload two files to check if they were taken by the same device. Compare metadata fingerprints side by side.',
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
