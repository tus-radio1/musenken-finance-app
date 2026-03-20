-- Migration: Enable RLS and create policies for all core tables
-- Purpose: Enforce row-level security so that createClient() can be used safely

-- =============================================================================
-- Helper functions
-- =============================================================================

-- is_admin(): Returns true if the current authenticated user has an admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.type = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- has_role(role_name): Returns true if the current user has the specified role name
CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name = role_name
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- profiles
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all profiles (needed for member lists, applicant names, etc.)
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin can perform all operations on profiles
CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- transactions
-- =============================================================================

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read non-deleted transactions
CREATE POLICY "transactions_select_non_deleted"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- Users can insert transactions for groups they belong to
CREATE POLICY "transactions_insert_member"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.accounting_group_id = accounting_group_id
    )
  );

-- Users can update their own pending transactions
CREATE POLICY "transactions_update_own"
  ON public.transactions FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND approval_status = 'pending'
    AND deleted_at IS NULL
  )
  WITH CHECK (deleted_at IS NULL);

-- Admin and accounting users can update any non-deleted transaction (status changes, approvals, etc.)
CREATE POLICY "transactions_update_admin_accounting"
  ON public.transactions FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (is_admin() OR has_role('会計'))
  );

-- Admin can perform all operations on transactions (including soft-delete)
CREATE POLICY "transactions_admin_all"
  ON public.transactions FOR ALL
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- subsidy_items
-- =============================================================================

ALTER TABLE public.subsidy_items ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read non-deleted subsidy items
CREATE POLICY "subsidy_items_select_non_deleted"
  ON public.subsidy_items FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- Users can insert subsidy items (applicant_id must be themselves)
CREATE POLICY "subsidy_items_insert_own"
  ON public.subsidy_items FOR INSERT
  TO authenticated
  WITH CHECK (applicant_id = auth.uid());

-- Users can update their own pending subsidy items
CREATE POLICY "subsidy_items_update_own"
  ON public.subsidy_items FOR UPDATE
  TO authenticated
  USING (
    applicant_id = auth.uid()
    AND status IN ('pending', 'application_rejected')
    AND deleted_at IS NULL
  )
  WITH CHECK (deleted_at IS NULL);

-- Admin and accounting can update any non-deleted subsidy item (approve, change status, etc.)
CREATE POLICY "subsidy_items_update_admin_accounting"
  ON public.subsidy_items FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (is_admin() OR has_role('会計'))
  );

-- Admin can perform all operations on subsidy_items
CREATE POLICY "subsidy_items_admin_all"
  ON public.subsidy_items FOR ALL
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- user_roles
-- =============================================================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all role assignments (needed for permission checks)
CREATE POLICY "user_roles_select_authenticated"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

-- Admin can perform all operations on user_roles
CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- accounting_groups
-- =============================================================================

ALTER TABLE public.accounting_groups ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all accounting groups (needed for team selection, forms, etc.)
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.accounting_groups;
CREATE POLICY "accounting_groups_select_authenticated"
  ON public.accounting_groups FOR SELECT
  TO authenticated
  USING (true);

-- Admin can perform all operations on accounting_groups
CREATE POLICY "accounting_groups_admin_all"
  ON public.accounting_groups FOR ALL
  TO authenticated
  USING (is_admin());

-- =============================================================================
-- roles
-- =============================================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all roles (needed for permission checks)
DROP POLICY IF EXISTS "roles_select_all" ON public.roles;
CREATE POLICY "roles_select_authenticated"
  ON public.roles FOR SELECT
  TO authenticated
  USING (true);

-- Admin can perform all operations on roles
CREATE POLICY "roles_admin_all"
  ON public.roles FOR ALL
  TO authenticated
  USING (is_admin());
