-- Migration: Relax NOT NULL constraint on subsidy_items.justification
-- Some subsidy items were created without justification text in dev

ALTER TABLE public.subsidy_items
  ALTER COLUMN justification DROP NOT NULL;
