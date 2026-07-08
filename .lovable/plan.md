## Grade the previous day's plan; TPO shows yesterday's RTH session

### 1. Plan Results → previous session, not today

`computePlanResultsFn` currently picks the newest saved plan (which is today's, auto-generated on load) and tries to grade it. Today's RTH is usually incomplete, so it returns `no_session_bars` or half-formed hits.

**Change (`src/lib/plans.functions.ts`, `computePlanResultsFn`):**

```ts
// Compute today's ET date once.
const todayET = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);

let q = supabaseAdmin.from("daily_plans").select("*").eq("symbol", sym.id);
if (data?.planDate) {
  q = q.eq("plan_date", data.planDate);
} else {
  q = q.lt("plan_date", todayET);            // <-- previous sessions only
}
const { data: rows } = await q.order("plan_date", { ascending: false }).limit(1);
```

Everything downstream stays the same — it will fetch a 10-day Schwab window and grade the picked plan's `plan_date`.

**Panel copy (`src/routes/index.tsx`, `PlanResultsCard`):**
- Title stays `Plan Results — ${date}`. When the graded date is not today, the copy is already accurate.
- Empty-state text becomes: *"No prior plan to grade yet. Generate a plan today; results appear here tomorrow after RTH closes."* (drop the `authed` branch — irrelevant on server-graded flow).

### 2. TPO Profile → yesterday's RTH, never today's partial

`getPriorRthProfile` picks `sessions[length-2]` when >1 session exists. During RTH it works (today is last, yesterday is `length-2`). Before 09:30 ET or on non-trading days it picks the wrong day (today has no bars → yesterday becomes `length-1` and we return day-before-yesterday).

**Change (`src/lib/profile-levels.ts`, `getPriorRthProfile`):**

```ts
const todayET = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
const priorSessions = sessions.filter(s => s.dayKey < todayET);
if (!priorSessions.length) return null;
const session = priorSessions[priorSessions.length - 1];
```

Header label in `TpoProfile.tsx` stays `TPO · RTH ${profile.date}` so the user always sees which date is rendered.

### Files touched

- `src/lib/plans.functions.ts` — `.lt("plan_date", todayET)` when caller doesn't pin a date.
- `src/lib/profile-levels.ts` — pick most recent session strictly before today.
- `src/routes/index.tsx` — reword empty-state in `PlanResultsCard`.

### Verification

- Load `/` before 09:30 ET: TPO shows yesterday (e.g. 2026-07-07), not the day before.
- Load `/` mid-RTH: TPO still shows yesterday.
- Plan Results grades the most recent past-day plan (title date < today). Score/targets reflect a completed session.
- On day 1 of using the app (no prior plans): Plan Results shows the empty-state copy.
