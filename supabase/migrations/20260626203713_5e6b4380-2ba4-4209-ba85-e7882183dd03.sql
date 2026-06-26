
CREATE TABLE public.schwab_tokens (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.schwab_tokens TO authenticated;
GRANT ALL ON public.schwab_tokens TO service_role;

ALTER TABLE public.schwab_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schwab tokens"
  ON public.schwab_tokens FOR SELECT
  USING (auth.uid() = user_id);
