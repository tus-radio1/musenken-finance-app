# Researcher Work Log - Auth/Role Refactoring

## Session: 2026-03-21

### Task
Research external best practices for auth context sharing, role constants, and Supabase client reuse in Next.js 14 App Router projects.

### Research Conducted

1. **Next.js 14 shared auth context patterns**
   - Searched for server action auth reuse patterns
   - Found React `cache()` as the recommended deduplication mechanism
   - Found HOF (higher-order function) wrapper pattern for server actions
   - Fetched detailed article from Prismic about server context optimization

2. **TypeScript role constants (enum vs const object)**
   - Searched for 2024-2025 best practices
   - Found strong consensus: `as const` objects preferred over enums
   - Fetched DEV.to comparison article with bundle size data

3. **Supabase client reuse**
   - Searched for singleton/caching patterns
   - Found Supabase Discussion #26936 (unanswered officially, but `cache()` suggested)
   - Read existing project's `utils/supabase/server.ts` to understand current setup
   - Fetched catjam.fi lessons-learned article

4. **Codebase context**
   - Read existing analysis at `.claude/docs/research/auth-role-refactoring-codebase.md`
   - Reviewed `utils/supabase/server.ts` and `utils/supabase/client.ts`

### Output
- Research findings saved to: `.claude/docs/research/auth-role-patterns.md`
- Key recommendations sent to architect teammate

### Key Findings Summary
- React `cache()` is the standard way to deduplicate auth calls per-request in Next.js 14
- `as const` objects are preferred over enums for role constants in modern TypeScript
- Supabase server client should be created once per request via cached `resolveAuthContext()`
- HOF wrappers for server actions eliminate auth/permission boilerplate
- `findProfileIdByStudentNumber` is completely redundant — `user.id` is available directly
