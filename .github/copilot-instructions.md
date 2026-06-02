# Coding Practices for CCW

<!-- MAINTENANCE: Update this file when adding/removing models, components, routes, jobs, or changing architectural patterns. Keep it focused on conventions, patterns, and gotchas - not exhaustive inventories (read the source for those). -->

**CCW** (Coding Club Website) is the public-facing website and member workspace for Coding Club IIT Guwahati. It serves both as the club's public presence and as an authenticated internal platform for members.

---

## 1. Project Stack

- **Next.js 16** (App Router) + **TypeScript** (strict, `@/*` → `./src/*`)
- **React 19** (Server Components by default)
- **MongoDB** via Mongoose 9 (replica set required for transactions)
- **Redis 6** for caching + Agenda pub-sub
- **Agenda 6** for background jobs (Mongo backend + Redis notifications)
- **better-auth** with Microsoft Azure AD (IITG institutional accounts only)
- **Axios** for HTTP, **lucide-react** for icons, **Zustand** for client state
- **SCSS Modules** + CSS variables (dark theme default)
- **react-markdown** + remark-gfm + rehype-highlight for blog content
- **pnpm** as package manager, **PM2** for production, CI deploys on push to `prod`

---

## 2. Core Conventions

### Constants First

All enums, type literals, display maps, and URL patterns live in `src/lib/constants.ts`. Use `as const` arrays with derived union types. Never duplicate in components or models.

### CSS Variables Only

Colors defined in `src/styles/colors.scss` (dark default on `:root`, light on `[data-theme="light"]`). **Never hardcode hex/rgba in `.module.scss`. Never use inline styles.** Add new variables to both themes.

### CSS Modules

- `.module.scss` files only - no global classes or CSS-in-JS.
- Import mixins: `@use "@/styles/mixins" as *;`
- Semantic camelCase class names (`.featureCard`, `.sidebarNav`)
- Tokens: `border-radius: 12px` cards / `6px` badges, `0.15s ease` transitions, `rem` spacing
- Available mixins in `_mixins.scss`: `table-base`, `modal-overlay`/`modal-dialog`, `badge-pill`, `btn-primary`/`btn-secondary`, `card`, `underline-tabs`/`underline-tab`/`underline-tab-active`, `sidebar-*`, `blog-prose`, `blog-card`/`blog-tag`

### Types from Constants

Shared types defined in `src/lib/constants.ts`. Models re-export them. Never define parallel types.

### Display Names

Always use `getDisplayName(name, pizzaCount)` from `src/lib/utils.ts` - never render `user.name` directly. Include `pizza_count` in DB projections.

### Reuse Components

Check `src/components/shared/` (PlatformTabs, LinkCard, BackLink, Icons), `leaderboard/` (LeaderboardTable), `blog/` (BlogCard, TagBadge, MarkdownRenderer) before creating new UI.

### Client vs Server

Server components are default. Client components need `"use client"`. Keep client components small - push data fetching to server components/actions.

### Check Before Creating

Before writing any new component, style, constant, or utility, search the codebase for existing implementations. Prefer extending over duplicating.

---

## 3. Authentication & Roles

- **Server:** `auth.api.getSession({ headers: await headers() })` from `@/lib/auth`
- **Client:** `useSession()`, `signIn()`, `signOut()` from `@/lib/auth-client`
- **Route protection:** `src/proxy.ts` - redirects unauthed from `/internal/*`, `/admin/*` to `/`; logged-in on `/` → `/internal/dashboard`

**Role hierarchy** (`src/lib/roles.ts`):

- `Secretary / OC` → Global admins (full access)
- `Head` → Module-level admin (file upload, manage module files)
- `Core Team` → Can set POTD problems
- `Member` → Standard access (subject to per-resource ACLs)

**Key functions:** `isGlobalAdmin()`, `isAdmin()`, `canSetPOTD()`, `getHeadModules()`, `cleanUserRoles()`, `parseModuleRoles()`

