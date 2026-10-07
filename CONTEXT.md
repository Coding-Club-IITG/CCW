# CCW Project Context

> Keep this document current. Update it in the same change whenever its product,
> architecture, or deployment information becomes outdated.

## Product

CCW is Coding Club IIT Guwahati's public website and authenticated internal
workspace. It supports the club's public presence, member tools, competitive
programming systems, content, administration, and background integrations.

## Major Features

- **Public content:** Blogs, events, projects, club team information and privacy policy.
- **Member workspace:** A dashboard, member profiles, shared files, and
  notifications, plus an internal calendar for general and module events.
- **File sharing:** Sharing groups with live membership and individual
  Share dialogs for access and download permissions.
- **Competitive programming:** Platform profiles, contest rooms and
  tournaments, Problem of the Day (POTD), leaderboards, and solving tools.
- **Collaboration:** Hackathons, participant teams, and related member
  workflows.
- **Browser notifications:** Opt-in Web Push on supported desktop and mobile
  browsers.
- **Administration:** Management surfaces for users, content, events, projects,
  notifications, hackathons, contests, and recruitment.

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
  request schemas, and upload boundaries
- `src/lib/auth`: server and browser authentication clients, identity policies,
  session authorization, identity storage, and login switching
- `src/lib/users`: member queries, role parsing, identity display, social links,
  and user cooldowns
- `src/lib/db`, `src/lib/cache`, `src/lib/queues`: database connections,
  Redis caching, and shared BullMQ connection configuration
- `src/lib/calendar`, `src/lib/events`: calendar schedules and iCalendar feeds,
  public event dates, status, and listings
- `src/lib/files`: shared file-access contracts, normalization, and audited
  sharing-group operations
- `src/lib/contests`: contest runtime schemas, client DTOs, bracket domain
  logic, queues, workers, and realtime event publishers
- `src/lib/codeRunner`: browser code execution, runtime workers, and their types
- `src/lib/env`: standalone dotenv loading, pure Zod runtime schemas, and
  process-specific validated exports
- `src/lib/jobs`: Agenda setup, scheduled job implementations, and their shared
  schedule configuration
- `src/lib/notifications`: notification creation and Web Push configuration,
  browser subscriptions, queueing, delivery, and its worker
- `src/lib/platforms`: Competitive Programming platform integration adapters
  and shared coordination
- `src/lib/blog`, `src/lib/credits`, `src/lib/potd`, `src/lib/recruitment`:
  feature-specific domain logic and data contracts
- `src/lib/atlas`: command catalog and permission-aware search
- `src/lib/audit`: audit transactions, types, and bounded summaries
- `src/lib/media`, `src/lib/markdown`, `src/lib/seo`: image helpers,
  Markdown editing, and page metadata
- `src/lib/shared`: cross-feature dates, pagination, search, slugs, and tags
- `src/lib/stores`: browser UI state stores
- `src/lib/telemetry`: shared logging and web/worker telemetry
  including public-page collection and pseudonymous visitor metrics
- `src/lib/constants.ts`: shared constants, enums, display maps, and URL patterns
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
  profiles. Worker requires MongoDB & Redis, but not web-only credentials.
  Standalone entry points import `src/lib/env/load.ts` to load dotenv.
- MongoDB is the persistent application store.
- Production uploads use a private Standard R2 bucket (`ccw-uploads`) through the
  official S3 SDK. Local development defaults to the existing upload directories.
  `src/lib/files/storage.ts` owns writes, metadata, streamed/range reads, deletes,
  and paginated listing.
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
Parsing and display formatting for role data live in `src/lib/users/roles.ts`.

Each user has one permission level in `access` (`Member`, `Core Team`, `Head`, or
`Admin`), one `YYYY-YY` academic year in `tenure`, and independent stored
club/module `roles`. Head and Core Team require at least one current module in
`managedModules`. `isElevated()` authorizes Core Team, Head and Admin.
`isHead()` authorizes Head and Admin. `isAdmin()` authorizes Admin only.

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

Pull requests normally target `dev`.
The live website is deployed from `prod`.
After the maintainers consider `dev` stable, it is promoted to `prod`.

If this document and the implementation disagree, stop and ask a maintainer
which behavior is intended before proceeding.
