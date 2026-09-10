# MetaStrip quality upgrade — 2026-09-10

## Release scope

The landing page now explains the tool and its limits in server-rendered content. The browser workflow inspects files in a worker, processes batches sequentially, verifies each output again, and reports actual remaining fields. A synthetic sample exercises the workflow without needing a personal file. Original files remain unchanged.

The source baseline was `86f6f0e`, matching the previous production landing page at `https://metastrip.ai`. Implementation commit `7aaaa4a33685a9a1fd3e93755d627a55c045c19e` was pushed to canonical `main` and deployed to the existing Vercel production project on September 10, 2026. No npm packages or extension-store artifacts were published.

### File correctness and privacy

- Correct WebP EXIF/XMP/ICC bit masks in the browser, hooks, and both browser extensions. Preserve alpha and animation flags; reject truncated chunks. Regression tests decode a real WebP before and after cleaning to compare pixels.
- Preserve the minimal JPEG orientation needed to display rotated photos without retaining the original private EXIF block; discard trailing bytes after EOI.
- Replace MP4/MOV/M4A metadata boxes with zero-filled, same-size `free` boxes. This preserves media offsets and extended-size headers.
- Reject real HEIC/AVIF image-item cleaning instead of deleting essential container metadata and corrupting the image. The browser input explains this limitation.
- Preserve PDF byte offsets while blanking supported dictionary values, including escaped/nested strings; leave content streams alone and reject encrypted PDFs. This is not document redaction or a complete PDF sanitizer.
- Validate SVG roots instead of accepting arbitrary XML declarations as SVG files.
- Remove automatic map-tile/geocoding requests. Coordinates are displayed locally, with an explicit optional external map link.
- Give ExifReader a strict XML parser in the worker so XMP is actually included in before/after inspection. Escape injected XML values and validate coordinate bounds.

### Browser experience and discoverability

- Accessible file selection, per-file errors, worker cancellation, file/batch limits, cleanup, and a real ZIP download for multiple results.
- Actual post-clean risk/fields replace the previous unconditional clean score. Limited inspectors say so; decoy metadata is visible in the after-inspection.
- Comparison messages reflect observed fields without claiming that missing metadata identifies a different device or that a matching tag proves physical identity.
- Responsive layout, better small-text contrast, keyboard focus, reduced-motion support, accessible metadata tables, and local demonstration.
- Canonical URLs per route, appropriate page titles/social metadata, valid page-specific JSON-LD, visible FAQs matching their schema, and sitemap dates from real blog frontmatter.
- Updated `llms.txt`, `llms-full.txt`, docs, pricing, and privacy explanations. Paid APIs remain explicitly planned. Replaced the nonfunctional email form with a clearly labeled email link.
- Dependency security updates within the current Next major, removal of unused vulnerable packages, and current test tooling. The root/core Node requirement is now >=20.9.0.

## Validation

- `npm test`: 397 web tests and 221 hooks tests pass (618 total).
- `npm run build`: all six workspaces build successfully; web generates 28 routes on Next 15.5.25.
- `npm run typecheck -w packages/web`: passes.
- `npm audit`: zero reported vulnerabilities, including development dependencies.
- `git diff --check`: passes.
- Production-build browser QA through Chrome: desktop and 390px mobile layouts, sample inspection, worker cleaning, actual output inspection, decoy injection, and downloaded JPEG decode. Ordinary sample: risk 15 -> 0 and 515 -> 267 bytes; decoy sample correctly reports risk 60 and 12 remaining fields.
- Local HTTP checks: home/docs/pricing/compare/blog/privacy/terms return 200, each has one matching canonical and one H1; JSON-LD parses successfully. Home first-load JS is 117 kB in this build.
- Production HTTP checks repeat these results on `https://metastrip.ai`; sitemap, robots, and both LLM text resources return 200. The new landing copy and sample button are present in server-rendered HTML.
- Production Chrome QA repeats sample inspection -> cleaning -> reinspection: 515 -> 267 bytes and risk 15 -> 0; decoy injection returns risk 60 and 12 detected fields. Browser error logs are empty.
- GitHub Actions for implementation commit `7aaaa4a` passed on Node 20 and 22, and the production deployment workflow completed successfully. The separate publish job reports success but does not prove npm publication because its commands mask errors.

