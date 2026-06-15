## Change

Make every profile level (session POC/VAH/VAL/singles/poor H-L and the per-30m POCs) stop extending the instant a later bar's range touches the price. Remove the visual "dimmed but still drawn" treatment for broken levels — once touched, the ray simply ends there.

### Current behavior

- `findBreakRight` in `src/lib/profile-levels.ts` already uses a touch test (`b.low <= price <= b.high`), which is the desired rule.
- **Bug for 30m POCs:** `startTime` is set to the bucket start (`p.time`). The bars *inside* that 30m bucket — the bars that defined the POC — are later than `startTime`, so the very first one trivially "touches" the level and the ray collapses to a near-zero segment (or extends only to the next bucket if the POC sits at the bucket edge). Result: 30m POC rays look wrong / barely visible.
- Session levels start at `sess.end` (session close), so they behave correctly already, but they currently render dimmed-and-continued when `broken` is true in the primitive.

### Fix

**`src/lib/profile-levels.ts`**
- For 30m POCs, set `startTime` to the bucket *end* (`bucketStart + BRACKET_MIN * 60`), i.e. the moment the 30m candle closes. Pass that same value as the `startT` to `findBreakRight` so only bars *after* the candle close can break it. The level label keeps the candle's open time (`30m HH:MM`).
- Keep the existing touch rule (`b.low <= price <= b.high`) — it already matches "stop the moment price touches".

**`src/components/charts/ProfileLevelsPrimitive.ts`**
- Drop the `dim`/alpha treatment for `broken` levels. A broken level's `endTime` is the touch bar, so the ray naturally ends there at full opacity — no need to fade. Labels render at the (now shorter) right edge of the ray as today.

### Out of scope

- No change to the TPO math, VA expansion, singles, or poor H/L detection.
- No new UI, no config — behavior change only.
- SPX still skipped.