**File access** (`src/lib/fileAccess.ts`): `canUploadFiles()`, `canManageFile()`, `canAccessFile()`, `buildAccessFilter()`

---

## 4. Server Actions Pattern

All in `src/lib/actions/` with `"use server"` directive.

```typescript
"use server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/utils";

export async function myAction(params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { success: false as const, error: "Unauthorized" };
  await dbConnect();
  try {
    // ...
    revalidatePath("/relevant/path");
    return { success: true as const, data: JSON.parse(JSON.stringify(result)) };
  } catch (err) {
    logger.error("myAction error:", err);
    return { success: false as const, error: "Human-readable message." };
  }
}
```

**Rules:** Discriminated union returns (`success: true/false as const`). `JSON.parse(JSON.stringify())` for Mongoose docs. Admin actions use `checkAdmin()`. Always `revalidatePath()` after mutations. Use `logger` (never bare `console.log`).

---

## 5. API Route Pattern

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  return NextResponse.json({ data });
}
```

Dynamic params via async `context.params` (Next.js 16). File streaming uses `export const runtime = "nodejs"`.

---

## 6. Background Jobs

Standalone worker (`src/worker.ts`) via Agenda. Jobs in `src/lib/jobs/`.

**Adding a job:** Create `src/lib/jobs/newJob.ts` → import in `worker.ts` → `agenda.define(...)` → `agenda.every(...)`.

**Current jobs:** `sync-cf-ratings` (6h), `sync-ac-ratings` (6h), `sync-contests` (3h), `sync-potd-submissions` (daily 2AM IST), `potd-reminders` (hourly), `hackathon-deadline-reminders` (hourly), `cleanup-blog-images` (weekly).

---

## 7. POTD System

- Time windows in IST: main (00:00-23:59:59) + grace (until 02:00 next day)
- Points: rating-based + streak bonus in main window; 50% in grace; 0 after
- Submission processing in MongoDB transactions (`src/lib/potd/submit.ts`)
- Statuses: `Pending` → `Accepted` / `Late` / `NotSolved`
- Admin can set problems up to 10 days ahead; no reuse allowed

---

## 8. Platform Integrations (`src/lib/platforms/`)

- **Codeforces:** REST API, batches up to 50 handles per request
- **AtCoder:** kenkoooo API + scraping, Redis-cached problems, 1s delay between requests
- **Contests:** Fetches CF + AtCoder + CodeChef + LeetCode via `Promise.allSettled`

---

## 9. Code Style

- **Imports:** `@/` alias. Group: external → `@/lib` → `@/models` → `@/components` → relative
- **Models:** `export default`. **Actions/Constants:** named exports
- **Dates:** IST via `IST_OFFSET_MS`. Display via `formatDate()` with `"en-IN"` locale
- **Logging:** `logger.info/warn/error/debug` from `@/lib/utils` (prefixed `[CCW]`)
- **DB:** `await dbConnect()` at start of any server function. `await getRedis()` for Redis
- **Env:** Import `./lib/env` first in standalone entry points. See `.env.example` for required vars
- **Validation:** Server-side validation with early returns; never trust client alone
- **Serialization:** `JSON.parse(JSON.stringify(...))` for Mongoose docs to client

---

## 10. Key Gotchas

1. **Mongoose model tree-shaking:** In actions using `populate()`, import all referenced models. Use `[Model].forEach(m => m?.init?.())` pattern.
2. **Transactions:** MongoDB uses replica set - use transactions where beneficial.
3. **Redis resilience:** Agenda Redis channel has error listeners; worker survives Redis blips via MongoDB polling fallback.
4. **`moduleRoles` type mismatch:** JSON string in better-auth session vs array in Mongoose - always use `parseModuleRoles()` from `src/lib/roles.ts`.
5. **File upload limit:** 50MB (`next.config.mjs` serverActions.bodySizeLimit).
6. **Theme:** Dark default. No SSR theme detection. Toggle writes `data-theme` attr + localStorage.
7. **No middleware.ts:** Route protection is `src/proxy.ts`, in newer versions of Next.js.
