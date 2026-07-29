# Contributing to CCW

## Before You Start

- Read [CONTEXT.md](./CONTEXT.md).
- Search the repository before adding a component, helper, type, constant,
  style, or icon. Reuse or extend an existing implementation where practical.
- Keep the change focused. Do not include unrelated refactors.
- Ask a maintainer before adding dependencies or changing architecture,
  database schemas, authentication, or authorization.
- If documentation and implementation disagree, stop and ask a maintainer.

## Code

- Use the `@/` alias for imports from `src/`. Group imports as external
  packages, `@/lib`, `@/models`, `@/components`, then relative imports.
- Use default exports for Mongoose models and named exports for actions,
  constants, and shared utilities.
- Use TypeScript domain types for inputs, outputs, and shared data. Avoid `any`
  except at unavoidable external-library boundaries.
- Put shared enums, literal unions, display maps, and URL patterns in
  `src/lib/constants.ts`. Do not create parallel definitions.
- Use existing repository helpers for roles, logging, caching, pagination,
  display names, dates, and other shared behavior when they fit the use case.
- Use `getDisplayName(name, pizzaCount)` for member-facing identity displays in
  most cases. Include `pizza_count` in the relevant query projection. Use a raw
  account name only when the feature intentionally requires it.
- Keep comments short, useful, and easy to understand. Do not restate obvious
  code.

## Next.js and Server Code

- Use Server Components by default. Add `"use client"` only for focused
  interactivity or browser APIs.
- Keep data access and authorization on the server.
- Every server action and API route must independently authenticate, authorize
  the requested operation, and validate all untrusted input.
- Do not rely on hidden UI controls or client-side validation for security.
- Return a consistent discriminated union from server actions:
  `{ success: true, data? } | { success: false, error }`.
- Return safe, human-readable errors to clients. Log useful diagnostic context
  with the shared logger without exposing internal exception details.
- Revalidate affected paths after mutations. Invalidate affected cache entries
  when cached data changes.
- Serialize Mongoose documents before passing them to Client Components.
- When using `populate()`, import every referenced Mongoose model so it is
  registered at runtime.
- Choose MongoDB transactions and failure-recovery strategies case by case,
  based on the importance of the operation and practical feasibility.

## UI and Styling

- Match the visual language and behavior of nearby UI. Preserve its typography,
  spacing, colors, radii, interaction states, responsiveness, and existing
  accessibility behavior.
- Ask before establishing a new repository-wide UI or design convention.
- Use SCSS Modules for component styles.
- Use existing CSS variables. Do not hardcode colors in module styles.
- Add new color variables to both light and dark themes.
- Reuse or extend shared components and mixins wherever practical.
- Reuse existing icons wherever possible.
- Lucide icons may be imported directly. Add new custom SVG icons to
  `src/components/shared/Icons.tsx` instead of embedding SVG markup in
  components.

## Data and Configuration

- Use pagination and caching when appropriate for the use case and feasible.
  Prefer the repository's shared helpers over local implementations.
- Store and exchange timestamps in UTC. Use IST for display and scheduling
  unless a feature explicitly requires another timezone.
- Use `pnpm` only. Do not generate npm or Yarn lockfiles.
- Update `.env.example` when configuration changes.
- Import `src/lib/env` before other application modules in standalone entry
  points so environment variables are loaded before dependent modules execute.
- Never commit credentials, production secrets, local `.env*` files, or
  sensitive user data.
- Document rollout and compatibility effects when changing schemas,
  environment variables, cache keys, background-job contracts, or API
  responses. Provide a migration or safe fallback where needed.

## Documentation and Verification

- Update relevant documentation in the same change when setup, architecture,
  behavior, configuration, or contributor conventions change.
- Verify every changed behavior locally.
- Run `pnpm build` and resolve all build errors before submitting.
- Maintainers may require a post in the website's existing blog system for a
  larger fix or feature.

## Git and Pull Requests

- Normally branch from and target `dev`. Target another branch only when a
  maintainer explicitly requests it.
- `prod` contains the deployed website and is derived from `dev` after changes
  are considered stable.
- Follow the [Conventional Commits](https://www.conventionalcommits.org/)
  specification.
- Prefer descriptive branch names such as `feature/<short-name>`,
  `fix/<short-name>`, `docs/<short-name>`, or `refactor/<short-name>`.
- Pull requests should include:
  - a clear summary and motivation;
  - the local verification performed;
  - relevant screenshots for UI changes;
  - configuration, migration, and compatibility notes; and
  - linked issues when applicable.
