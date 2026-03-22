import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Compare Files',
  description:
    'Upload two files to check if they were taken by the same device. Compare metadata fingerprints side by side.',
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
