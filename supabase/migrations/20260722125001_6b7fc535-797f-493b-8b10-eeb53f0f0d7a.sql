CREATE TABLE public.auto_trader_state (
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  plan_date date NOT NULL,
  state jsonb NOT NULL,
  posted_event_count integer NOT NULL DEFAULT 0,
  logged_leg_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol, plan_date)
);

GRANT SELECT ON public.auto_trader_state TO authenticated;
GRANT ALL ON public.auto_trader_state TO service_role;

ALTER TABLE public.auto_trader_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read own auto trader state"
  ON public.auto_trader_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER update_auto_trader_state_updated_at
  BEFORE UPDATE ON public.auto_trader_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();