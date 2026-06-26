import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-md border border-border bg-card p-6 shadow"
      >
        <h1 className="display text-xl font-semibold">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Required to store your Schwab connection securely.
        </p>
        <label className="mt-4 block text-xs font-medium">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border border-input bg-background px-3 py-2 text-sm"
        />
        <label className="mt-3 block text-xs font-medium">Password</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-input bg-background px-3 py-2 text-sm"
        />
        {err && <p className="mt-3 text-xs text-red-500">{err}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading
            ? "..."
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "sign-in"
            ? "Need an account? Sign up"
            : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
