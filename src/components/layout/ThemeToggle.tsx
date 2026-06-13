import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setT] = useState<Theme>("dark");
  useEffect(() => {
    setT(getTheme());
  }, []);
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        setTheme(next);
        setT(next);
      }}
      className="grid h-8 w-8 place-items-center rounded-md border border-border bg-surface-1 text-muted-foreground transition-colors hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
