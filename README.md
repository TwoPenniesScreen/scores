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
- `?nufcId=67`

## Live reliability workaround
If football-data delays switching a match from TIMED->IN_PLAY, the front-end will **assume live**
for up to 3 hours after kickoff and show it anyway (labelled LIVE, scores blank if feed is blank).
