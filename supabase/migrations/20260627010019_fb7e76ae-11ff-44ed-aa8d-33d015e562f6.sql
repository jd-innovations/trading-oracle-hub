
CREATE TABLE public.daily_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  symbol text NOT NULL DEFAULT 'ES',
  bias text NOT NULL CHECK (bias IN ('Bullish','Bearish','Neutral')),
  pivot numeric NOT NULL,
  t1_up numeric NOT NULL,
  t2_up numeric NOT NULL,
  t3_up numeric NOT NULL,
  t1_dn numeric NOT NULL,
  t2_dn numeric NOT NULL,
  t3_dn numeric NOT NULL,
  prior_high numeric,
  prior_low numeric,
  prior_close numeric,
  prior_poc numeric,
  prior_vah numeric,
  prior_val numeric,
  naked_30m_pocs jsonb NOT NULL DEFAULT '[]'::jsonb,
  context text,
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual','auto+manual')),
  published boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_date, symbol)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_plans TO authenticated;
GRANT ALL ON public.daily_plans TO service_role;

ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own daily plans"
  ON public.daily_plans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_daily_plans_updated_at
  BEFORE UPDATE ON public.daily_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_daily_plans_user_date ON public.daily_plans (user_id, plan_date DESC);
