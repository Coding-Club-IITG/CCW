# CCW Project Context

> Keep this document current. Update it in the same change whenever its product,
> architecture, or deployment information becomes outdated.

## Product

CCW is Coding Club IIT Guwahati's public website and authenticated internal
workspace. It supports the club's public presence, member tools, competitive
programming systems, content, administration, and background integrations.

## Major Features

- **Public content:** Blogs, events, projects, and club team information.
- **Member workspace:** A dashboard, member profiles, shared files, and
  notifications, plus an internal calendar for general and module events.
- **Competitive programming:** Platform profiles, contest rooms and
  tournaments, Problem of the Day (POTD), leaderboards, and solving tools.
- **Collaboration:** Hackathons, participant teams, and related member
  workflows.
- **Browser notifications:** Opt-in Web Push on supported desktop and mobile
  browsers.
- **Administration:** Management surfaces for users, content, events, projects,
  notifications, hackathons, contests, and recruitment.
- **Pulse:** Live, host-run quizzes joined by room code. Durable quiz data
  lives in MongoDB (`PulseQuiz`, `PulseAuditEvent`); live session state is
  planned for Redis. Phase 1 currently contains the data models, host
  authorization/linking helpers, and audited management APIs; pages are next.

## Stack

- Next.js 16 App Router, React 19, and strict TypeScript
- SCSS Modules and shared CSS variables
- Hanken Grotesk for text, JetBrains Mono for labels and metadata,
  and Handjet for display type
- MongoDB with Mongoose and the better-auth MongoDB adapter
- Redis for shared runtime state, caching, and queue support
- Agenda and BullMQ background processing
- Microsoft institute and Google authentication through better-auth
- pnpm for package management and PM2 in production

## Repository Map

- `src/app/(public)`: public pages such as blogs, events, projects, team
  information and recruitment
- `src/app/(protected)`: authenticated internal and administrative pages
- `src/app/api`: API route handlers
- `src/components`: feature and shared React components
- `src/lib`: authentication, authorization, integrations, jobs, queues, caching,
  and shared utilities
- `src/lib/actions`: server actions and their strict exception boundary
- `src/lib/access`: role and resource-specific authorization policies
- `src/lib/api`: shared API/action contracts, HTTP response helpers,
  session authorization, request schemas, and upload boundaries
- `src/lib/contests`: contest runtime schemas, client DTOs, bracket domain
  logic, queues, and realtime event publishers
- `src/lib/env`: pure Zod runtime schemas and process-specific validated exports
- `src/lib/jobs`: Agenda setup, scheduled job implementations, and their shared
  schedule configuration
- `src/lib/pulse`: Pulse live-quiz constants, room-code generation, and audit
  helpers, draft schemas, and atomic host-assignment linking
- `src/lib/platforms`: Competitive Programming platform integration adapters
  and shared coordination
- `src/models`: Mongoose models
- `src/styles`: global theme variables and reusable SCSS mixins
- `src/worker.ts`: standalone Agenda and BullMQ worker entry point
- `src/proxy.ts`: public/internal route protection and signed-in redirects

## Runtime Boundaries

- Server Components are the default rendering boundary.
- Client Components provide focused browser-side interaction.
- Server actions and API routes perform data access, authentication,
  authorization, and input validation.
- JSON APIs and exported server actions use `AppResult<T>`: successful values
  are `{ ok: true, data }`; failures are `{ ok: false, error: { code, message,
fields?, requestId? } }`. HTTP routes derive their status from the stable
  error code. Better Auth, successful SSE streams, binary asset responses,
  redirects, and metadata retain their framework/library transport formats.
- Runtime configuration has separate web, worker, CLI, test, and browser
  profiles. Worker requires MongoDB and Redis, but not web-only
  credentials or upload settings. Standalone entry points load dotenv
  before importing their validated profile.
- MongoDB is the persistent application store.
- Redis supports runtime coordination, caching, and queued contest work,
  including best-effort Web Push delivery through BullMQ.
- The standalone worker runs scheduled synchronization, reminder, cleanup, and
  contest-processing jobs.
- Internal calendar events are the scheduling source of truth. Public event
  drafts and publications are linked one-to-one to calendar records.
  The linked calendar location is displayed publicly, while its external
  URL, agenda, minutes, and reminders remain internal.
- Public discovery is server rendered and URL-driven. Blog and event filters,
  sorting, pagination and the archive window all live in the query string, so
  every state is server rendered, shareable and crawlable; only the controls
  themselves hydrate.
- Internal pending and failure states are file-based. Each route archetype has
  its own `loading.tsx` skeleton whose header renders for real,
  and `(protected)` owns one `error.tsx` and one `not-found.tsx`.
- Theme-dependent rendering must be done in CSS keyed off `[data-theme]`, not by
  branching on the theme store. The store reads a cookie that is unavailable
  during server rendering, so a JavaScript branch desynchronises hydration.