The browser automation extension could not upload local fixture paths without its separate file-URL permission. The built-in synthetic sample was used for the full browser flow; real binary fixtures were covered by automated regression tests.

## Remaining limits

- This is a focused quality and correctness upgrade, not an exhaustive security certification of all parsers or API endpoints.
- HEIC/AVIF browser image-item cleaning is unavailable until a format-aware implementation can safely update item locations.
- PDF compressed objects, embedded attachments, document signatures, and visible content require separate review. Other containers may include fields the limited inspector does not expose. The UI and docs communicate these limits.
- Some rendering information is intentionally preserved, including JPEG orientation and default color profiles. A score of zero is not a guarantee of anonymity.
- Hook and extension fixes require their own package/store distribution to reach installed clients. This commit does not bump package versions or publish artifacts.
- Existing site analytics remain. Files are not uploaded by the cleaner; choosing an external map or mail link explicitly leaves the local workflow.

## Deployment mapping

- GitHub: `ICXCNIKAanon/metastrip`
- Vercel project: `metastrip`
- Vercel team: `team_R2KhioxYpnKRHFuhf2v7mHff`
- Production domain: `https://metastrip.ai`
- Existing `vercel.json`: install `npm install --legacy-peer-deps`; build `cd packages/web && npm run build`; output `packages/web/.next`.
- Local preview: `npm run start -w packages/web -- --hostname 127.0.0.1 --port 3212` after building.
- Verified production deployment: `dpl_2BykvZVUnzmaXHkv5UJppQ93N5rh`, [deployment URL](https://metastrip-5sy8huwhf-34567893.vercel.app), aliased to `https://metastrip.ai` with state `READY`.
- The existing GitHub workflow also deployed the same implementation commit. Its later ready deployment `dpl_5i3QfhLhw1c7N3XQmQ5ihK2UzCyU`, [deployment URL](https://metastrip-ri9w9hk7h-34567893.vercel.app), is now the production alias target. [Deployment workflow](https://github.com/ICXCNIKAanon/metastrip/actions/runs/34517788797); [CI results](https://github.com/ICXCNIKAanon/metastrip/actions/runs/34517788972).

## Package and extension distribution audit

Read-only checks on September 10, 2026 found:

| Distribution | Published / source version | Remaining release work |
| --- | --- | --- |
| npm `@metastrip/core` | 0.1.0, published March 20 | Publish a new version for the updated dependencies and Node requirement. |
| npm `@metastrip/cli` | 0.1.0, published March 20 | No CLI source change in this upgrade; its `@metastrip/core: *` dependency can pick up a later core release. Verify the released CLI against that version. |
| npm `@metastrip/mcp-server` | 0.1.0, published March 20 | No MCP source change in this upgrade; its `@metastrip/core: *` dependency can pick up a later core release. Verify the released server against that version. |
| npm `@metastrip/hooks` | 0.2.0, published March 22 | Publish a new version containing the file-format fixes. The current CI publish job does not publish hooks. |
| Chrome extension | Manifest 0.3.0 | Increment version and distribute updated extension source. The repository documents load-unpacked installation; no store listing or publishing workflow is configured. |
| Firefox extension | Manifest 0.3.0 | Increment version and distribute/sign the update. The repository documents temporary installation; no add-on store publishing workflow is configured. |
| GitHub release | v0.3.0, March 22; zero attached assets | Create a new release and built distribution assets if this is the chosen channel. |

Local `npm whoami` returns `ENEEDAUTH`. Repository secret names are `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN`; there is no `NPM_TOKEN`. The existing CI job references `NPM_TOKEN`, attempts core/CLI/MCP publication, and masks failures with `|| true`. Successful CI must therefore not be treated as proof of npm publication. Publishing requires an authorized npm login/token or a configured trusted-publisher workflow with access to the `@metastrip` scope. Store publication separately requires the appropriate Chrome Web Store/Mozilla publisher account and listing access; neither was verified or requested through this release. No packages or extensions were installed into the user's desktop applications.

## Primary references

- [WebP RIFF container specification](https://developers.google.com/speed/webp/docs/riff_container)
- [Google Search: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Next.js metadata reference](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Next.js security advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)
- [sharp 0.35.4 release](https://github.com/lovell/sharp/releases/tag/v0.35.4)
- ExifReader's installed README documents providing `DOMParser` when browser-worker globals lack it.
