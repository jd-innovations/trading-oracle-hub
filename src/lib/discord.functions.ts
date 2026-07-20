import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  content: z.string().trim().min(1).max(1900),
});

export const postToDiscord = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) throw new Error("DISCORD_WEBHOOK_URL is not configured");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: data.content,
        allowed_mentions: { parse: ["everyone"] },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Discord webhook failed [${res.status}]: ${body}`);
      throw new Error(`Discord webhook failed [${res.status}]: ${body}`);
    }

    return { ok: true };
  });
