# Musenken Finance App

A club finance application built with Next.js and Supabase. It manages budgets,
subsidy applications, transactions, receipts, and club-wide financial accounts.

## Prerequisites

- Node.js 22
- Docker Desktop with WSL integration enabled (for local Supabase)
- The Supabase CLI, installed through the project dev dependency and invoked with
  `npm run` or `npx`

## Local setup

1. Install dependencies with `npm ci`.
2. Start the local Supabase stack with `npm run db:start`.
3. Copy the local API URL, anon key, and service-role key reported by
   `npm run db:status` into `.env.local`. Do not commit this file.
4. Start Next.js with `npm run dev`.

The local database applies all migrations and dummy seed data on
`npm run db:reset`. See the [local development manual](docs/manual/dev-environment/local-setup.md)
for the full setup, including the first administrator.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm test` | Run the Vitest suite. |
| `npm run build` | Create the production build. |
| `npm run db:start` / `db:stop` | Start or stop local Supabase. |
| `npm run db:reset` | Reapply migrations and dummy seed data locally. |
| `npm run db:status` | Show local Supabase endpoints and keys. |
| `npm run db:types` | Generate database types from local Supabase. |
| `npm run functions:serve` | Serve Supabase Edge Functions locally. |

## CI/CD

GitHub Actions validates the application and a fresh local Supabase database for
pull requests and pushes to `develop` and `main`. Database migrations and the
`update-fiscal-year` Edge Function deploy automatically from `develop` to
staging and from `main` to production through protected GitHub Environments.
Vercel continues to deploy the frontend through its Git integration.

See the [development environment manual](docs/manual/dev-environment/) for CI/CD
and staging setup instructions.
