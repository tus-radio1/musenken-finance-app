# Phase 2 Schema Contract

All code implementers must assume the following DB changes have been applied by DB-Architect.

## deleted_at columns (soft delete)
```sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE subsidy_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
```
- Soft-deleted records have `deleted_at IS NOT NULL`
- All queries must filter `WHERE deleted_at IS NULL`

## audit_logs table
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE')),
  old_data JSONB,
  new_data JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## system_config table
```sql
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT
);
INSERT INTO system_config (key, value, description)
VALUES ('accounting_user_id', '9701edd2-bd9d-4d57-9dd6-7235686103bf', '会計システムユーザーのUUID')
ON CONFLICT (key) DO NOTHING;
```

## Environment variable
Add to .env.local and .env.example:
```
ACCOUNTING_SYSTEM_USER_ID=9701edd2-bd9d-4d57-9dd6-7235686103bf
```

## RLS Policies (role-based)
Roles in `user_roles` table: admin, 部長, 副部長, 会計, 仮部員, OB・OG
- admin: full access to all tables
- 部長/副部長/会計: read all, write their scope
- 仮部員: read/write own records only
- OB・OG: read only

## createAdminClient() → createClient() rules
KEEP createAdminClient() for:
- `auth.admin.*` operations (user creation, deletion, password reset)
- Any operation explicitly needing RLS bypass (document why)

REPLACE with createClient() for:
- All SELECT queries on regular tables (transactions, subsidy_items, profiles, etc.)
- UPDATE/DELETE operations where RLS policies handle authorization

## lib/audit-log.ts API
```typescript
import { createClient } from '@/utils/supabase/server'

export async function logAuditEvent(params: {
  tableName: string
  recordId: string
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'SOFT_DELETE'
  oldData?: Record<string, unknown>
  newData?: Record<string, unknown>
  changedBy: string
}): Promise<void>
```

## lib/system-config.ts API
```typescript
// Get accounting system user ID from env var, fallback to DB
export async function getAccountingUserId(): Promise<string>

// Sync version for client components (env var only)
export function getAccountingUserIdSync(): string
```
