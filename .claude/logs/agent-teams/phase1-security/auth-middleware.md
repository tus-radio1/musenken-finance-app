# Work Log: auth-middleware

## Summary
Created Next.js middleware for Supabase session refresh and route protection, and added server-side auth redirects to all pages that were missing them.

## Tasks Completed
- [x] Task #1: Created `middleware.ts` with session refresh, public route exclusions, and auth-based redirects
- [x] Task #2: Added `redirect('/login')` auth checks to pages that were missing them (applications, subsidies, budget, ledger)

## Files Modified
- `middleware.ts` (new): Supabase SSR session refresh on every request; unauthenticated users on protected routes redirect to `/login`; authenticated users on `/login` redirect to `/`; excludes `/login`, `/api/*`, `/_next/*`, static assets
- `app/applications/page.tsx`: Changed `return null` to `redirect('/login')` when user is not authenticated; added `redirect` import
- `app/subsidies/page.tsx`: Changed `return null` to `redirect('/login')` when user is not authenticated; added `redirect` import
- `app/budget/page.tsx`: Added `if (!user) redirect('/login')` check before role-based logic; added `redirect` import
- `app/ledger/page.tsx`: Added `if (!user) redirect('/login')` check before team data fetching; added `redirect` import

## Files NOT Modified (already had auth redirects)
- `app/members/page.tsx`: Already had `if (!user) redirect("/login")`
- `app/settings/page.tsx`: Already had `if (!user) redirect("/login")`

## Key Decisions
- Used `@supabase/ssr` `createServerClient` with `getAll`/`setAll` cookie methods in middleware (recommended pattern for Next.js 15+/16)
- Kept the middleware matcher pattern to exclude static files and image optimization paths for performance
- Did not remove now-redundant `if (user)` wrappers in budget/ledger pages — those are harmless and removing them is a refactor beyond scope

## Issues Encountered
- None
