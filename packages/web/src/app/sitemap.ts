import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://metastrip.ai';
  const routes = ['', '/docs', '/pricing', '/blog', '/compare', '/changelog', '/privacy', '/terms'];
  const posts = await getAllPosts();
  return [
    ...routes.map(route => ({ url: `${base}${route}`, priority: route === '' ? 1 : 0.7 })),
    ...posts.map(post => ({ url: `${base}/blog/${post.slug}`, ...(Number.isFinite(Date.parse(post.frontmatter.date)) ? { lastModified: new Date(post.frontmatter.date) } : {}), priority: 0.6 })),
  ];
}
