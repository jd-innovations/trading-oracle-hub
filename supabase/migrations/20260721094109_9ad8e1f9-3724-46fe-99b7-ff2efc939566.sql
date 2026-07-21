
CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('trade','plan')),
  symbol TEXT NOT NULL CHECK (symbol IN ('ES','NQ')),
  plan_date DATE NOT NULL,
  -- trade fields
  side TEXT CHECK (side IN ('long','short')),
  bias TEXT CHECK (bias IN ('Bullish','Bearish','Neutral')),
  entry_price NUMERIC,
  entry_label TEXT,
  exit_price NUMERIC,
  exit_label TEXT,
  entry_time TIMESTAMPTZ,
  exit_time TIMESTAMPTZ,
  phase TEXT CHECK (phase IN ('closed_win','stopped')),
  realized_points NUMERIC,
  contracts INT,
  -- plan fields
  pivot NUMERIC,
  score INT,
  session_high NUMERIC,
  session_low NUMERIC,
  session_close NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own journal entries" ON public.journal_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX journal_entries_trade_uniq ON public.journal_entries (user_id, symbol, plan_date, entry_time)
  WHERE kind = 'trade';
CREATE UNIQUE INDEX journal_entries_plan_uniq ON public.journal_entries (user_id, symbol, plan_date)
  WHERE kind = 'plan';

CREATE TRIGGER update_journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
