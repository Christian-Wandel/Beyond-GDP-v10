# Beyond GDP Dashboard — 3-Day Prototype Plan

## Context

Dashboard live at https://christian-wandel.github.io/Beyond-GDP-v10/ as a single ~3,635-line `index.html` with left-nav show/hide panels. All 34 data files present in `04_dashboard/data/` including 13 new Tier I indicators not yet rendered. Left-nav scales poorly as indicators grow; one giant HTML is hard to maintain.

**Goal:** split into one HTML per pillar + landing hub, integrate all Tier I indicators, ship a robust prototype in 3 days.

**Why now:** new data is ready, framework cutoffs are documented in `_config/framework-definitions.md` (reusable as-is), and the deploy pipeline is green.

---

## Overall Workflow — repeatable fix-then-build loop

Each step builds on the verified prior step. No skipping.

1. **Audit** — open file/data, confirm shape, list defects
2. **Isolate** — work on one pillar page at a time, do not touch others
3. **Fix one thing** — smallest unit (one indicator, one extracted function)
4. **Verify locally** — `python -m http.server 8080`, eyeball + console clean + URL param round-trip
5. **Commit + push** — small atomic commit, GitHub Pages auto-deploys
6. **Confirm live** — hard refresh GH Pages URL
7. **Move on** — next item only after live confirm

Rule: no step 3 without step 1. No step 7 without step 6.

---

## High-Level 3-Day Outline

### Day 1 — Foundation
- Audit `bii.json` (confirmed 174 countries, thresholds present — build the tile)
- Extract `js/core.js` from `index.html` (shared logic only)
- Build `environment.html` standalone — test the split pattern with the most-indicator pillar
- Deliverable: environment.html live on GH Pages, country switching via `?country=DNK` works

### Day 2 — Replicate pattern
- Build 4 more pillar pages using the Day 1 pattern: `opportunity.html`, `income.html`, `necessities.html`, `security.html`
- Integrate Tier I indicators into each pillar (mapping in handover)
- Update `aggregate.html` nav — retire `index.html#panel-X` hash routing, link direct to `<pillar>.html?country=<code>`
- Deliverable: 5 pillar pages live + aggregate.html updated

### Day 3 — Landing hub + Equity + polish
- Build `equity.html` (gdi, gii, gender_pay_ratio, ipv) — dedicated sixth-pillar page
- Rewrite `index.html` as landing hub: apex bar (gdp/hdi/household_income) + 6 pillar summary cards with traffic-light status + link to aggregate.html
- Cross-page link audit, country param propagation sweep, mobile sanity check
- Deliverable: shippable prototype, end-to-end demo (landing → pillar → aggregate → back)

---

## Critical Files

**Read-only references (do not duplicate logic):**
- `projects/Beyond GDP Project/04_dashboard/index.html` — source of shared JS to extract
- `projects/Beyond GDP Project/_config/framework-definitions.md` — per-indicator cutoffs (CO₂, LU4, NEET, MPI, HALE, UHC, etc.); reuse verbatim
- `projects/Beyond GDP Project/04_dashboard/aggregate.html` — nav shell pattern + post-Day-2 link update target
- `projects/Beyond GDP Project/04_dashboard/js/aggregates.js` — leave untouched, already complete

**Files to create:**
- `04_dashboard/js/core.js` — shared logic
- `04_dashboard/environment.html`, `opportunity.html`, `income.html`, `necessities.html`, `security.html`, `equity.html`
- `04_dashboard/index.html` — rewrite as landing hub (Day 3)

**Functions to reuse (extract verbatim from index.html, do not rewrite):**
- `chartTokens()` — index.html ~1850–1865
- `loadAll()` + `Cache` — index.html 1868–1881
- `computeGNSD()` + `normHigh`/`normLow` — index.html 2795–2870
- `buildDropdown()`, `loadCountry()`, `initSelector()` — index.html 3395–3485
- `initTooltips()`, `updateTooltips()` — index.html 3330–3390
- `initThemeToggle()` — index.html 3530–3544
- `window.__chartInstances` resize pattern — index.html 1912–1914

---

## Two Open Questions (kept visible — decide when relevant)

**Q1 — poverty_societal vs poverty_rate** (Day 2 income.html)
- Option A: replace `poverty_rate` with `poverty_societal` ($6.85/day, cross-country comparable)
- Option B: show both side-by-side on Income & Poverty page (national line + societal line)

**Q2 — Traffic-light thresholds on landing hub** (Day 3 index.html)
- Option A: reuse pillar's normalized average vs cutoffs from `_config/framework-definitions.md`
- Option B: define new hub-specific thresholds tuned for at-a-glance summary

---

## Traffic-Light Thresholds — Bullet Graphs (kept, with rationale)

Applied on GNSD-normalized score (0–1 scale, higher = better):

- **Green: score ≥ 0.67**
  - Rationale: top tercile of normalized range. Indicator at or above two-thirds of best-feasible benchmark. Signals "no policy action required this cycle." Aligns with MLSI convention of upper-third = adequate provisioning.

