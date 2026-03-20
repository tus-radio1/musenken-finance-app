-- =============================================================================
-- Initial Schema Migration
-- =============================================================================
-- This migration establishes the complete base schema for the musenken-finance-app.
-- All subsequent migrations (20260302+) build upon this foundation.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Enums
-- =============================================================================

-- Approval status for transactions
CREATE TYPE public.approval_status AS ENUM (
  'pending',
  'accepted',
  'approved',
  'rejected',
  'receipt_received',
  'refunded',
  'received'
);

-- Category for subsidy items
CREATE TYPE public.subsidy_category AS ENUM (
  'activity',
  'league',
  'special'
);

-- Expense type for subsidy items
CREATE TYPE public.subsidy_expense_type AS ENUM (
  'facility',
  'participation',
  'equipment',
  'registration',
  'travel',
  'accommodation',
  'other'
);

-- Status for subsidy items
CREATE TYPE public.subsidy_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'paid',
  'receipt_submitted',
  'receipt_received'
);

-- =============================================================================
-- Tables
-- =============================================================================

-- profiles: User profile data (synced with auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  student_number TEXT UNIQUE NOT NULL,
  grade INTEGER NOT NULL DEFAULT 1,
  role TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- accounting_groups: Organizational units for accounting (e.g. teams, departments)
CREATE TABLE public.accounting_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- fiscal_years: Fiscal year definitions
CREATE TABLE public.fiscal_years (
  year INTEGER PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- budgets: Budget allocations per accounting group and fiscal year
CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_group_id UUID NOT NULL REFERENCES public.accounting_groups(id) ON DELETE CASCADE,
  fiscal_year_id INTEGER NOT NULL REFERENCES public.fiscal_years(year) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (accounting_group_id, fiscal_year_id)
);

-- roles: Role definitions (admin, leader, general, etc.)
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  accounting_group_id UUID REFERENCES public.accounting_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- user_roles: Junction table mapping users to roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role_id)
);

-- subsidy_items: Subsidy (support fund) applications
CREATE TABLE public.subsidy_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.subsidy_category NOT NULL,
  term INTEGER NOT NULL DEFAULT 1,
  expense_type public.subsidy_expense_type NOT NULL,
  accounting_group_id UUID NOT NULL REFERENCES public.accounting_groups(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES public.profiles(id),
  fiscal_year_id INTEGER NOT NULL REFERENCES public.fiscal_years(year),
  name TEXT NOT NULL,
  requested_amount INTEGER NOT NULL,
  approved_amount INTEGER,
  status public.subsidy_status NOT NULL DEFAULT 'pending',
  justification TEXT NOT NULL,
  evidence_url TEXT,
  receipt_date DATE,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- transactions: Financial transaction records (income/expense)
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,
  accounting_group_id UUID NOT NULL REFERENCES public.accounting_groups(id) ON DELETE CASCADE,
  fiscal_year_id INTEGER REFERENCES public.fiscal_years(year),
  approval_status public.approval_status NOT NULL DEFAULT 'pending',
  receipt_url TEXT,
  created_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  remarks TEXT,
  subsidy_item_id UUID REFERENCES public.subsidy_items(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- profiles
CREATE INDEX idx_profiles_student_number ON public.profiles(student_number);

-- transactions
CREATE INDEX idx_transactions_accounting_group ON public.transactions(accounting_group_id);
CREATE INDEX idx_transactions_fiscal_year ON public.transactions(fiscal_year_id);
CREATE INDEX idx_transactions_created_by ON public.transactions(created_by);
CREATE INDEX idx_transactions_date ON public.transactions(date);
CREATE INDEX idx_transactions_approval_status ON public.transactions(approval_status);

-- subsidy_items
CREATE INDEX idx_subsidy_items_accounting_group ON public.subsidy_items(accounting_group_id);
CREATE INDEX idx_subsidy_items_fiscal_year ON public.subsidy_items(fiscal_year_id);
CREATE INDEX idx_subsidy_items_applicant ON public.subsidy_items(applicant_id);
CREATE INDEX idx_subsidy_items_status ON public.subsidy_items(status);

-- budgets
CREATE INDEX idx_budgets_accounting_group ON public.budgets(accounting_group_id);
CREATE INDEX idx_budgets_fiscal_year ON public.budgets(fiscal_year_id);

-- user_roles
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role_id);

-- roles
CREATE INDEX idx_roles_type ON public.roles(type);
CREATE INDEX idx_roles_accounting_group ON public.roles(accounting_group_id);

-- =============================================================================
-- RLS (basic policies for the initial schema)
-- =============================================================================

-- Enable RLS on accounting_groups (read access for authenticated users)
ALTER TABLE public.accounting_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read access"
  ON public.accounting_groups FOR SELECT
  TO authenticated
  USING (true);

-- Enable RLS on roles (read access for all)
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_select_all"
  ON public.roles FOR SELECT
  TO authenticated
  USING (true);

-- Enable RLS on budgets (read access for authenticated users)
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "budgets_select_authenticated"
  ON public.budgets FOR SELECT
  TO authenticated
  USING (true);

-- fiscal_years: RLS enabled but no initial policy (added in migration 20260307151000)
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Storage bucket for receipts
-- =============================================================================
-- NOTE: The receipts storage bucket must be created via Supabase Dashboard
-- or supabase CLI: supabase storage create receipts --public
-- This migration only handles the database schema.
