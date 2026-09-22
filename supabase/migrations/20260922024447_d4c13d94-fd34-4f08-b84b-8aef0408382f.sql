CREATE TABLE public.auto_trader_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  cool_off_et TEXT NOT NULL DEFAULT '09:35',
  early_stop_pct INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT auto_trader_settings_user_unique UNIQUE (user_id),
  CONSTRAINT auto_trader_settings_pct_range CHECK (early_stop_pct >= 0 AND early_stop_pct <= 100)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_trader_settings TO authenticated;
GRANT ALL ON public.auto_trader_settings TO service_role;

ALTER TABLE public.auto_trader_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own auto-trader settings"
ON public.auto_trader_settings FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_auto_trader_settings_updated_at
BEFORE UPDATE ON public.auto_trader_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();