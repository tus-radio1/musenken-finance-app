-- Add actual_amount and accounting_group_id to subsidy_items if they don't exist

ALTER TABLE subsidy_items
ADD COLUMN IF NOT EXISTS actual_amount integer DEFAULT 0;

-- Optionally, to be safe:
-- ALTER TABLE subsidy_items ADD COLUMN IF NOT EXISTS accounting_group_id uuid REFERENCES accounting_groups(id);
-- (It seems accounting_group_id already exists based on fetch queries, so we just add actual_amount)
