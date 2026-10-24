# P2 authenticated-render round-trip inventory

Measured on 2026-10-24, baseline `dc9ee37`, branch `feature/p2-performance`.
Production region evidence supplied by the caller: Supabase `ap-southeast-1`;
Vercel response `x-vercel-id: hnd1::sin1::…` identifies the function in `sin1`.
Both are Singapore. No region change is necessary.

## Counting model

A call is one outbound Supabase Auth / PostgREST HTTP request, including RPCs.
Depth is the longest dependency chain of those requests, not the total count,
wall-clock latency, number of JavaScript `await`s, or a count of database queries
inside an RPC / RLS policy. Parallel queries add calls but only one depth level.
The proxy runs before the render; layout and page render work can overlap.

The main table is the **complete initial load**: proxy + SSR + the initial
hydration fetches. It excludes Next link prefetches, Realtime WebSocket traffic,
user interactions, receipt downloads and expired-session refreshes. The baseline
sidebar issues 4 requests after hydration (Auth, then 3 parallel queries).
The baseline ledger also calls `fetchFinancialAccounts` after hydration: 4
sequential requests including that Server Action's proxy. Both are zero after.
Layout server fetching intentionally moves work into TTFB; SSR totals are
reported separately so this tradeoff is visible.

Assumptions: signed-in authorized user; current fiscal year exists; a visible
ledger group with at least one non-system actor exists; normal migrated schema;
successful queries; warm pre-existing `unstable_cache` entries. Warm here does
**not** mean caching user data across requests. React render snapshots always
start empty for a new request.

## Complete initial load (warm metadata)

| Route | Calls before | Calls after | Depth before | Depth after |
|---|---:|---:|---:|---:|
| `/` | 10 | 8 | 6 | 4 |
| `/applications` | 8 | 6 | 6 | 3 |
| `/ledger` | 18 | 11 | 11 | 5 |
| `/budget` | 9 | 7 | 5 | 3 |
| `/subsidies` | 9 | 7 | 7 | 3 |
| `/subsidies/manage` | 11 | 9 | 7 | 4 |
| `/members` | 8 | 7 | 6 | 3 |
| `/members/manage` | 10 | 8 | 8 | 4 |
| `/settings` | 7 | 5 | 5 | 3 |
| `/admin/users` (deprecated `notFound()`) | 1 | 5 | 1 | 3 |

The deprecated `/admin/users` is not a usable authenticated page. Its speculative
layout now performs the server sidebar queries even though the page immediately
throws `notFound()`. This is a known 4-call regression on that legacy URL; no
route, redirect or not-found behavior was changed to optimize it.

## SSR only: logical code calls versus observed HTTP calls

Next.js already deduplicates identical GET fetches inside a render. In the
baseline ledger, the action's second Auth and role fetch hit that deduplication;
in subsidy management, the two actions' Auth fetches do too. Claiming all code
calls as physical network requests would overstate the improvement. The request
cache makes this sharing explicit without relying on implicit fetch behavior.

| Route | Logical calls before → after | HTTP calls before → after | HTTP depth before → after |
|---|---:|---:|---:|
| `/` | 6 → 8 | 6 → 8 | 4 → 4 |
| `/applications` | 4 → 6 | 4 → 6 | 4 → 3 |
| `/ledger` | 12 → 11 | 10 → 11 | 7 → 5 |
| `/budget` | 5 → 7 | 5 → 7 | 3 → 3 |
| `/subsidies` | 5 → 7 | 5 → 7 | 5 → 3 |
| `/subsidies/manage` | 8 → 9 | 7 → 9 | 5 → 4 |
| `/members` | 4 → 7 | 4 → 7 | 4 → 3 |
| `/members/manage` | 6 → 8 | 6 → 8 | 6 → 4 |
| `/settings` | 3 → 5 | 3 → 5 | 3 → 3 |
| `/admin/users` | 1 → 5 | 1 → 5 | 1 → 3 |

Ledger's logical SSR depth is **9 → 5**, the original audit's approximately
nine-level chain. Its observed baseline network depth is 7 because two levels
already benefit from Next fetch deduplication.

## Source derivation by route

