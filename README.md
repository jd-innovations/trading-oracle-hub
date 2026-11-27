# Trade Compass

“You are building a professional trading intelligence platform called JD Trading Planner for an ES futures and SPX options trader who runs a Discord trading community.

The platform has two main modules:

Module 1 — ES Futures (Market Profile)
One Daily Plan is published every morning at 8:30 AM ET and posted to Discord. It is generated once and does not update. Each plan includes 3 upside targets, a pivot level, 3 downside targets, directional bias, and context narrative based on TPO/Market Profile analysis. After each RTH session closes at 4:00 PM, results are auto-scored and logged.

Module 2 — SPX Options (Iron Fly)
At 9:45 AM ET, an iron fly trade recommendation is generated based on GEX levels. Updates posted every 30 minutes through RTH session. All trades journaled.

*UI Requirements:

	•	Mobile first, fully responsive on desktop
	•	Dark mode default with light mode toggle
	•	Clean, dense, professional trading terminal aesthetic*

*Charting:
Use lightweight-charts (by TradingView, open source) for all chart rendering:

	•	ES price data on a 2-min candlestick chart with Daily Plan levels (T1/T2/T3 upside, pivot, T1/T2/T3 downside) plotted as horizontal lines
	•	Separate TPO profile panel for the current RTH session showing POC, VAH, VAL, and value area shading
	•	SPX chart for the Iron Fly module*

Six tabs:

1. Plan — today’s Daily Plan in exact format below, plus results scoring section
2. Analysis — TPO profile viewer, naked levels, structural flags (poor high/low, spikes, tails, single prints), balance zones
3. Iron Fly — SPX trade recommendation, GEX levels, 30-min update feed
4. Journal — trade log for ES plans and SPX iron flies, filterable by date and instrument
5. Performance — bias accuracy, T1/T2/T3 hit rates, extension hit rates, equity curve, rolling windows (L5/L10/L20/all)
6. Balance Zones — daily and weekly OTF detection, balance zone high/halfback/low, breakout status

Daily Plan display format (exact — never change this):

Daily Plan: ES2026
$ES FUTURES MM/DD/YYYY

T3↑ >> T2↑ >> T1↑
Daily Pivot: [price] / Now trading at [price]
T1↓ >> T2↓ >> T3↓
@everyone

Bias: Bullish/Bearish/Neutral — [one sentence reason]
Context: [2-3 sentences]
Events: [only if high-impact events today]


Daily Plan Results format (posted to Discord after session):

📊 Daily Plan Results — MM/DD/YYYY

Bias: [Bullish/Bearish/Neutral] [✅/❌]
Pivot [price]: [Held ✅ / Failed ❌]

↑ T1 [price]: [✅ Hit HH:MM / ❌ Missed]
↑ T2 [price]: [✅ Hit HH:MM / ❌ Missed]
↑ T3 [price]: [✅ Hit HH:MM / ❌ Missed]

↓ T1 [price]: [✅ Hit HH:MM / ❌ Missed]
↓ T2 [price]: [✅ Hit HH:MM / ❌ Missed]
↓ T3 [price]: [✅ Hit HH:MM / ❌ Missed]

Session: H [x] / L [x] / C [x]
Score: [x]/100
@everyone


**Build the shell UI only — no backend, no database, no API calls. Populate all sections with realistic ES futures dummy data. Dark mode default. Mobile first.”

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://trading-oracle-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5a54075d-efb7-4d73-b6f8-c276b8bc43f0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
