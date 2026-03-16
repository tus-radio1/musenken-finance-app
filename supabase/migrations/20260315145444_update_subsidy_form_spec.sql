-- 1. Create a new enum for income_type
CREATE TYPE public.income_type AS ENUM ('income', 'expense');

-- 2. Add 'tournament', 'expensive_goods' to 'subsidy_expense_type' enum
ALTER TYPE public.subsidy_expense_type ADD VALUE 'tournament';
ALTER TYPE public.subsidy_expense_type ADD VALUE 'expensive_goods';

-- 3. Add new columns to 'subsidy_items'
ALTER TABLE public.subsidy_items 
ADD COLUMN income_type public.income_type NOT NULL DEFAULT 'expense',
ADD COLUMN date date NOT NULL DEFAULT CURRENT_DATE;

-- Since 'other' already exists in subsidy_expense_type ('facility', 'participation', 'equipment', 'registration', 'travel', 'accommodation', 'other'), we don't need to add it again.
