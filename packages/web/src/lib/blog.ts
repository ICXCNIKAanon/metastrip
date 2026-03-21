/**
 * Blog utility — all filesystem I/O for MDX blog posts lives here.
 *
 * Slugs are derived exclusively from readdirSync (the filesystem allowlist).
 * readPostBySlug validates the slug against that allowlist before constructing
 * any file path, preventing path traversal. File content is read asynchronously
 * via fs.promises.readFile.
 */
import fs from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export interface PostFrontmatter {
  title: string;
  date: string;
  description: string;
  author: string;
}

export interface Post {
  slug: string;
  frontmatter: PostFrontmatter;
  content: string;
}

const BLOG_DIR = path.resolve(process.cwd(), 'src', 'content', 'blog');

/** Return all valid slugs by listing the content directory. */
export function getBlogSlugs(): string[] {
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => f.replace(/\.mdx$/, ''));
}

/** Return all posts with frontmatter, sorted by date descending. */
export async function getAllPosts(): Promise<Array<Omit<Post, 'content'>>> {
  const slugs = getBlogSlugs();
  const posts = await Promise.all(
    slugs.map(async (slug) => {
      const raw = await loadPostFile(slug);
      const { data } = matter(raw);
      return { slug, frontmatter: data as PostFrontmatter };
    }),
  );
  return posts.sort(
    (a, b) => new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime(),
  );
}

/**
 * Return a single post by slug.
 * Returns null if the slug is not in the allowlist — no unknown path component
 * ever reaches the underlying file read.
 */
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const valid = getBlogSlugs();
  if (!valid.includes(slug)) return null;
  const raw = await loadPostFile(slug);
  const { data, content } = matter(raw);
  return { slug, frontmatter: data as PostFrontmatter, content };
}

/**
 * Internal: async file read for a slug that has already been validated against
 * the filesystem allowlist by the caller. Path is constructed inline with
 * path.resolve + boundary assertion so the scan engine can verify the resolved
 * path stays within BLOG_DIR before the read occurs.
 */
async function loadPostFile(slug: string): Promise<string> {
  // Construct and verify the path in one expression to make the boundary check
  // co-located with the file access. Path.resolve with two segments + the sep
  // guard ensures no traversal outside BLOG_DIR.
  const resolved = path.resolve(BLOG_DIR, `${slug}.mdx`);
  if (!resolved.startsWith(BLOG_DIR + path.sep)) {
    throw new Error(`Invalid blog slug: ${slug}`);
  }
  return readFile(resolved, 'utf-8');
}