All paths below are relative to `app/(authenticated)/` unless specified.
`A` = render Auth, `R` = current roles, `P` = sidebar profile,
`S` = sidebar pending subsidies, `M` = middleware Auth.
`[x, y]` denotes independent parallel requests; `→` denotes dependencies.
Every after-render shares `A → [R, P, S]` with the layout.

| Source | Before SSR query graph (excluding M) | After SSR query graph (excluding M) |
|---|---|---|
| `layout.tsx` | No server queries; browser `A → [R, P, S]` | `A → [R, P, S]`; all props supplied to the provider |
| `page.tsx` | `A → [current FY, R → cached groups] → [own transactions, own subsidies]` | `A → [current FY, R, cached groups] → [own transactions, own subsidies]` |
| `applications/page.tsx` | `A → R → cached groups → own transactions` | `A → [R, cached groups, own transactions]` |
| `ledger/page.tsx` / `ledger/actions.ts` | `A → [R, 3 cached metadata reads, all profiles] → action A → action R → fresh group → [transactions, subsidies, budget] → financial accounts → actor profiles` | `A → [R, 3 cached metadata reads, all profiles, all financial accounts] → fresh group → [transactions, subsidies, budget]`; SSR reader reuses profiles/accounts |
| `budget/page.tsx` | `[A, cached FY] → [R, cached groups, budgets, usage RPC]` | `[A, cached FY] → [R, cached groups, budgets, usage RPC]` (A/R shared with layout) |
| `subsidies/page.tsx` | `A → R → active groups → own subsidies` | `A → [R, active groups, own subsidies]` |
| `subsidies/manage/page.tsx` / `actions.ts` | `FY → [action (A → R → subsidies), action (A → profiles), groups]` | `A → [R, FY, profiles, groups] → subsidies`; internal readers keep permission guard |
| `members/page.tsx` | `A → member profiles → all role assignments` | `A → [member profiles, all role assignments]` |
| `members/manage/page.tsx` | `A → R → member profiles → roles → all role assignments` | `A → R → [member profiles, roles, all role assignments]` |
| `settings/page.tsx` | `A → profile` | `A → profile`; same request-cached profile as layout |
| `admin/users/page.tsx` | `notFound()`; no page queries | Unchanged; layout may still execute its reads |
| `proxy.ts` | `M` (1 call / 1 level) | Unchanged (1 call / 1 level); separate from the React render cache |

## Cold-cache and conditional branches

Only existing metadata uses `unstable_cache`; no new shared cache was added.
The full initial-load cold-metadata inventory is:

| Route | Calls before → after | Depth before → after | Cold metadata |
|---|---:|---:|---|
| `/` | 11 → 9 | 7 → 4 | accounting groups |
| `/applications` | 9 → 7 | 7 → 3 | accounting groups |
| `/ledger` | 21 → 14 | 11 → 5 | groups, fiscal years, accounting system user ID |
| `/budget` | 11 → 9 | 5 → 3 | groups, fiscal years |
| All other routes | Same as warm table | Same as warm table | None |

- Home without a current FY: add 1 call / 1 level before and after (latest FY
  fallback). If there are no FY rows, no FY filter is applied, as before.
- Historical ledger: add 1 call / 1 level before and after for budgets used to
  choose historical groups. Ledger without `fyYear`: subtract the budget call;
  baseline without any actor IDs also skips its actor-profile call/level.
- Ledger with no visible group: skip the ledger reader. After still fetches
  wallets for the selector, just as the baseline hydration effect did.
- Members without the legacy `profiles.deleted_at` column: add 1 fallback
  profile call / 1 dependency level inside that branch, before and after.
- Unauthorized member-management: after A/R the page returns AccessDenied;
  no member/role-list queries execute. Sidebar still fetches P/S.
- Unauthorized subsidy-management: no subsidy-list query executes; the existing
  page profile/group reads and layout sidebar still run.
- Budget's existing data reads occur in parallel with role lookup; AccessDenied
  still prevents rendering them. User RLS continues to protect every data read.
- Unauthenticated requests stop at the proxy redirect: no Auth HTTP request if
  there is no session; expired sessions can incur token refresh requests. The
  table intentionally does not assign a fixed cost to those token-state cases.

## Runtime confirmation and limits

