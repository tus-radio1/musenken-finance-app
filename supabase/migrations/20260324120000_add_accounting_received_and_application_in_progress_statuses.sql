-- Add accounting_received and application_in_progress statuses to subsidy_status enum
ALTER TYPE public.subsidy_status ADD VALUE IF NOT EXISTS 'accounting_received';
ALTER TYPE public.subsidy_status ADD VALUE IF NOT EXISTS 'application_in_progress';
