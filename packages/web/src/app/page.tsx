import type { Metadata } from "next";
import Link from "next/link";
import FileTool from "@/components/file-tool";
import CodeBlock from "@/components/code-block";
import FaqAccordion from "@/components/faq-accordion";
import JsonLd from "@/components/json-ld";
import FeatureRequest from "@/components/feature-request";
import { FAQ_ITEMS, FORMAT_GROUPS, HOME_DESCRIPTION } from "@/lib/site-content";
export const metadata: Metadata = {
  title: { absolute: "MetaStrip — Free Metadata Remover, No Uploads" },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: "MetaStrip — Clean your files. Keep your privacy.",
    description: HOME_DESCRIPTION,
    url: "/",
    type: "website",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "MetaStrip — Free Metadata Remover",
    description: HOME_DESCRIPTION,
    images: ["/og-image.png"],
  },
};
export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden px-4 pt-12 md:pt-20 pb-10 text-center">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.10),transparent_65%)]"
          aria-hidden="true"
        />
        <div className="relative max-w-4xl mx-auto">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-mono text-primary mb-7">
            <span
              className="h-1.5 w-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            PRIVATE BY DESIGN. FREE TO USE.
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.08]">
            Clean your files.
            <br />
            <span className="text-primary">Keep your privacy.</span>
          </h1>
          <p className="text-base md:text-lg text-text-secondary max-w-2xl mx-auto mt-6 leading-relaxed">
            Remove hidden metadata from images, documents, audio and video.
            <br className="hidden md:block" /> Inspect what your files reveal,
            then clean them in your browser.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-6 text-xs text-text-secondary">
            <span>No file uploads</span>
            <span>No account required</span>
            <span>Originals stay unchanged</span>
          </div>
        </div>
      </section>
      <section
        id="tool"
        aria-label="Inspect and clean files"
        className="max-w-3xl mx-auto px-4 pb-12 scroll-mt-24"
      >
        <FileTool />
        <noscript>
          <p className="p-4 border border-border mt-4">
            Enable JavaScript to process files locally, or use the{" "}
            <a href="/docs#cli">MetaStrip command-line tool</a>.
          </p>
        </noscript>
      </section>
      <section
        aria-label="How metadata removal works"
        className="max-w-5xl mx-auto px-4 py-12 border-t border-border"
      >
        <div className="grid sm:grid-cols-3 gap-8">
          {[
            [
              "01",
              "Inspect",
              "Choose your files. Review detected GPS, device, author and timestamp fields locally.",
            ],
            [
              "02",
              "Clean",
              "Remove supported metadata. Processing happens in a background worker on your device.",
            ],
            [
              "03",
              "Check & download",
              "Review the actual output inspection. Save a cleaned copy or download your batch as a ZIP.",
            ],
          ].map(([number, title, text]) => (
            <div key={number}>
              <span className="font-mono text-xs text-primary">{number}</span>
              <h2 className="text-lg font-semibold mt-3 mb-2">{title}</h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section
        id="formats"
        className="max-w-5xl mx-auto px-4 py-14 md:py-20 scroll-mt-24"
      >
        <p className="font-mono text-xs text-primary uppercase tracking-wider mb-3">
          More than photo metadata
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <h2 className="text-3xl font-bold tracking-tight">
            One place to clean your files.
          </h2>
          <Link
            href="/docs#browser-limits"
            className="text-sm text-accent underline"
          >
            Format guide &amp; limits →
          </Link>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {FORMAT_GROUPS.map((group) => (
            <article
              key={group.name}
              className="p-6 rounded-card border border-border bg-surface"
            >
              <h3 className="font-semibold text-lg">{group.name}</h3>
              <p className="font-mono text-xs text-primary mt-3 leading-relaxed">
                {group.formats}
              </p>
              <p className="text-sm text-text-secondary mt-4 leading-relaxed">
                {group.details}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="max-w-5xl mx-auto px-4 py-14 border-y border-border">
        <div className="grid md:grid-cols-2 gap-10">
          <div>
            <p className="font-mono text-xs text-primary uppercase tracking-wider mb-3">
              Know what travels with a file
            </p>
            <h2 className="text-3xl font-bold tracking-tight">
              The hidden details matter.
            </h2>
          </div>
          <div className="space-y-4 text-text-secondary leading-relaxed text-sm">
            <p>
              Photos can carry EXIF data such as location, camera information
              and the time they were taken. Documents may include an author,
              company or editing history. Audio and video can contain creator
              details and recording timestamps.
            </p>
            <p>
              MetaStrip helps you inspect these fields and remove supported
              metadata before sharing. It does not remove information visible in
              an image or document, and no scan can establish anonymity.
            </p>
            <Link
              href="/blog/what-is-metadata"
              className="inline-block text-accent underline"
            >
              Learn how file metadata works →
            </Link>
          </div>
        </div>
      </section>
      <section className="max-w-5xl mx-auto px-4 py-14 md:py-20">
        <p className="font-mono text-xs text-primary uppercase tracking-wider mb-3">
          Make privacy part of your workflow
        </p>
        <h2 className="text-3xl font-bold tracking-tight mb-3">
          Built for developers, too.
        </h2>
        <p className="text-text-secondary text-sm mb-8">
          Use the local CLI, connect an AI assistant through MCP, or inspect
          files from your own code.
        </p>
        <div className="grid md:grid-cols-3 gap-5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-3">Command line</h3>
            <CodeBlock
              language="bash"
              code={
                "npm install -g @metastrip/cli\nmetastrip inspect photo.jpg\nmetastrip clean photo.jpg"
              }
            />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-3">MCP server</h3>
            <CodeBlock
              language="json"
              code={
                '{\n  "mcpServers": {\n    "metastrip": {\n      "command": "npx",\n      "args": ["-y", "@metastrip/mcp-server"]\n    }\n  }\n}'
              }
            />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-3">Node.js library</h3>
            <CodeBlock
              language="typescript"
              code={
                "import { MetaStrip } from '@metastrip/core';\nconst ms = new MetaStrip();\nawait ms.inspect('photo.jpg');"
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-6 text-sm mt-6">
          <Link href="/docs" className="text-accent underline">
            Read the documentation →
          </Link>
          <a
            href="https://github.com/ICXCNIKAanon/metastrip"
            className="text-accent underline"
          >
            Explore the source →
          </a>
        </div>
      </section>
      <section className="max-w-3xl mx-auto px-4 py-12 md:py-16 border-t border-border">
        <h2 className="text-3xl font-bold tracking-tight mb-6">
          Frequently asked questions
        </h2>
        <FaqAccordion items={FAQ_ITEMS} />
      </section>
      <FeatureRequest />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebApplication",
              "@id": "https://metastrip.ai/#app",
              name: "MetaStrip",
              url: "https://metastrip.ai/",
              description: HOME_DESCRIPTION,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web browser",
              browserRequirements: "JavaScript and Web Workers",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              publisher: { "@id": "https://metastrip.ai/#organization" },
              featureList: [
                "Local file processing",
                "Metadata inspection",
                "Metadata removal",
                "Batch processing",
                "ZIP downloads",
              ],
            },
            {
              "@type": "FAQPage",
              "@id": "https://metastrip.ai/#faq",
              mainEntity: FAQ_ITEMS.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer },
              })),
            },
          ],
        }}
      />
    </>
  );
}
