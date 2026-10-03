# Pulse P1.1 / P1.2 verification

This replaces the previous report, which claimed successful host linking and
test coverage while the implementation saved an unchanged quiz and had no
linking tests.

## Change

- Added the missing Zod draft/assignment schemas and types.
- New drafts disable guests. An owner email can remain pending with `ownerId`
  null until its first verified Microsoft institute sign-in.
- Embedded assignments are the single source of truth; removed the unused
  `PulseHostAssignment` model (no migration from that unused collection).
- Linking checks the session provider and stored User email. A conditional
  assignment update and `host.linked` audit commit in one transaction. Concurrent
  calls link once; an audit failure rolls back the update.
- Lazy authorization links before reading the quiz. The auth hook imports the
  auth-independent linker, preventing the previous circular import.
- Pulse errors retain CCW's `AppResult` JSON envelope and have explicit HTTP
  mappings. Admin authorization is strict Admin, not Head.
- Existing CCW approval, access, roles, and sign-up restrictions remain intact.

## Local evidence (2026-10-03)

67 focused tests passed: 44 model/utility tests and 23 MongoDB integration tests.
The database checks used an isolated MongoDB 8.3 replica set on localhost and
the existing test helpers' unique `ccw-test-*` database names. Coverage includes
room-code collision retry, audit validation, pending owners, owner/co-host/admin
authorization, concurrent linking, same-request fallback, provider/email
restrictions, unchanged member roles, owner replacement prevention, and audit
rollback. `git diff --check` also passed.

These are limited checks, not the repository's full CI result. This checkout has
no installed locked dependencies. Downloads from the npm registry fail with
`EACCES`. The focused checks used existing local packages through a temporary
configuration outside the repository: Mongoose 6.7.0, MongoDB driver 4.11.0,
Next 14.2.15, Zod 4 shipped within 3.25.76, and Vitest 5.0.3. Production versions
remain unchanged in `package.json` and `pnpm-lock.yaml`.

The additional first-sign-in tests in `auth-identities.test.ts` were written but
could not run without Better Auth and the remaining locked dependencies.
Full lint, typecheck, coverage, and production build still require `pnpm install`
and `pnpm test:ci` in a working development environment. No full-build or full-CI
pass is claimed.

## Compatibility and next work

Existing quizzes with an owner ID remain valid. New email-owned quizzes may have
a null owner ID, so future APIs/pages must handle pending owners. Guest defaults
change only for newly created drafts; existing records are not rewritten. The
linker uses the project's documented replica-set requirement and never falls
back to a partially audited write on standalone MongoDB.

P1.3 management APIs and P1.4 pages/E2E/CI remain separate commits. No guests,
Pulse Pub/Sub, custom heartbeats, or realtime features were added here. An email
assignment does not provision a new CCW account; existing account approval is
still required before sign-in.
