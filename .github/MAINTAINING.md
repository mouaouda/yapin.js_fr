# Maintaining yapin.js

Notes for maintainers on how the repository runs itself and what still needs a person.

## What's automated

| What | How |
| --- | --- |
| Tests on Node 18, 20, 22 and 24, plus Windows and macOS | `.github/workflows/ci.yml` on every PR, push to `main`, and weekly |
| Type declarations compile, no runtime dependencies, package contents | The "Types and package" job in CI |
| Security scanning of the code and workflows | CodeQL default setup (Settings → Code security) |
| Dependency and GitHub Actions updates | Dependabot, weekly on Mondays (`.github/dependabot.yml`) |
| Merging minor and patch updates | `.github/workflows/dependabot-auto-merge.yml` approves them and turns on auto-merge, so they merge once CI passes. Majors wait for you. |
| Security alerts and fixes for vulnerable dependencies | Dependabot alerts and security updates |
| Secrets pushed by mistake | Secret scanning with push protection |
| Closing issues where the reporter never answered | `.github/workflows/stale.yml`, only for the `needs info` label |
| Release notes | Generated from PR titles and labels (`.github/release.yml`) |
| Publishing to npm | `.github/workflows/publish.yml` when a release is published |

## Rules on `main`

`main` is protected by the **main** ruleset (Settings → Rules → Rulesets):

- Changes go through a pull request with one approval. Stale approvals are dismissed when new commits are pushed, and review threads must be resolved.
- The **CI passed** check must succeed, and CodeQL must not report new high or critical alerts.
- No force pushes or deleting the branch. History stays linear (squash merges only).
- Repository admins can bypass the rules, but only through a pull request. That's what lets a sole maintainer merge their own PRs; use it sparingly and let CI finish first.

The **release tags** ruleset stops `v*` tags from being moved or deleted once published.

If you add a CI job that should block merges, make `ci-passed` depend on it. Don't add job names to the ruleset directly.

## Triage

New issues arrive labelled `needs triage`. For each one:

1. Questions: convert to a discussion.
2. Not enough to go on: ask for what you need and add `needs info`. It closes itself after three weeks without a reply.
3. Confirmed: remove `needs triage`, keep `bug` or `enhancement`, and add `good first issue` or `help wanted` if it suits an outside contributor.
4. Anything that looks like a vulnerability: ask the reporter to use private reporting instead (see `SECURITY.md`) and hide the comment if it contains exploit details.

Label PRs before merging so the release notes put them in the right section: `breaking`, `security`, `enhancement`, `bug`, `documentation`, or `skip changelog`.

## Releasing

1. Open a PR that bumps `version` in `package.json` (`npm version minor --no-git-tag-version`, or `patch`). While below 1.0, breaking changes bump the minor version.
2. Merge it.
3. On GitHub, go to Releases → **Draft a new release**, create the tag `v<version>` on `main`, click **Generate release notes**, tidy them up and publish. Tick **Set as a pre-release** to publish under npm's `next` tag instead of `latest`.
4. The Publish workflow checks the tag matches `package.json`, runs the tests and publishes with provenance.

### npm credentials

The publish job runs in the `npm` environment, which only release tags (`v*`) can deploy to.

- **First publish:** npm trusted publishing can only be set up for a package that already exists, so the first release needs a token. Create a granular access token on npmjs.com with publish rights, add it as the `NPM_TOKEN` secret on the `npm` environment, and publish a release.
- **After that:** on npmjs.com, open the package's Settings → **Trusted publishing**, add GitHub Actions with organisation `yapin-js`, repository `yapin.js`, workflow `publish.yml` and environment `npm`. Then delete the `NPM_TOKEN` secret and revoke the token. Publishing then needs no long-lived secret at all.

## Handling a security report

Reports arrive as draft advisories under Security → Advisories.

1. Acknowledge within 3 days.
2. Work on the fix in the advisory's private fork (**Start a temporary private fork**), so it isn't visible before release.
3. Merge, release a patched version, then publish the advisory. That requests a CVE if you ask for one and notifies everyone using the affected versions through Dependabot.

## Adding a maintainer

1. Give them the Maintain or Admin role on the repository (or add them to an org team that has it).
2. Add them to `.github/CODEOWNERS` so they're requested for reviews.
3. If they'll publish releases, nothing else is needed once trusted publishing is set up; publishing happens from the workflow, not from anyone's machine.
