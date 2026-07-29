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
  notifications.
- **Competitive programming:** Platform profiles, contest rooms and
  tournaments, Problem of the Day (POTD), leaderboards, and solving tools.
- **Collaboration:** Hackathons, participant teams, and related member
  workflows.
- **Administration:** Management surfaces for users, content, events, projects,
  notifications, hackathons, and contests.

## Stack

- Next.js 16 App Router, React 19, and strict TypeScript
- SCSS Modules and shared CSS variables
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
- `src/lib/actions`: server actions
- `src/lib`: authentication, authorization, integrations, jobs, queues, caching,
  and shared utilities
- `src/models`: Mongoose models
- `src/styles`: global theme variables and reusable SCSS mixins
- `src/worker.ts`: standalone Agenda and BullMQ worker entry point
- `src/proxy.ts`: public/internal route protection and signed-in redirects

## Runtime Boundaries

- Server Components are the default rendering boundary.
- Client Components provide focused browser-side interaction.
- Server actions and API routes perform data access, authentication,
  authorization, and input validation.
- MongoDB is the persistent application store.
- Redis supports runtime coordination, caching, and queued contest work.
- The standalone worker runs scheduled synchronization, reminder, cleanup, and
  contest-processing jobs.
- Platform integrations currently include Codeforces and AtCoder, with contest
  aggregation also covering other competitive-programming platforms.

## Authentication and Access

Authentication uses better-auth with Microsoft accounts. Public pages are
available without a session; internal and administrative pages are protected by
`src/proxy.ts`. Authorization is operation-specific and uses the role helpers in
`src/lib/roles.ts` and resource-specific access helpers where applicable.

`moduleRoles` may arrive from better-auth as a JSON string even though
application code consumes an array. Use `parseModuleRoles()` from
`src/lib/roles.ts` at that boundary.

Route protection belongs in `src/proxy.ts`; this project does not use
`middleware.ts`.

## Database Notes

The configured MongoDB deployment uses a replica set. Confirm replica-set
availability before choosing a transaction-based implementation.

## Branches and Deployment

Pull requests normally target `dev`. The live website is deployed from `prod`
through `.github/workflows/deploy.yml`. After the maintainers consider `dev`
stable, it is promoted to `prod`.

If this document and the implementation disagree, stop and ask a maintainer
which behavior is intended before proceeding.
