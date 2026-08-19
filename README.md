# Coding Club IITG Website

The official web platform for Coding Club IITG.

## Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Authentication:** [Auth.js v5](https://authjs.dev/) (Microsoft Entra ID)
- **Database:** [MongoDB](https://www.mongodb.com/) with [Mongoose](https://mongoosejs.com/)
- **Caching:** [Redis](https://redis.io/)
- **Styling:** SCSS Modules
- **State Management:** Zustand

## Prerequisites

- **Node.js:** v24.15.0+
- **Package Manager:** [pnpm](https://pnpm.io/)
- **MongoDB:** A running instance or MongoDB Atlas URI
- **Redis:** A running instance (local or cloud)

## Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in the required values.

Runtime configuration is validated independently for web, worker, CLI, test,
and browser processes. Keep browser values under `NEXT_PUBLIC_*`.

## Docker Setup

You can use Docker Compose to start the required services (MongoDB and Redis):

```bash
docker compose up -d
```

Tests use `MONGODB_TEST_URI` to create isolated `ccw-test-*` databases.

## Getting Started

1. **Install dependencies:**
   ```bash
   pnpm install
   ```
2. **Prepare account:**
   Add your user details to [`seed.ts`](./scripts/seed.ts) and run `pnpm seed`

3. **Run in development mode:**
   ```bash
   pnpm dev
   ```
4. **Run on server:**
   ```bash
   pnpm run build
   pm2 start ecosystem.config.js
   ```

## Contributing

Before contributing, read:

- [Contributing guidelines](./CONTRIBUTING.md)
- [Project context](./CONTEXT.md)
