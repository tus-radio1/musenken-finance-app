-- Add unexecuted status to subsidy_status enum
ALTER TYPE public.subsidy_status ADD VALUE IF NOT EXISTS 'unexecuted';
