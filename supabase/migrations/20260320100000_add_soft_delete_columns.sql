-- Migration: Add soft delete columns to key tables
-- Purpose: Enable soft deletion instead of hard deletion for data integrity and audit trail

-- Add deleted_at column to transactions
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add deleted_at column to subsidy_items
ALTER TABLE public.subsidy_items
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add deleted_at column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Partial indexes for efficient queries on soft-deleted records
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at
  ON public.transactions(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subsidy_items_deleted_at
  ON public.subsidy_items(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON public.profiles(deleted_at) WHERE deleted_at IS NOT NULL;