- **Yellow: 0.33 ≤ score < 0.67**
  - Rationale: middle tercile. Indicator progressing but below target. Signals "monitor; risk of regression." Wide band reflects uncertainty — neither comfortable nor failing.

- **Red: score < 0.33**
  - Rationale: bottom tercile. Indicator at or below one-third of benchmark. Signals "policy intervention warranted." Aligns with MLSI threshold for shortfall against minimum standard.

**Decision use:**
- Green → deprioritize, reallocate attention elsewhere
- Yellow → schedule review, track trend
- Red → flag for action, surface on landing hub badge

Tercile split is symmetric, defensible, and consistent with the per-indicator cutoffs already documented in `framework-definitions.md`. No new domain assumptions introduced.

---

## Tier I → Pillar Mapping (Day 2 integration reference)

| File | Pillar | Notes |
|------|--------|-------|
| `ghg_total.json` | EnS | All gases incl. LULUCF; complements co2.json |
| `bii.json` | EnS | 174 countries; thresholds red<70, amber 70–85, green ≥85 |
| `pm25.json` | EnS | 199 countries; SDG 11.6.2 |
| `produced_capital.json` | EnS | Net produced capital stock |
| `lbw.json` | EcS | Low birthweight % live births |
| `gini.json` | EcS | Wealth inequality proxy |
| `homicide_rate.json` | EcS | SDG 16.1.1 |
| `life_satisfaction.json` | EcS | Cantril ladder |
| `wvs_trust.json` | EcS | Generalised social trust |
| `wvs_gov_confidence.json` | EcS | Confidence in civil services |
| `drinking_water.json` | N | SDG 6.1.1 |
| `poverty_societal.json` | I | $6.85/day — see Q1 |
| `ipv.json` | Eq | SDG 5.2.1 |

---

## Decisions Locked

- **Equity gets dedicated `equity.html`** — sixth pillar page, parallel to other five
- **BII tile included on Day 1** — bii.json has usable data + thresholds
- **Country state via URL param `?country=DNK`** — not localStorage; shareable, survives refresh
- **Apex indicators (gdp/hdi/household_income) on landing hub only** — not duplicated on pillar pages
- **Hash routing retired Day 2** — aggregate.html links go direct to `<pillar>.html?country=<code>`
- **`js/aggregates.js` untouched** — already complete

---

## Verification

**Per pillar page (Days 1–3):**
1. Start local server: `python -m http.server 8080` in `04_dashboard/`
2. Open `http://localhost:8080/<pillar>.html?country=DNK`
3. Console clean (no errors, no 404s)
4. Country selector switches data + updates URL param via `history.replaceState`
5. Theme toggle re-renders charts correctly
6. Tooltips open/close, ARIA labels present
7. ECharts resize on window resize (not just panel switch — pages are now standalone)
8. Commit + push, hard-refresh GH Pages URL, confirm live

**End-to-end (Day 3 close):**
1. Land on index.html — 6 pillar cards visible with traffic-light status + apex bar
2. Click pillar card → lands on `<pillar>.html?country=DNK` with same country
3. Click "Aggregates" → aggregate.html with same country
4. Click pillar link in aggregate.html → returns to correct pillar page with country preserved
5. Mobile width sanity check (Chrome devtools, 375px)

---

## Day-by-Day Detail Plans

---

# Day 1 — Detailed Plan

