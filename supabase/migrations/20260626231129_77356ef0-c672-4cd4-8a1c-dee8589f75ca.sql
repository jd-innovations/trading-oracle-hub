CREATE TABLE public.schwab_oauth_state (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  state TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schwab_oauth_state TO authenticated;
GRANT ALL ON public.schwab_oauth_state TO service_role;
ALTER TABLE public.schwab_oauth_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own oauth state" ON public.schwab_oauth_state FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);