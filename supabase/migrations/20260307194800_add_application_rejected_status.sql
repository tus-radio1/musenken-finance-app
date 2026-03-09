-- Add application_rejected status to subsidy_status enum
ALTER TYPE public.subsidy_status ADD VALUE IF NOT EXISTS 'application_rejected';
