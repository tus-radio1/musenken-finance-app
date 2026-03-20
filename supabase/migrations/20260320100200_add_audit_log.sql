-- Migration: Create audit_logs table for tracking all data changes
-- Purpose: Maintain a complete audit trail for compliance and debugging

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE')),
  old_data JSONB,
  new_data JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for looking up changes to a specific record
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record
  ON public.audit_logs(table_name, record_id);

-- Index for time-based queries (recent changes, date range filtering)
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at
  ON public.audit_logs(changed_at);

-- Index for looking up changes by a specific user
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by
  ON public.audit_logs(changed_by);

-- =============================================================================
-- RLS policies for audit_logs
-- =============================================================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin can read all audit logs
CREATE POLICY "audit_logs_select_admin"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (is_admin());

-- Users can read audit logs for their own changes
CREATE POLICY "audit_logs_select_own"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (changed_by = auth.uid());

-- Only the system (service role / admin client) should insert audit logs,
-- but we allow authenticated inserts so server actions can write logs.
-- Users can only insert logs attributed to themselves.
CREATE POLICY "audit_logs_insert_own"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (changed_by = auth.uid());

-- No UPDATE or DELETE allowed on audit logs (immutable)
-- (No policies created = denied by default with RLS enabled)
