# TTP Scores (clean rebuild)

## Deploy (Netlify via GitHub)
1. Put the contents of this folder at the root of your GitHub repo.
2. In Netlify site settings, set environment variable:
   - `FOOTBALL_DATA_API_KEY` = your football-data.org token
3. Deploy.

## URLs / Params
- `/` shows the screen.
- `?debug=1` shows the debug panel + status dot.
- `?comps=PL,ELC,CL,WC,EC`
- `?max=5`
- `?pre=15` (minutes before KO to show upcoming)
- `?post=15` (minutes after estimated final whistle to keep results)
- `?highlight=67` (comma-separated team IDs to pin while live)

## Reliability behaviour
- Live matches refresh every 30 seconds.
- The function keeps only a short 35-second warm cache to control upstream usage.
- The cache is not a last-known-good store and is never updated from a failed request.
- If any selected competition fails or times out, the scores are cleared and the screen returns to its generic welcome slide.
- A failed competition is never silently omitted from an otherwise successful response.
