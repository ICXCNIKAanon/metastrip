import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const packages = ['core', 'cli', 'mcp-server', 'hooks'];

// Complete every registry check before publishing anything. A registry outage,
// denied request, or malformed response must never be treated as a new version.
export async function releasePlan({ fetchRegistry = fetch, readManifest = async (name) =>
  JSON.parse(await readFile(new URL(`../packages/${name}/package.json`, import.meta.url), 'utf8')) } = {}) {
  return Promise.all(packages.map(async (directory) => {
    const manifest = await readManifest(directory);
    if (manifest.private || manifest.name !== `@metastrip/${directory}` || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      throw new Error(`Invalid public release manifest: ${directory}`);
    }
    const response = await fetchRegistry(
      `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${manifest.version}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (response.status !== 200 && response.status !== 404) {
      throw new Error(`Registry check failed for ${manifest.name}: HTTP ${response.status}`);
    }
    if (response.status === 200 && (await response.json()).version !== manifest.version) {
      throw new Error(`Unexpected registry response for ${manifest.name}`);
    }
    return { name: manifest.name, version: manifest.version, workspace: `packages/${directory}`, published: response.status === 200 };
  }));
}

const runNpm = (args) => execFileSync('npm', args, { cwd: root, stdio: 'inherit' });

export async function runRelease({ publish = false, plan = releasePlan, npm = runNpm, log = console.log } = {}) {
  const entries = await plan();
  // Validate every package tarball first, including packages already published.
  for (const entry of entries) {
    npm(['pack', '--dry-run', '--workspace', entry.workspace]);
    log(`${entry.name}@${entry.version}: ${entry.published ? 'already published; skip' : publish ? 'ready to publish' : 'unpublished; dry run only'}`);
  }
  if (!publish) {
    log('Dry run complete. Nothing was published.');
    return;
  }
  // Keep core first so its dependants can resolve it. Failures propagate; a
  // subsequent run skips successful versions and retries only unpublished ones.
  for (const entry of entries.filter((entry) => !entry.published)) {
    npm(['publish', '--workspace', entry.workspace, '--access', 'public', '--provenance']);
    log(`Published ${entry.name}@${entry.version}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = process.argv.slice(2);
  if (flags.length > 1 || flags.some((flag) => flag !== '--dry-run' && flag !== '--publish')) {
    console.error('Usage: node scripts/publish-packages.mjs [--dry-run | --publish]');
    process.exitCode = 1;
  } else {
    try {
      await runRelease({ publish: flags.includes('--publish') });
    } catch (error) {
      console.error(`Release failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