- Atlas is the global command-and-search surface, opened from the navbar
  or with Ctrl/Cmd+K outside editable controls. Anonymous searches include
  public content, while signed-in searches can include every internal
  record already permitted by the existing resource policies.
- Public blog, event, and project images store normalized focal points for
  consistent responsive crops. Event cards and quick views use 4:5, while blog
  listings and project covers use 16:10. Detail-page images retain their
  natural aspect ratio.
- Open Graph covers are generated per request by `src/app/api/og/route.tsx` from
  `?kicker=`, `?title=` and `?meta=`.
- Platform integrations currently include Codeforces and AtCoder, with contest
  aggregation also covering other competitive-programming platforms.
- `@ronits2407/cp-api` owns CP Platform HTTP requests, retries,
  process-local rate limiting, parsing, and its in-memory L1 cache.
  CCW keeps Redis-backed user/cron locks, interactive Codeforces
  request coordination, and shared L2 metadata caches.

## Authentication and Access

Authentication uses better-auth with one approved identity per user: Microsoft
for `@iitg.ac.in` within the institute tenant, or verified Google `@gmail.com`.
Institute users can verify Google in their profile and submit a switch request.
Public pages are available without a session, while internal and administrative
pages are protected by `src/proxy.ts`. Authorization policies live in `src/lib/access`.
Parsing and display formatting for role data live in `src/lib/roles.ts`.

Each user has one permission level in `access` (`Member`, `Head`, or `Admin`),
one `YYYY-YY` academic year in `tenure`, Head-only scope in `managedModules`,
and an independent `roles` array of club or module positions.
`isHead()` authorizes Head and Admin; `isAdmin()` authorizes Admin only.
Better-auth can expose `managedModules` and `roles` as JSON strings, so use
`parseManagedModules()` and `parseRoles()` at that boundary.

Route protection belongs in `src/proxy.ts`; this project does not use
`middleware.ts`.

Pulse host assignments live inside `PulseQuiz`. A pending owner has one owner
email assignment and a null `ownerId`; an existing quiz with only an `ownerId`
continues to work. Verified Microsoft institute sign-ins bind pending assignments
to the approved User identity, update host IDs, and write `host.linked` in one
MongoDB transaction. The lazy Pulse guard retries linking before reading the quiz
and fails closed on persistence errors. Google, development, and unstamped
sessions do not bind assignments. Binding never changes CCW access or roles;
existing approved-user sign-in restrictions remain in force.

Heads create each quiz draft and assign its owner by IITG email. The assigned
host prepares questions in that draft; assignment does not grant permission to
create new quiz records. Names are display information, while verified email
and the linked User ID establish the host's identity.

Host quiz reads and lists also require a Microsoft institute session after an
assignment is linked. Pulse admin capabilities take precedence when a CCW
Head/Admin is also assigned as a co-host. Admin and host management writes re-read quiz membership
inside their transaction; co-hosts can add only, while owners and admins can
add/remove. The owner identity is permanent. Duplicate emails and known users
already assigned to the quiz are rejected.

Pulse management APIs are `/api/admin/pulse` (GET list, POST create),
`/api/admin/pulse/[quizId]` (GET detail), `/api/pulse/host` (GET own list),
and `/api/pulse/host/[quizId]` (GET own detail). Both detail routes have
`/cohosts` (POST add, DELETE remove with an email JSON body). Lists support
`page`, `limit`, and `status`. Every route uses Pulse guards, a no-store JSON
boundary, and explicit management DTOs; writes require an allowed Origin.
Quiz creation and assignment changes are audited in MongoDB transactions.

Pulse guards use `PULSE_NOT_AUTHORIZED` (403), `PULSE_NOT_HOST` (403), and
`PULSE_QUIZ_NOT_FOUND` (404) within the shared `AppResult` envelope. Pulse
administration uses the existing CCW `isHead` check (Head or Admin), as clarified
by the maintainer. Regular members gain no Pulse administrator privileges.
Guest participation is deferred and new quizzes default to `allowGuests: false`.
The agreed initial realtime scope is one Socket.IO process with direct broadcasts;
Pulse Redis Pub/Sub and custom heartbeat logic are deferred. Existing CCW realtime
behavior is unchanged.

## Database Notes

The configured MongoDB deployment uses a replica set. Confirm replica-set
availability before choosing a transaction-based implementation.

Each completed privileged user intent is stored with a bounded, resource-specific
before/after summary in Audit log, which operates in a fail-closed manner.

## Branches and Deployment

Pull requests normally target `dev`. The live website is deployed from `prod`
through `.github/workflows/deploy.yml`. After the maintainers consider `dev`
stable, it is promoted to `prod`.

Pulse work in this checkout uses `pulse-phase-1`, branched from `pulse`.
Commit feature changes on `pulse-phase-1` and target `pulse` with the pull request.
The first pull request contains P1.1-P1.3 fixes and backend APIs. P1.4 pages,
browser E2E tests, and CI updates will use a separate branch from the updated
`pulse` after the first pull request is merged.

If this document and the implementation disagree, stop and ask a maintainer
which behavior is intended before proceeding.
