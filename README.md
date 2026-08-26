# Two Pennies live scores

The public screen remains a fixed 1920×1080 display with the existing live and evergreen backgrounds. It can now group matches by competition and, when two competitions overlap, show two compact scoreboards.

## Admin

Open `/admin.html` to manage:

- hybrid, ESPN-only or football-data-only source mode;
- Newcastle and England competitions;
- pre-match and post-match display windows;
- one or two simultaneous competition boards;
- competition marks and highlighted teams;
- source health and fallback status.

Settings are saved in Netlify Blobs and take effect without changing the public screen address.

## Netlify environment variables

- `SCORES_ADMIN_PASSWORD` — required to save admin settings. `ADMIN_PASSWORD` is accepted as a fallback.
- `FOOTBALL_DATA_API_KEY` — optional in ESPN-only mode; retained for hybrid and football-data modes.

## Source behaviour

- **Hybrid** prefers football-data for competitions present in the current account and uses ESPN for additional competitions or as a fallback.
- **ESPN only** makes no football-data requests and is intended to let the free feed be assessed before changing a subscription.
- **football-data only** never uses ESPN; unsupported competitions report a health warning and do not make the whole screen fail.

Each competition is cached independently. Live competitions refresh frequently, fixtures close to kick-off refresh more often, and idle competitions refresh only every six hours. A failed live refresh is never allowed to leave a stale live score on screen.

## Compatibility parameters

Old screen URLs remain usable:

- `?comps=PL,CL,EC,WC`
- `?max=5`
- `?pre=60`
- `?post=120`
- `?highlight=67`
- `?mode=live` or `?mode=welcome`
- `?debug=1`
