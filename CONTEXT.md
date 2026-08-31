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
  notifications, hackathons, and contests.

## Stack

- Next.js 16 App Router, React 19, and strict TypeScript
- SCSS Modules and shared CSS variables
- Hanken Grotesk for text, JetBrains Mono for labels and metadata,
  and Handjet for display type
- MongoDB with Mongoose and the better-auth MongoDB adapter
- Redis for shared runtime state, caching, and queue support
- Agenda and BullMQ background processing
- Microsoft authentication through better-auth
- pnpm for package management and PM2 in production

## Repository Map

- `src/app/(public)`: public pages such as blogs, events, projects, and team
  information
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
  profiles. Web requires MongoDB, Redis, authentication, trusted origins, and
  Microsoft credentials. Worker requires MongoDB and Redis, but not web-only
  credentials or upload settings. Standalone entry points load dotenv before
  importing their validated profile.
- MongoDB is the persistent application store.
- Redis supports runtime coordination, caching, and queued contest work,
  including best-effort Web Push delivery through BullMQ.
- The standalone worker runs scheduled synchronization, reminder, cleanup, and
  contest-processing jobs.
- Internal calendar events are the scheduling source of truth. Public event
  drafts and publications are linked one-to-one to calendar records.
  The linked calendar location is displayed publicly, while its external
  URL, agenda, minutes, and reminders remain internal.
- Public discovery is server rendered. The blog listing renders its current
  archive page and article links on the server, while focused search, tag, and
  pagination interactions hydrate on the client.
- Atlas is the global command-and-search surface, opened from the navbar
  or with Ctrl/Cmd+K outside editable controls. Anonymous searches include
  public content, while signed-in searches can include every internal
  record already permitted by the existing resource policies.
- Public blog, event, and project images store normalized focal points for
  consistent responsive card crops. Detail-page images retain their natural
  aspect ratio.
- Open Graph covers are generated per request by `src/app/api/og/route.tsx` from
  `?kicker=`, `?title=` and `?meta=`.
- Platform integrations currently include Codeforces and AtCoder, with contest
  aggregation also covering other competitive-programming platforms.
- `@ronits2407/cp-api` owns CP Platform HTTP requests, retries,
  process-local rate limiting, parsing, and its in-memory L1 cache.
  CCW keeps Redis-backed user/cron locks, interactive Codeforces
  request coordination, and shared L2 metadata caches.

## Authentication and Access

Authentication uses better-auth with Microsoft accounts. Public pages are
available without a session; internal and administrative pages are protected by
`src/proxy.ts`. Authorization policies live in `src/lib/access`; parsing and
display formatting for role data live in `src/lib/roles.ts`.

Each user has one permission level in `access` (`Member`, `Head`, or `Admin`),
one `YYYY-YY` academic year in `tenure`, Head-only scope in `managedModules`,
and an independent `roles` array of club or module positions.
`isHead()` authorizes Head and Admin; `isAdmin()` authorizes Admin only.
Better-auth can expose `managedModules` and `roles` as JSON strings, so use
`parseManagedModules()` and `parseRoles()` at that boundary.

Route protection belongs in `src/proxy.ts`; this project does not use
`middleware.ts`.

## Database Notes

The configured MongoDB deployment uses a replica set. Confirm replica-set
availability before choosing a transaction-based implementation.

Each completed privileged user intent is stored with a bounded, resource-specific
before/after summary in Audit log, which operates in a fail-closed manner.

## Branches and Deployment

Pull requests normally target `dev`. The live website is deployed from `prod`
through `.github/workflows/deploy.yml`. After the maintainers consider `dev`
stable, it is promoted to `prod`.

If this document and the implementation disagree, stop and ask a maintainer
which behavior is intended before proceeding.
