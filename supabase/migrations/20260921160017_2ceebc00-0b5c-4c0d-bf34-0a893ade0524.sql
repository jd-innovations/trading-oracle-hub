ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS mfe_points numeric,
  ADD COLUMN IF NOT EXISTS mae_points numeric,
  ADD COLUMN IF NOT EXISTS mfe_time timestamp with time zone;