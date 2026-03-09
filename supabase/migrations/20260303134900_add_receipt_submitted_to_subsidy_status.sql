-- Add receipt_submitted to subsidy_status
ALTER TYPE public.subsidy_status ADD VALUE IF NOT EXISTS 'receipt_submitted';
ALTER TYPE public.subsidy_status ADD VALUE IF NOT EXISTS 'receipt_received';
