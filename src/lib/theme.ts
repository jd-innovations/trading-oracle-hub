// Theme handling. SSR-safe: dark by default.
export type Theme = "dark" | "light";

export const THEME_KEY = "jd-theme";

export const themeInitScript = `(() => {
  try {
    const stored = localStorage.getItem('${THEME_KEY}');
    const theme = stored === 'light' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();`;

export function getTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem(THEME_KEY) as Theme) || "dark";
}

export function setTheme(t: Theme) {
  localStorage.setItem(THEME_KEY, t);
  document.documentElement.classList.toggle("dark", t === "dark");
}