Before edits, ran `next dev -p 3100` against the already-running local stack.
A temporary Node preload wrapped outgoing fetches matching the exported local
Supabase URL, recording **only pathname and start/end timestamps** to `/tmp`.
No headers, cookies, query strings, response bodies, API keys or user IDs were
logged. Sent authenticated HTML GETs with an existing local E2E admin session,
warmed each route once and counted the second response. All ten routes were
sampled before and after. Repeated all ten after measurements with the production
build (`next start -p 3100`); the same counts were observed. SSR HTTP counts in the table were observed; dependency
depths were derived from code and cross-checked with the timestamp ordering.
The initial browser sidebar and wallet costs were derived from source, not
included in the server preload counts. Thus initial-load totals combine
measured SSR counts and code-derived hydration counts, not a browser trace.

Temporary instrumentation was outside the repository, was removed after the
measurements, and is not committed.
No local Supabase restart/reset, remote Supabase access, or dependency addition
was used. The production build and E2E run use the same exported local env.
The inventory gives request counts, not production latency guarantees.

## Validation

- `npm run lint`: exit 0, zero errors / warnings.
- `npm run typecheck`: exit 0.
- `npm test`: exit 0, **36 files / 565 tests passed** (547 unchanged existing
  tests plus 18 new cases; no existing test file was changed).
- `npm run build`: exit 0 with exported local Supabase env; 15 static-generation
  tasks completed. Existing baseline-browser-mapping age notice is non-blocking.
- `E2E_PORT=3100 npm run e2e`: exit 0, **12/12 passed**, one suite run, 33.0s.
  This used the already-running local stack without stop/reset/restart.
- Initial intermediate checks caught a reader-extraction syntax error and a
  test-only TypeScript narrowing error; both were corrected before final gates.
  No test was skipped, weakened or deleted.
- Interactive ledger Action (without SSR lookups): 8 calls before and after,
  depth 6 → 5, excluding its unchanged 1-call proxy. It still freshly checks
  Auth, roles and group type, and only reads profiles for actor IDs in the rows.

## Middleware decision

Keep `proxy.ts` on `auth.getUser()` with identical cookie refresh and redirects.
`package.json` allows supabase-js `^2.86.0`; the lockfile/installed version is
`2.98.0`, which supports `getClaims()`. Its auth-js implementation falls back to
`getUser(token)` for symmetric JWT algorithms, absent key IDs, missing WebCrypto,
or unavailable signing keys. Asymmetric verification can reuse JWKS locally,
but this project's production signing-key mode was not supplied or inspected.
There is no demonstrated round-trip saving with symmetric signing. Also,
locally verifying a signed token is not a fresh Auth user-record lookup; keeping
the existing check preserves its behavior for deleted/disabled users and login
redirects. No auth/session policy change is justified by this performance task.

Sources: [Supabase getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims),
[Supabase SSR methods](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs),
[React cache](https://react.dev/reference/react/cache), and installed
`node_modules/@supabase/auth-js/src/GoTrueClient.ts` (`getClaims`).

## Security and production follow-up

- React `cache()` stores user, roles and profile only for the current server
  render. No `unstable_cache`, module Map, SWR singleton or cross-user snapshot
  stores permissions. Actions continue to use uncached `resolveAuthContext` /
  `resolveAuthWithRoles`, including on every subsequent call.
- `requireRoleAccess` still throws on lookup failure; P1 parsing and permission
  functions are unchanged. SSR and Action readers use the same permission
  predicates. Ledger group metadata is read fresh, not trusted from the
  hour-long accounting-group cache; errors/missing/restricted groups deny reads.
- Authenticated RLS clients still execute all per-user data reads. The only
  admin-client reads remain the pre-existing public metadata caches.
- Measure TTFB/LCP/INP by route and device in Vercel Speed Insights. In particular,
  compare ledger and home p50/p95 TTFB on cold/warm metadata. Confirm no sidebar
  role-menu flash, count Auth/PostgREST requests including prefetch traffic, and
  measure Action latency separately. Supabase API/DB logs can identify whether
  remaining time is Auth, PostgREST/RLS, or query execution. Do not infer latency
  improvement from a local millisecond sample or from calls alone.