## Goal
End of Day 1: `environment.html` live on GitHub Pages, fully functional standalone, with all 7 environment tiles working (co2, ecological_footprint, methane, **bii**, ghg_total, pm25, produced_capital). `js/core.js` exists and contains shared infra + environment render functions. `index.html` still works unchanged (uses old inline code — we don't break it on Day 1).

## Facts verified during exploration
- BII is **already implemented** in index.html (renderBii lines 2772–2827, tile lines 1746–1766, wired at line 3420). Day 1 BII work = port existing code, not build new.
- `?country=DNK` URL param is **not implemented** anywhere. We add it to core.js on Day 1.
- All render functions are self-contained — read `Cache.<name>?.data?.[iso3]`, call `chartXxx.setOption()`. Clean to extract.
- CSS is inline in `<style>` lines 22–1202. Environment.html will copy the full block (Day 2 will decide if we extract to `css/core.css`).
- Cache access pattern: `Cache.co2?.data?.[iso3]` — bracket notation for ISO3, optional chaining throughout.

## Architecture choice (Option C)
`js/core.js` on Day 1 contains:
- Shared infra: `Cache`, `loadAll()`, `chartTokens()`, `normHigh`, `normLow`, `computeGNSD`, `buildDropdown`, `initSelector`, `initTooltips`, `updateTooltips`, `initThemeToggle`
- **New** URL param helpers: `getCountryFromURL()`, `setCountryInURL(iso3)`
- Environment render fns: `renderCo2`, `renderFootprint`, `renderCh4`, `renderBii`, plus 3 new `renderGhgTotal`, `renderPm25`, `renderProducedCapital`
- Per-page hook: `loadCountry(iso3)` is **page-specific** (stays in environment.html) — calls only the env renders. Day 2 pillar pages call only their renders.

`environment.html` is thin: HTML shell (left-nav + 7 tile cards) + `<script>` block that imports `core.js`, runs `initCharts()` for 7 chart instances, defines page-specific `loadCountry(iso3)` calling the 7 env renders, then boots via `initSelector` + URL param read.

## Three commits — each verified live before next

### Commit 1 — `js/core.js` extracted; index.html still works
**Files modified:**
- Create `04_dashboard/js/core.js` — paste shared infra + env render fns (verbatim from index.html)
- Edit `04_dashboard/index.html` — replace extracted code blocks with `<script src="js/core.js"></script>` near top of body; remove the duplicated function definitions

**Critical:** index.html must still render identically after this commit. No visual changes, no behavior changes. Only refactor.

**Verification before push:**
1. `python -m http.server 8080` in `04_dashboard/`
2. Open `http://localhost:8080/index.html`
3. Console clean, no 404s
4. Country selector still works
5. All environment tiles still render for DNK, DEU, USA (3 spot-checks)
6. Theme toggle still works
7. Aggregate.html still works

**Push, hard-refresh GH Pages, confirm live.** Only then proceed to Commit 2.

### Commit 2 — `environment.html` shell + 4 ported tiles (co2, ecological_footprint, methane, bii)
**Files created:**
- `04_dashboard/environment.html` — copy left-nav shell from index.html, include CSS `<style>` block, 4 metric-card tiles (co2/ch4/footprint/bii markup pasted verbatim from index.html lines 1680–1766), thin `<script>` that imports `core.js` and wires the 4 renders

**URL param handling added:**
- `getCountryFromURL()` reads `new URLSearchParams(location.search).get('country')`, defaults to DNK
- `setCountryInURL(iso3)` uses `history.replaceState({}, '', \`?country=\${iso3}\`)`
- Country selector onChange calls `setCountryInURL` then `loadCountry`
- Page boot: `loadCountry(getCountryFromURL())`

**Verification before push:**
1. `http://localhost:8080/environment.html` — page loads
2. `http://localhost:8080/environment.html?country=DNK` — DNK selected, 4 tiles render correct values
3. Change country in selector — URL updates without reload, tiles re-render
4. Browser back button — country reverts (history works)
5. Console clean
6. Theme toggle works
7. Tooltips open/close
8. Resize window — ECharts resize

**Push, hard-refresh GH Pages, confirm live.** Only then proceed to Commit 3.

### Commit 3 — 3 new Tier I tiles on environment.html (ghg_total, pm25, produced_capital)
**Files modified:**
- `04_dashboard/js/core.js` — add `renderGhgTotal()`, `renderPm25()`, `renderProducedCapital()` (copy renderBii pattern). Add the 3 files to `loadAll()` fetch list.
- `04_dashboard/environment.html` — add 3 new `.metric-card` tiles + 3 chart instances in `initCharts()` + 3 render calls in `loadCountry()`

**Threshold sources (do not invent):**
- `ghg_total.json` — check JSON metadata for embedded thresholds; if absent, use co2-style placeholder pending framework-definitions update
- `bii.json` — embedded thresholds: red <70, amber 70–85, green ≥85
- `pm25.json` — WHO guideline 5 μg/m³ (green), 15 (amber), >25 (red). Confirm against `_config/framework-definitions.md` first.
- `produced_capital.json` — check JSON metadata; likely no universal threshold (it's a stock measure) — render as info-only bullet without traffic-light status, OR per-capita normalization (decide during build)

**Verification before push:**
1. All 7 tiles render for DNK, DEU, USA, IND (4 spot-checks across income levels)
2. New tiles show correct status colors
3. Tooltips on new tiles render with metric descriptions
4. Console clean, no 404s on new JSON files
5. Mobile width check (375px Chrome devtools)

**Push, hard-refresh GH Pages, confirm live.**

## Critical files (Day 1)
- **Create:** `04_dashboard/js/core.js`, `04_dashboard/environment.html`
- **Modify:** `04_dashboard/index.html` (refactor to use core.js, no behavior change)
- **Read-only:** `_config/framework-definitions.md` (threshold lookup), `04_dashboard/data/*.json`

## Functions to port verbatim (index.html line ranges)
- Shared infra: lines 1850–1881 (chartTokens, Cache, loadAll), 2795–2870 (computeGNSD + norms), 3330–3485 (tooltips + selector), 3530–3544 (theme)
- Env renders: 2244–2285 (renderFootprint), 2357–2393 (renderCo2), 2395–2435 (renderCh4), 2772–2827 (renderBii)

## Open question deferred to Day 1 build
- `produced_capital.json` traffic-light treatment — info-only or normalized per-capita? Decide during Commit 3 after inspecting the JSON.

## End-of-Day 1 success criteria
- environment.html live, 7 tiles working, URL param round-trip works
- index.html still works (refactor was lossless)
- core.js is the single source of truth for shared logic + env renders
- 3 atomic commits in git history, all green workflow runs
- Ready for Day 2: pattern proven, replicate for opportunity/income/necessities/security

---

# Day 2 — Detailed Plan

To be written at start of Day 2, after Day 1 lessons-learned review.

---

# Day 3 — Detailed Plan

To be written at start of Day 3, after Day 2 review.
