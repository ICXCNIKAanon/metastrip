import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from '@/lib/blog';
import Breadcrumbs from '@/components/breadcrumbs';

export const metadata: Metadata = {
  title: 'Blog — MetaStrip',
  description:
    'Guides and articles about photo metadata, EXIF data, GPS privacy risks, and how to protect your privacy when sharing images online.',
  alternates: {
    canonical: 'https://metastrip.ai/blog',
  },
  openGraph: {
    title: 'Blog — MetaStrip',
    description:
      'Guides and articles about photo metadata, EXIF data, GPS privacy risks, and how to protect your privacy when sharing images online.',
    type: 'website',
    url: 'https://metastrip.ai/blog',
    siteName: 'MetaStrip',
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function BlogPage() {
  const posts = await getAllPosts();

  return (
    <div className="max-w-3xl mx-auto px-4 pt-16 pb-24">
      <Breadcrumbs items={[{ name: 'Blog', href: '/blog' }]} />
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-text-primary mb-4">
          Blog
        </h1>
        <p className="text-lg text-text-secondary">
          Guides on photo metadata, GPS privacy, and protecting yourself online.
        </p>
      </div>

      {/* Post list */}
      <div className="flex flex-col gap-6">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="block bg-surface border border-border rounded-card p-6 hover:border-primary/50 transition-colors group"
          >
            <p className="text-sm text-text-tertiary mb-2">{formatDate(post.frontmatter.date)}</p>
            <h2 className="text-xl font-bold text-text-primary mb-2 group-hover:text-primary transition-colors">
              {post.frontmatter.title}
            </h2>
            <p className="text-text-secondary leading-relaxed mb-4">{post.frontmatter.description}</p>
            <span className="text-sm font-medium text-primary">Read more →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
