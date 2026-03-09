-- Add receipt_url to subsidy_items
ALTER TABLE public.subsidy_items
ADD COLUMN receipt_url TEXT;
