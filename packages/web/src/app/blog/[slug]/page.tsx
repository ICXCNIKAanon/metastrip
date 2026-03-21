import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getBlogSlugs, getPostBySlug } from '@/lib/blog';
import JsonLd from '@/components/json-ld';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};

  const { frontmatter } = post;
  const url = `https://metastrip.ai/blog/${slug}`;

  return {
    title: `${frontmatter.title} — MetaStrip`,
    description: frontmatter.description,
    authors: [{ name: frontmatter.author }],
    alternates: { canonical: url },
    openGraph: {
      title: frontmatter.title,
      description: frontmatter.description,
      type: 'article',
      url,
      siteName: 'MetaStrip',
      publishedTime: frontmatter.date,
      authors: [frontmatter.author],
    },
    twitter: {
      card: 'summary_large_image',
      title: frontmatter.title,
      description: frontmatter.description,
    },
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const { frontmatter, content } = post;

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: frontmatter.title,
    description: frontmatter.description,
    author: { '@type': 'Organization', name: frontmatter.author },
    datePublished: frontmatter.date,
    publisher: { '@type': 'Organization', name: 'MetaStrip', url: 'https://metastrip.ai' },
    url: `https://metastrip.ai/blog/${slug}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://metastrip.ai/blog/${slug}` },
  };

  return (
    <>
      <JsonLd data={articleJsonLd} />

      <article className="max-w-3xl mx-auto px-4 pt-16 pb-24">
        {/* Back link */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-primary transition-colors mb-10"
        >
          ← Back to Blog
        </Link>

        {/* Header */}
        <header className="mb-10">
          <p className="text-sm text-text-tertiary mb-3">
            {formatDate(frontmatter.date)} &middot; {frontmatter.author}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-text-primary leading-tight mb-4">
            {frontmatter.title}
          </h1>
          <p className="text-lg text-text-secondary leading-relaxed">
            {frontmatter.description}
          </p>
        </header>

        <hr className="border-border mb-10" />

        {/* MDX Content */}
        <div className="prose-metastrip">
          <MDXRemote source={content} />
        </div>

        <hr className="border-border mt-12 mb-8" />

        {/* Footer nav */}
        <div className="flex justify-between items-center">
          <Link
            href="/blog"
            className="text-sm text-text-tertiary hover:text-primary transition-colors"
          >
            ← All posts
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-primary hover:underline"
          >
            Try MetaStrip free →
          </Link>
        </div>
      </article>
    </>
  );
}
