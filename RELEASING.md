# npm releases

Normal pushes run CI and deploy the website. They do not publish npm packages.

The manually triggered **Publish npm packages** workflow in `.github/workflows/publish.yml` handles `@metastrip/core`, `@metastrip/cli`, `@metastrip/mcp-server`, and `@metastrip/hooks`, in that order. It runs only from `main`, builds and tests first, and defaults to a dry run. No package versions were changed by the September 10 quality upgrade; new versions are required to distribute its package changes.

## Configure publishing access

Prefer npm trusted publishing. In the npm settings for **each** of the four packages, configure:

- GitHub organization/user: `ICXCNIKAanon`
- Repository: `metastrip`
- Workflow filename: `publish.yml`
- Environment: leave blank (this workflow has no named environment)
- Allowed action: `npm publish` (new trusted-publisher configurations may default to staged publication instead)

The workflow uses GitHub-hosted runners, Node 24, and `id-token: write`. npm trusted publishing requires Node >=22.14.0 and npm >=11.5.1; the bundled npm on the selected Node release supports it. An optional granular token with publishing access to this scope can instead be stored as repository secret `NPM_TOKEN`. A token must support noninteractive publishing under the account's 2FA policy.

The package `repository.url` fields point to `https://github.com/ICXCNIKAanon/metastrip`, as required for provenance. Publisher access has **not** been configured or verified by this upgrade. Local `npm whoami` is not an OIDC verification method.

## Prepare and review

1. Update the versions of changed packages with `npm version <version> --workspace packages/<package> --no-git-tag-version`, review dependency ranges, and commit the manifest and lockfile changes. Published versions cannot be overwritten.
2. Run `npm ci`, `npm run build`, `npm test`, and `node --test scripts/publish-packages.test.mjs`.
3. Run `node scripts/publish-packages.mjs --dry-run`, or dispatch **Publish npm packages** with `dry_run: true`. This reviews all four package contents and reports whether each exact version already exists on npm. It does not publish anything.
4. After reviewing the package contents and configuring authentication, dispatch the workflow on `main` with `dry_run: false` to publish new versions.

Every registry lookup and package dry-pack must succeed before any publication begins. Only a 404 is considered an unpublished version; authorization, network, malformed-response, and registry errors fail the job. Existing exact versions are skipped. Publication errors stop the job without being swallowed. A partial release can be rerun after fixing the failure; already-published versions are skipped.

This workflow does not publish the web/API workspace, browser extensions, Firefox add-ons, or desktop/VS Code integrations. Those channels require separate release procedures and publisher access.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/).
