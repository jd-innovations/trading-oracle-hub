DROP INDEX IF EXISTS public.journal_entries_trade_unique;
CREATE UNIQUE INDEX journal_entries_trade_unique ON public.journal_entries (user_id, symbol, plan_date, entry_time);