# GeoList — ZIP targeting workspace

Turns a geo ask ("CA, NY, Bergen County") into a clean, copy-ready ZIP list for
campaign setup. Runs entirely from local data files — no per-search API calls.

Three modes:

- **Build a ZIP list** — type geographies, or browse states and drill into
  counties. "Check all" selects every county in a state so you can uncheck the
  few you don't want.
- **Search by radius** — ZIPs whose ZCTA center point falls within N miles of a
  Census place.
- **Inspect ZIPs** — reverse lookup: paste ZIPs, get state/county/city, with
  unknown and malformed entries flagged rather than silently dropped.

Each mode keeps its own input. Pasting into Inspect never bleeds into Build.

## Data

| Source | Used for |
| --- | --- |
| [SimpleMaps US ZIP Codes Basic](https://simplemaps.com/data/us-zips) (v1.95.1) | ZIP → state/county/city, 47,239 rows / 33,782 unique ZIPs |
| Census 2025 Gazetteer | radius center points |

Both are CC BY 4.0 and committed under `public/data/`. Basic coverage is ZCTAs
only — unique-company, military, and PO-box-only ZIPs are excluded.

Rebuild the indexes with `npm run data:simplemaps` / `npm run data:radius`.

## Prerequisites

Node.js `>=22.13.0`

## Two build targets

The app is a single client component, which means it can ship either way:

```bash
npm install

npm run dev            # local development (vinext)
npm run build          # Cloudflare Worker bundle -> dist/
npm run build:static   # plain static site -> dist-static/
npm run preview:static # serve dist-static/ locally
```

`npm run build` emits a Cloudflare Worker and is what the OpenAI Sites
deployment uses. **GitHub Pages cannot run a Worker**, so Pages uses
`build:static`, which is a plain Vite build with the vinext and Cloudflare
plugins removed (see `vite.static.config.ts`).

The static build sets Vite `base: "./"` and resolves data files against
`document.baseURI`, so the same output works at a domain root or under a project
sub-path like `/geolist/` with no rebuild.

> On Windows, `npm run dev` and `npm run build` fail because their scripts use
> POSIX inline env-var syntax (`WRANGLER_LOG_PATH=... vinext dev`). Use
> `npx vinext dev` with `$env:WRANGLER_LOG_PATH` set separately, or run
> `npm run build:static`, which has no such prefix.

## GitHub Pages

`.github/workflows/deploy-pages.yml` builds `dist-static/` and publishes it on
every push to `main`. Enable it once under **Settings → Pages → Source: GitHub
Actions**.

Pages on a private repository requires a paid GitHub plan; on the free plan the
repository must be public.

## Performance notes

The dataset is 47k rows, so nothing in render may scan it. A single
`useMemo` pass builds every lookup the UI needs — counties per state, ZIPs per
county, ZIPs per state, ZIP reverse lookup, and name → place indexes for the
text resolver.

Two regressions this replaced, both of which froze or killed the tab:

- Per-county ZIP counts re-filtered all 47k places for every county on every
  render — ~300ms for Texas (257 counties), on every keystroke.
- The text resolver scanned all 47k places per input token, so an N-entry paste
  cost N × 47k comparisons.

County rows are `memo`ized with a stable `useCallback` toggle, so unchecking one
county re-renders one row instead of 257.

## Workspace auth headers (OpenAI Sites deployment only)

Signed-in visitors receive `oai-authenticated-user-id` and
`oai-authenticated-user-email`. Private Sites require every visitor to sign in;
public Sites may also have anonymous visitors, for whom neither header is
present. SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` (percent-encoded UTF-8, accompanied by
`oai-authenticated-user-full-name-encoding`). Treat the full name as optional
and fall back to email.

`app/chatgpt-auth.ts` holds helpers for optional or required ChatGPT sign-in:
`getChatGPTUser()`, `requireChatGPTUser(returnTo)`, `chatGPTSignInPath()`, and
`chatGPTSignOutPath()`. Dispatch owns `/signin-with-chatgpt`,
`/signout-with-chatgpt`, and `/callback` — do not implement app routes for those
reserved paths. None of this applies to the GitHub Pages build, which is fully
static and anonymous.
