import { toast } from "sonner";
import { postToDiscord } from "./discord.functions";

const AUTO_POST_KEY = "discord:auto-post-trades";

export function loadAutoPostTrades(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(AUTO_POST_KEY);
  return v === null ? true : v === "1";
}

export function saveAutoPostTrades(v: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTO_POST_KEY, v ? "1" : "0");
}

/** Fire-and-forget post to Discord with toast feedback.
 * `silent` suppresses only the success toast — errors always toast. */
export function sendToDiscord(content: string, opts?: { silent?: boolean; label?: string }) {
  if (!content?.trim()) {
    console.warn("[discord] skipped: empty content", opts?.label);
    return;
  }
  const trimmed = content.length > 1900 ? content.slice(0, 1897) + "…" : content;
  const preview = trimmed.slice(0, 80).replace(/\n/g, " ⏎ ");
  console.info("[discord] post →", opts?.label ?? "(no label)", `len=${trimmed.length}`, preview);
  postToDiscord({ data: { content: trimmed } })
    .then((res) => {
      console.info("[discord] ok", opts?.label ?? "(no label)", res);
      if (!opts?.silent) toast.success(`Posted to Discord${opts?.label ? ` · ${opts.label}` : ""}`);
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[discord] fail", opts?.label ?? "(no label)", msg, err);
      toast.error(`Discord post failed: ${msg}`);
    });
}
