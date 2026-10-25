# Contributing to yapin.js

Thanks for helping out. Bug reports, docs fixes, examples and code are all welcome.

## Before you start

- **Questions** go in [Discussions](https://github.com/yapin-js/yapin.js/discussions), not issues.
- **Bugs and feature ideas** go in [Issues](https://github.com/yapin-js/yapin.js/issues/new/choose). Search first; someone may have already reported it.
- **Security problems** must not be reported in public. See [SECURITY.md](SECURITY.md).
- **Big changes** (new public APIs, behaviour changes, anything that breaks existing bots) should start as an issue so we can agree on the shape before you write the code.

Small fixes such as typos, docs, failing edge cases and missing types can go straight to a pull request.

## Setting up

You need Node.js 22 or newer for development (the library itself supports 18.17+).

```sh
git clone https://github.com/yapin-js/yapin.js.git
cd yapin.js
npm install
npm test
npm run typecheck
```

`npm install` only installs dev tools (TypeScript and Node's type definitions). The library has no runtime dependencies, and it must stay that way: don't add anything to `dependencies`. Optional integrations go in `peerDependencies` with `peerDependenciesMeta.optional`, the way `ws` and `@livekit/rtc-node` are.

## Project layout

| Path | What's there |
| --- | --- |
| `src/` | The library. `src/index.js` is the public entry point. |
| `types/index.d.ts` | Hand-written TypeScript declarations for everything exported. |
| `test/` | Tests using `node:test`. `test/helpers/mockYapin.js` is a fake Yapin’ API, so tests run offline. |
| `docs/` | User documentation, linked from the README. |
| `examples/` | Small runnable bots. |

## Making a change

1. Fork the repo and create a branch from `main`.
2. Make your change. Keep it focused; unrelated cleanups belong in their own PR.
3. Add or update tests. Bug fixes should come with a test that fails without the fix.
4. If you changed anything public, update `types/index.d.ts` and the relevant page in `docs/`.
5. Run `npm test` and `npm run typecheck`.
6. Open a pull request and fill in the template.

### Code style

There is no formatter or linter, so match the code around you:

- ES modules, 2-space indent, single quotes, semicolons, trailing commas in multi-line literals.
- Only standard Node APIs (`fetch`, `node:*` modules). If you need something that isn't in Node 18.17, feature-detect it and fall back.
- Public APIs follow discord.js naming where a discord.js equivalent exists. That familiarity is the point of the library.
- Errors thrown to users should be `YapinError` subclasses from `src/errors/` with a clear message saying what went wrong and what to do about it.

### Docs style

- Plain, direct sentences. Show a short code example rather than describing it.
- Use the Yapin’ name with its apostrophe.
- Don't use em dashes or en dashes; use a comma, colon, parentheses or a new sentence instead.

### Commit messages and PR titles

PRs are squash-merged, so the **PR title** becomes the commit on `main` and shows up in the release notes. Write it as a short summary of the change for a bot developer, for example "Add `member.kick()` reason support" or "Fix gateway reconnect after a 1006 close". Prefixes like `fix:` or `feat:` are fine but not required.

## Review

Every PR needs one approving review and a passing CI run before it can merge. A maintainer will usually respond within a week. If it's been longer, a polite ping on the PR is fine.

Maintainers may push small fixes to your branch to get it over the line. Uncheck "Allow edits by maintainers" if you'd rather they didn't.

## Code of Conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
