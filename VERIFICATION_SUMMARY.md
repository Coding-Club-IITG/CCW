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
  mappings. Pulse administrator authorization uses CCW's existing Head/Admin check.
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

- CCW Head/Admin-only create/list/detail and co-host routes under `/api/admin/pulse`.
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
  IDs; CCW Head/Admin access remains valid on admin management operations.

At the P1.3 commit, the combined focused run passed **78 tests across 8 files**, including 11 new
route integration tests against the isolated MongoDB replica set. A targeted
TypeScript 5.9.3 check of the new production modules/routes also passed using the
same older local dependencies and a stand-in for Better Auth's session type.
This does not replace typechecking against the locked production libraries.

Normal `pnpm typecheck`, `pnpm lint`, and `pnpm build` were attempted but could
not start because `tsc`, `eslint`, and `next` are not installed in this checkout.
Full CI, coverage, and the Better Auth first-sign-in tests remain unverified until
the locked dependencies can be installed. The product dependency files were not
changed. P1.4 UI, browser E2E, and Pulse CI wiring are next.

## Maintainer clarification before P1.4

Pulse administrators are CCW Heads (and existing Admins), matching the existing
admin area's `isHead` policy. A Head creates each draft and assigns its owner
by IITG email. The assigned host prepares questions in that draft; regular
hosts cannot create quiz records themselves. Display names are not identities
or permission keys. Existing CCW account approval is still required for sign-in.

The Pulse guards now reuse `isHead` without modifying CCW roles, access, or
managed module scopes. Updated authorization/route tests passed **28 affected
tests**, including a Head administration test that verifies their stored CCW
permissions remain unchanged. The targeted offline TypeScript check passed
again. These corrections and the feature-branch guidance are pending inclusion
in the P1.1-P1.3 backend pull request on `pulse-phase-1`, targeting `pulse`.
P1.4 pages, browser E2E tests, and CI updates will follow in a separate pull
request after the backend pull request is merged.

# Pulse Phase 2 (issue #73) verification

Run on 2026-10-17 against a local MongoDB replica set (Docker, `rs0`), with the
locked dependencies. `package.json` and the lockfile are unchanged.

## What ran

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test:ci` (lint, typecheck, unit and integration tests, coverage, build):
  passed. 102 test files, 758 tests; coverage (all files) 91.43% statements,
  86.01% branches, 96.37% functions, 93.58% lines, with the configured thresholds met.
  This includes the production `next build`.
- New and changed Pulse tests: shared deck/config schemas, pure deck operations,
  the draft store and dirty flag, the lock state machine, the navigation guard, and
  MongoDB integration tests for the editor lock, deck save, configuration copy and
  the Definition of Done flow (`tests/integration/pulse-dod.test.ts`). No Redis is
  used or needed by any of them.
- Two Phase 1 tests in `tests/integration/auth-identities.test.ts` ("links Pulse
  assignments only after a verified first microsoft/google sign-in") were already
  failing on `origin/pulse`: their user fixture lacked `name` and `emailVerified`, so
  the sign-in was rejected. The fixture now matches the other tests in that file;
  no production auth code changed.

## What did not run

- No component tests: the repository has no jsdom or testing-library setup.
- No browser E2E: there is no Playwright configuration in the repository.
- The editor UI has not been exercised in a browser. The manual two-browser checklist
  in the pull request is pending local Azure dev credentials.
- At the time of this run, Back-button handling was not implemented; only in-app
  link clicks and the browser's `beforeunload` prompt were guarded. See the
  Issue 2.4 update below for the subsequent history guard.

## Compatibility notes

- New fields: `PulseQuiz.deckVersion` (default 0; missing on Phase 1 documents, read
  as 0) and `PulseQuiz.editorLock.token`. Slides keep the existing
  `{ slideId, order, type, content }` shape.
- Q&A slides are out of scope: `qa` is no longer an allowed slide type. Phase 1 had
  no API that wrote slides, so none are expected in real data. If one existed, the
  editor refuses to open or overwrite that deck (`CONFLICT`) and leaves it untouched;
  a plain Mongoose `save()` of such a document would fail enum validation.
- New audit event type `deck.saved`. No new error codes: `CONFLICT` for a held or lost
  lock, a stale deck or an opened lobby, and `SERVICE_UNAVAILABLE` for a failed save.
- `POST /api/admin/pulse` accepts an optional `copyConfigFrom` quiz ID.

# Pulse Issue 2.4 update (2026-10-19)

Scope: Info and MCQ slide ordering, duplication, explicit save and draft protection.
The existing deck helpers, draft store and save API already implement ordering,
independent duplicates, validation and saved/draft separation; those are reused.
No new dependencies, autosave, guests, Q&A, Redis Pub/Sub or heartbeats were added.

## Changes

- Same-document Back/Forward requests now use the existing Stay/Leave dialog.
  Stay cancels the request; Leave resumes its original history entry instead of
  pushing another entry. Repeated requests share one confirmation. Failed
  traversals, or traversals that leave the editor mounted, keep edits protected.
- Reload latest asks before replacing an unsaved draft. Editing and Save are
  disabled during the reload so fresh edits cannot be overwritten by its result.
- A MongoDB integration test exercises reorder, duplicate, edit the copy, Save
  and reopen, checking unique IDs, unchanged original content and persisted order.

## Checks and limits

- Focused Vitest run: **71/71 tests passed** across `deck.test.ts`,
  `deckEditorStore.test.ts`, `navigationGuard.test.ts` and
  `tests/integration/pulse-deck.test.ts`, using an isolated local test database.
- `pnpm typecheck`: passed.
- ESLint on the changed TypeScript/TSX files: passed.
- These are controller, store and API tests, not browser interaction tests. The
  user subsequently confirmed that the guided Brave editor check works.
  This is manual confirmation, not an automated browser test; the conflict
  reload dialog and older-browser behavior have not been separately confirmed.
  Full CI stage results from the subsequent run are recorded below.
- Back/Forward confirmation requires the browser's Navigation API and a
  cancelable same-document navigation. Older browsers retain the existing link
  and reload/close guards; their same-document history navigation is unguarded.
  Cross-document exits use the browser's native unload confirmation. Browsers
  may also make a traversal noncancelable, in which case it cannot be blocked.

## Full local CI stage rerun (2026-10-19)

All five stages from the repository CI workflow passed locally on Windows:

- Full repository ESLint and TypeScript checks: passed.
- Unit and integration tests: **801/801 passed across 103 files**.
- V8 coverage run: **801/801 passed**; configured coverage thresholds met.
  Statements 91.43%, branches 86.01%, functions 96.37%, lines 93.58%.
  The coverage include list is unchanged and does not measure every source file.
- Production `next build`: passed, including the Pulse host/editor routes.

The installed executables were invoked directly with CI test credentials and
isolated local MongoDB/Redis endpoints. The initial pnpm script attempt triggered
a failed automatic install; the locked dependencies were restored from the
existing workspace cache without changing dependency files.

The first full test run passed 800/801; the POTD unauthenticated-access test hit
its five-second timeout. A repeat of the full suite passed without changing
tests or timeouts. The first build failed after the native local MongoDB process
crashed. MongoDB was restarted with a 0.25 GB development cache; the build then
passed with two page-generation workers (`CIRCLE_NODE_TOTAL=3`). These are local
runtime adjustments, not product configuration changes. The development server
and worker were restarted and remain available for manual Brave checks.

Browser automation stopped because the Windows tool could not enforce browser
URL policy. The user then followed the manual Brave checklist and reported that
it works. This user-reported result is separate from the automated CI results.
