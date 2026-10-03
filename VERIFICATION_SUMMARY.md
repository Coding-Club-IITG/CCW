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

P1.3 management APIs are documented below; P1.4 pages/E2E/CI remain separate work. No guests,
Pulse Pub/Sub, custom heartbeats, or realtime features were added here. An email
assignment does not provision a new CCW account; existing account approval is
still required before sign-in.

## P1.3 management APIs (second commit)

- Admin-only create/list/detail and co-host routes under `/api/admin/pulse`.
- Host list/detail and co-host routes under `/api/pulse/host`; the host list
  matches `ownerId` / `coHostIds` only after lazy linking.
- Strict schemas reject invalid emails, extra ownership fields, malformed JSON,
  and invalid query parameters. Writes require a configured trusted Origin.
- Explicit DTOs exclude slides, answer content, settings, locks, raw assignment
  metadata, and unrelated User fields.
- Owners and admins add/remove co-hosts; co-hosts add only. Admin permissions
  take precedence even when the admin is also a co-host. The transaction re-reads
  membership before making the change.
- Owner removal/addition as co-host, known user duplicates after email changes,
  and concurrent duplicate assignments are rejected. Removing a linked co-host
  also removes their ID and prevents lazy re-linking of that removed assignment.
- Quiz creation and all assignment changes commit with their audit events.
  Audit failure rolls back creation, additions, or removals.
- Host access now requires Microsoft IITG authentication even for already-linked
  IDs; strict CCW Admin access remains valid on admin management operations.

The combined focused run passed **78 tests across 8 files**, including 11 new
route integration tests against the isolated MongoDB replica set. A targeted
TypeScript 5.9.3 check of the new production modules/routes also passed using the
same older local dependencies and a stand-in for Better Auth's session type.
This does not replace typechecking against the locked production libraries.

Normal `pnpm typecheck`, `pnpm lint`, and `pnpm build` were attempted but could
not start because `tsc`, `eslint`, and `next` are not installed in this checkout.
Full CI, coverage, and the Better Auth first-sign-in tests remain unverified until
the locked dependencies can be installed. The product dependency files were not
changed. P1.4 UI, browser E2E, and Pulse CI wiring are next.
