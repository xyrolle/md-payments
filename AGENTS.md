# md-payments: contributor guide

md-payments provides unofficial TypeScript SDKs for Moldovan payment providers: maib Checkout and Victoriabank e-commerce. It is not affiliated with either bank.

## Design invariants
- **Amounts are integers in minor units** (bani: 1 MDL = 100 bani). There are no floats anywhere near money.
- **There are no dependencies beyond the platform's `fetch` and Web Crypto,** so it runs on Node, Bun, Deno and Cloudflare Workers.
- **Every callback and signed response is verified before it's trusted.** A failed verification is an error, never a warning.
- **A bank's ambiguous answer is reported as unknown, never as failed.** Only the statuses the bank documents as final end a payment.
- **Keys, card data and full tokens are never logged.** Neither are customer details beyond what the bank's API requires.
- **Retries carry the bank's idempotency mechanism.** Nothing is sent twice blindly.

## Testing
- **Tests run against each bank's sandbox where it exists,** and against recorded, scrubbed fixtures where it doesn't.
- **Signing and verification are tested with the bank's published examples** where available.

## Working rules

### Commits and pull requests
- Every commit message is a single-line title with a conventional prefix (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`). No body, no bullet points.
- One cause per commit. A commit carries the test that proves it: red before, green after.
- No `Co-Authored-By` trailer and no AI or tool attribution, in commits, pull request titles or descriptions.
- Never force push a shared branch. Changes after review go in as new commits.
- A pull request description says what was wrong, the cause, what changed and how it was tested. Short, plain, and true to the code as it stands.

### Code
- The smallest change at the cause. Weigh the alternatives and pick the simplest one that fully solves the problem.
- No `as any`, no casts, no `@ts-ignore`/`@ts-expect-error` and no avoidable `!`. Model the type instead.
- Code reads at a glance. A chain that needs a comment becomes a named constant or a small named function. Comments say why, never what.
- No legacy or compatibility code. Delete what you replace in the same change; no fallbacks "for old callers", no aliases.
- Public API changes are deliberate. Every exported name is documented and tested.

### Tests
- Tests exercise the real thing (see the testing section below). No mocks where the real dependency can run.
- A test creates the data it needs and leaves nothing behind.
- No timing sleeps. Wait for an observable condition.

### Tooling
- pnpm only, with the version pinned in `packageManager`. Node 24 LTS.
- The latest stable, fastest tooling: Biome (lint and format), Vitest, and TypeScript 7 (`tsgo`) for type checking.
- `pnpm check`, `pnpm typecheck` and `pnpm test` all pass before a push.

### Docs
- Docs record decisions and their reasons, not implementation retellings.
- Open follow-ups go in `docs/followups.md`, each with "done when"; delete an entry in the change that resolves it.
