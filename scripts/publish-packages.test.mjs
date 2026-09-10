import test from 'node:test';
import assert from 'node:assert/strict';
import { packages, releasePlan, runRelease } from './publish-packages.mjs';

const readManifest = async (name) => ({ name: `@metastrip/${name}`, version: '1.2.3' });
const silence = () => {};

test('registry preflight includes hooks and distinguishes existing versions', async () => {
  const plan = await releasePlan({ readManifest, fetchRegistry: async (url) => ({
    status: url.includes('hooks') ? 404 : 200,
    json: async () => ({ version: '1.2.3' }),
  }) });
  assert.deepEqual(plan.map((p) => p.name), packages.map((p) => `@metastrip/${p}`));
  assert.deepEqual(plan.map((p) => p.published), [true, true, true, false]);
});

test('registry failure cannot trigger a package publication', async () => {
  const commands = [];
  await assert.rejects(runRelease({ publish: true, npm: (args) => commands.push(args),
    plan: () => releasePlan({ readManifest, fetchRegistry: async () => ({ status: 503 }) }),
  }), /Registry check failed/);
  assert.equal(commands.length, 0);
});

test('private or unexpected manifests fail before a registry request', async () => {
  await assert.rejects(releasePlan({ readManifest: async () => ({ name: '@metastrip/core', version: '1.2.3', private: true }),
    fetchRegistry: async () => { throw new Error('Must not request'); },
  }), /Invalid public release manifest/);
});

test('dry run packs all packages without publishing', async () => {
  const commands = [];
  await runRelease({ plan: async () => packages.map((p) => ({ name: p, version: '1.2.3', workspace: `packages/${p}`, published: false })),
    npm: (args) => commands.push(args), log: silence });
  assert.equal(commands.length, 4);
  assert.ok(commands.every(([command, flag]) => command === 'pack' && flag === '--dry-run'));
});

test('publication skips existing versions and stops on the first failure', async () => {
  const commands = [];
  await assert.rejects(runRelease({ publish: true,
    plan: async () => packages.map((p) => ({ name: p, version: '1.2.3', workspace: `packages/${p}`, published: p === 'core' })),
    npm: (args) => { commands.push(args); if (args[0] === 'publish') throw new Error('Authentication denied'); }, log: silence,
  }), /Authentication denied/);
  assert.equal(commands.filter(([command]) => command === 'publish').length, 1);
  assert.equal(commands.at(-1)[2], 'packages/cli');
});
