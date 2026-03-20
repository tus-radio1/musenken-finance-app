# Work Log: Shared-Config-UUID

## Summary
Created `lib/system-config.ts` for centralized accounting user ID resolution, removed hardcoded UUIDs from `transaction-form.tsx`, replaced `createAdminClient()` with `createClient()` in page components, and added soft-delete filters.

## Tasks Completed

### Task 1: Created lib/system-config.ts
- `getAccountingUserIdSync()`: returns env var with hardcoded fallback (for server-side sync usage)
- `getAccountingUserId()`: async version that queries `system_config` table first, falls back to env var, then hardcoded value

### Task 2: Created .env.example
- Added `ACCOUNTING_SYSTEM_USER_ID` (server-side)
- Added `NEXT_PUBLIC_ACCOUNTING_SYSTEM_USER_ID` (client-side)
- Also included Supabase env var placeholders

### Task 3: Replaced hardcoded UUID in transaction-form.tsx
- Added `ACCOUNTING_USER_ID` constant using `NEXT_PUBLIC_` env var with fallback
- Replaced all 4 inline UUID occurrences (2 in "applicant" selector, 2 in "approver" selector)
- Only the fallback definition line retains the UUID string

### Task 4: Replaced createAdminClient() in page components
- `app/page.tsx`: Removed `createAdminClient` import and usage; pass `supabase` (RLS client) to `getUserTeams` instead of `admin`
- `app/applications/page.tsx`: Same pattern -- removed admin client, use RLS-aware client
- Added `.is('deleted_at', null)` to:
  - `app/page.tsx`: transactions query, subsidy_items query
  - `app/applications/page.tsx`: transactions query

## Files Modified
- `lib/system-config.ts` (NEW): Centralized accounting user ID resolution
- `.env.example` (NEW): Environment variable template
- `components/transaction-form.tsx`: Replaced 4 hardcoded UUIDs with `ACCOUNTING_USER_ID` constant
- `app/page.tsx`: Removed `createAdminClient`, added soft-delete filters
- `app/applications/page.tsx`: Removed `createAdminClient`, added soft-delete filter

## Key Decisions
- Used `NEXT_PUBLIC_ACCOUNTING_SYSTEM_USER_ID` for client component (transaction-form.tsx) since `use client` components cannot access server-only env vars
- Passed `supabase` (RLS client) as both arguments to `getUserTeams()` instead of admin client, per SCHEMA_CONTRACT.md rules (SELECT queries should use RLS)
- Kept hardcoded UUID as fallback constant only (not inline) for backward compatibility

## Issues Encountered
- `getUserTeams` accepts two SupabaseClient params (one used for `accounting_groups` query with admin). Passing the RLS client for both means the `accounting_groups` query will now go through RLS. This is the intended behavior per the schema contract, but requires that appropriate RLS SELECT policies exist on `accounting_groups` table.
