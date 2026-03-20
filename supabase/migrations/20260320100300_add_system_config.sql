-- Migration: Create system_config table for application-wide settings
-- Purpose: Store configurable system values (e.g., accounting user ID) in the database

CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT
);

-- Seed the accounting system user ID
INSERT INTO public.system_config (key, value, description)
VALUES ('accounting_user_id', '9701edd2-bd9d-4d57-9dd6-7235686103bf', 'UUID of the accounting system user')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- RLS policies for system_config
-- =============================================================================

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read system configuration
CREATE POLICY "system_config_select"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (true);

-- Admin can manage all system configuration
CREATE POLICY "system_config_admin_all"
  ON public.system_config FOR ALL
  TO authenticated
  USING (is_admin());
