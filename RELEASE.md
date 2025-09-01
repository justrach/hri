# Release Guide

Automated releases publish to npm when a `v*` tag is pushed to a commit on `main`. The workflow builds first, then runs tests, and only then publishes if everything passes.

## Prerequisites
- NPM token secret: Add `NPM_TOKEN` in GitHub repo settings → Secrets and variables → Actions. The token must have publish access to the `hri` package (classic token with `publish` scope or organization automation token).
- Repo metadata: Ensure `package.json` has the correct `name`, `repository.url`, `homepage`, and `bugs.url` for this repo.

## Release Steps (CI publishes)
1. Ensure you are on `main` and up to date:
   - `git checkout main && git pull`
2. Bump the version (creates a `vX.Y.Z` tag):
   - Patch: `npm version patch`
   - Minor: `npm version minor`
   - Major: `npm version major`
3. Push the commit and tag:
   - `git push origin main --follow-tags`

That’s it — pushing the tag triggers the GitHub Actions workflow to build, test, and publish to npm.

### Alternative: Tag an existing version
If `package.json` already has the desired version on `main` and you only need to tag it:
- `git checkout main && git pull`
- `git tag vX.Y.Z`
- `git push origin vX.Y.Z`

## What CI Does
The workflow at `.github/workflows/release.yml`:
- Ensures the pushed tag’s commit is on `main` (fails otherwise).
- Sets up Node 20 and Bun 1.1.x.
- Installs dependencies with `bun install --frozen-lockfile`.
- Builds with `bun run build`.
- Runs tests with `bun test`.
- Verifies the tag version equals `package.json` version.
- Publishes with `npm publish --provenance --access public` using `NPM_TOKEN`.

## Tag and Version Rules
- Tag format: `vX.Y.Z` (e.g., `v0.2.3`).
- The tag version must match `package.json.version` or the job will fail.
- The tag must point to a commit on `main` or the job will fail.

## Manual Runs
The workflow supports manual `workflow_dispatch`, but it will not publish without a `v*` tag. Manual runs can be used to validate build/tests.

## Troubleshooting
- Tag not on main: Delete and re-create the tag on a commit that exists on `main`.
  - `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
  - `git tag vX.Y.Z <commit-on-main> && git push origin vX.Y.Z`
- Version mismatch: Ensure `package.json.version` equals the tag (without the leading `v`).
- Auth errors: Verify `NPM_TOKEN` exists and has publish rights to `hri`. Organization SSO may need enabling for the token.

## Local Publishing (optional)
If you prefer to publish locally, scripts exist but bypass CI:
- Patch: `npm run release:patch`
- Minor: `npm run release:minor`
- Major: `npm run release:major`

Using these will publish from your machine and won’t run the CI checks; prefer the CI-based approach above for consistency.

