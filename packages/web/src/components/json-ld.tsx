/**
 * JsonLd — server component for injecting JSON-LD structured data.
 *
 * Uses React's script children pattern instead of dangerouslySetInnerHTML.
 * All values must come from trusted, static sources (e.g. on-disk MDX files).
 * JSON.stringify escapes all special characters; </script> sequences are
 * additionally escaped to prevent early script tag termination.
 */

interface JsonLdProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

export default function JsonLd({ data }: JsonLdProps) {
  const serialized = JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>');
  // Pass JSON-LD as script element children — React renders it as text content
  // without needing dangerouslySetInnerHTML.
  return <script type="application/ld+json">{serialized}</script>;
}
