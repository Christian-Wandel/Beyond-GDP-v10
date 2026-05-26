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

## Context
Day 1 proved the split pattern works: `js/core.js` holds shared infra + env render fns; `environment.html` is a thin shell with page-specific `loadCountry()` + `updateEnvTooltips()`. URL param round-trip (`?country=DNK`) is live. `index.html` still works unchanged.

Day 2 replicates that pattern for the other four core pillars and retires hash-routing in `aggregate.html`. Equity is held for Day 3 (dedicated `equity.html`).

## Goal
End of Day 2: `opportunity.html`, `income.html`, `necessities.html`, `security.html` all live on GH Pages. `aggregate.html` nav points to `<pillar>.html?country=<code>` instead of `index.html#panel-X`. Tier I indicators integrated per mapping below. `index.html` still works (unchanged this day).

## Facts verified during exploration
- Opportunity panel in index.html lines 1373–1455 has 3 tiles: `schooling`, `lu4`, `neet`. Render fns: `renderSchooling` (l. 2492), `renderLu4` (l. 2515), `renderNeet` (l. 2541). `schooling` reads from `Cache.hdi.data[iso3].mean_schooling`, not its own file.
- `learning_outcomes.json` exists (172 countries, World Bank HCI proxy for SDG 4.1.1). Thresholds embedded: red <420, amber <490, scale 300–625. Not yet rendered anywhere — new tile for Opportunity.
- `loadAll()` in core.js currently fetches a fixed list + `extraFiles` arg. Pattern: each new pillar page passes its Tier I additions via `loadAll([...])`.
- All four pages reuse the env-style left-nav, header, selector-bar, CSS block, init() boot pattern verbatim — only the `metric-grid` contents, `initCharts()` chart instances, page-specific `loadCountry()` render list, and page-specific tooltip-update fn differ.

## Tier I additions per pillar (Day 2 scope)

| Pillar page | Existing tiles (port verbatim) | New Tier I tile(s) | Files to fetch (loadAll extras) |
|-------------|--------------------------------|--------------------|---------------------------------|
| opportunity.html | schooling, lu4, neet | **learning_outcomes** (Tier I #8) | `learning_outcomes` |
| income.html | wage, prod, poverty | **poverty_societal** (Tier I #15) — Q1 decision: **show both** (national `poverty_rate` + societal `poverty_societal`) | `poverty_societal` |
| necessities.html | mpi, material_footprint | **drinking_water** (Tier I #13) | `drinking_water` |
| security.html | hale, uhc, household_income (current panel) | **lbw** (Tier I #7), **gini** (Tier I #14), **homicide_rate** (Tier I #9), **life_satisfaction** (Tier I #10), **wvs_trust** (Tier I #20), **wvs_gov_confidence** (Tier I #19) | `lbw`, `gini`, `homicide_rate`, `life_satisfaction`, `wvs_trust`, `wvs_gov_confidence` |

Note: `security.html` is large (~9 tiles). Build in two commits: existing tiles first, then Tier I additions. This mirrors Day 1's split for environment.

## Architecture choice
- All new pillar render functions move into `core.js` alongside the env renders. Single source of truth.
- Per-page `loadCountry(iso3, name)` stays inline in each HTML — calls only its pillar's renders + a page-specific `updateXTooltips()` (lives in core.js for symmetry with `updateEnvTooltips`).
- `loadAll()` base file list stays as-is; each page passes its additions via the extras arg.

## Q1 decided — show both poverty lines on income.html
Reason: cross-country comparability ($6.85/day societal) is valuable, but national `poverty_rate` is the legacy tile and may be more familiar to Danish ministerial readers. Side-by-side preserves both narratives.

## Day 2 commits — each verified live before next

### Commit 1 — opportunity.html (3 ported tiles + 1 new Tier I tile)
**Files modified/created:**
- `04_dashboard/js/core.js` — add `renderSchooling`, `renderLu4`, `renderNeet`, `renderLearningOutcomes`, and `updateOppTooltips(iso3, name)`. Port `renderSchooling/Lu4/Neet` verbatim from index.html lines 2492–2562. Build `renderLearningOutcomes` following `renderBii` pattern (file-embedded thresholds).
- `04_dashboard/opportunity.html` — copy environment.html as scaffold; swap header subtitle to "Work & Education"; swap `data-pillar="EnS"`→`"O"` on the active left-nav item; swap pillar tooltip text; replace metric-grid with 4 cards (schooling/lu4/neet/learning); `initCharts()` for 4 instances; `loadCountry()` calls 4 renders + `updateOppTooltips`; `loadAll(['learning_outcomes'])`.

**Pillar accent color:** left-nav active state for `data-pillar="O"` — add CSS rule in opportunity.html style block (mirror EnS orange pattern but with blue/teal for Opportunity; pick per existing convention used in index.html panel border — confirm during build).

**Verification before push:**
1. `python -m http.server 8080` in `04_dashboard/`
2. `http://localhost:8080/opportunity.html?country=DNK` — 4 tiles render
3. Spot check DEU, USA, AFG (varied coverage)
4. Country selector → URL param updates → tiles re-render
5. Theme toggle works
6. Tooltips drawer open/close + ARIA
7. Resize → ECharts resize
8. Console clean, no 404s
9. `learning_outcomes` tile shows correct status colors per embedded thresholds
10. Cross-link: clicking "Planet & Nature" in left-nav → environment.html loads with same country preserved

**Push, hard-refresh GH Pages, confirm live.** Then proceed.

### Commit 2 — income.html (3 ported + 1 new Tier I, with Q1 dual-poverty layout)
**Files modified/created:**
- `core.js` — add `renderWage`, `renderProductivity`, `renderPovertyRate`, `renderPovertySocietal`, `updateIncomeTooltips`. Port wage/prod/poverty from index.html (use Grep to locate exact line ranges).
- `income.html` — scaffold from environment.html; `data-pillar="I"`; 4 cards (wage, prod, poverty_rate, poverty_societal); `loadAll(['poverty_societal'])`. Layout: 2×2 grid (already responsive via existing CSS).

**Verification:** same per-page checklist as Commit 1, country spot-checks DNK/DEU/USA/IND.

**Push, confirm live.**

### Commit 3 — necessities.html (2 ported + 1 new Tier I)
**Files modified/created:**
- `core.js` — add `renderMpi`, `renderMaterialFootprint`, `renderDrinkingWater`, `updateNecessitiesTooltips`. Port mpi + material_footprint from index.html.
- `necessities.html` — scaffold; `data-pillar="N"`; 3 cards; `loadAll(['drinking_water'])`.

**Verification:** per-page checklist. Drinking water threshold: SDG 6.1.1 — verify against `_config/framework-definitions.md` during build.

**Push, confirm live.**

### Commit 4 — security.html shell + existing tiles (hale, uhc, household_income)
**Files modified/created:**
- `core.js` — add `renderHale`, `renderUhc`, `renderHouseholdIncome`, stub `updateSecurityTooltips`. Port from index.html.
- `security.html` — scaffold; `data-pillar="EcS"`; 3 cards initially; `loadAll()` no extras.

**Verification:** per-page checklist + console clean. Get the page live with the legacy tiles before piling on six new ones.

**Push, confirm live.**

### Commit 5 — security.html Tier I additions (6 new tiles)
**Files modified:**
- `core.js` — add `renderLbw`, `renderGini`, `renderHomicide`, `renderLifeSatisfaction`, `renderWvsTrust`, `renderWvsGovConfidence`. Extend `updateSecurityTooltips`. Use embedded JSON thresholds where present; cross-reference `_config/framework-definitions.md` for any gaps.
- `security.html` — extend metric-grid to 9 cards; `initCharts()` for 9 instances; extend `loadCountry()`; `loadAll(['lbw','gini','homicide_rate','life_satisfaction','wvs_trust','wvs_gov_confidence'])`.

**Note:** 9 tiles → 3×3 grid on desktop falls out of the existing CSS (`repeat(3, 1fr)`). Mobile reflow already handled.

**Verification:** all 9 tiles render for DNK/DEU/USA/AFG. Spot-check WVS coverage gap countries (most show "No data"). Console clean. Mobile width.

**Push, confirm live.**

### Commit 6 — aggregate.html nav update (retire hash routing)
**Files modified:**
- `04_dashboard/aggregate.html` — find left-nav block; replace any `href="index.html#panel-X"` patterns with `href="<pillar>.html?country=<current iso3>"`. Country param appended via JS at link-click time (or `history` push) so deep-links carry country state across pages.
- `aggregate.html` — confirm `js/aggregates.js` does NOT need changes (locked per Day 1 decisions). Only the nav HTML + a small param-propagation snippet (read `getCountryFromURL` → rewrite link `href`s on page boot and on selector change).

**Verification:**
1. Load `aggregate.html?country=DEU`
2. Click each pillar link in left-nav → lands on correct pillar page with `?country=DEU` preserved
3. Change country in aggregate selector → links update without page reload
4. Back-button reverts country (history works)

**Push, confirm live.**

## Critical files (Day 2)
- **Create:** `04_dashboard/opportunity.html`, `income.html`, `necessities.html`, `security.html`
- **Modify:** `04_dashboard/js/core.js` (add 15+ render fns + 4 tooltip-update fns), `04_dashboard/aggregate.html` (nav links + param propagation)
- **Untouched:** `index.html`, `js/aggregates.js`, all data files, all configs

## Functions to port verbatim (index.html line ranges)
- `renderSchooling` 2492–2513, `renderLu4` 2515–2539, `renderNeet` 2541–2562
- `renderWage` 2564–~2600 (confirm during build), `renderProductivity`, `renderPovertyRate`
- `renderMpi`, `renderMaterialFootprint`
- `renderHale`, `renderUhc`, `renderHouseholdIncome`
- Tooltip-body update blocks for each tile (mirror `updateEnvTooltips` structure)

## Open questions deferred to Day 2 build
- **Pillar accent colours** for left-nav active state per pillar code (O, I, N, EcS). Day 1 only defined EnS = orange. Pick from existing index.html panel/border conventions during Commit 1; document the four chosen colours inline in `core.js` so future pages can re-use.
- **security.html grid density** — 9 tiles is dense. If visual review during Commit 5 looks cramped, accept it for the prototype; polish on Day 3.

## End-of-Day 2 success criteria
- 4 new pillar pages live, country param round-trips on all
- `aggregate.html` cross-links to pillar pages with country preserved
- Tier I additions live: `learning_outcomes`, `poverty_societal`, `drinking_water`, plus six on security
- All commits in clean git history, GH Pages green
- Ready for Day 3: equity.html + landing hub + polish

---

# Day 3 — Detailed Plan

## Context
Day 1+2 delivered: `js/core.js` is the shared source-of-truth; `environment.html`, `opportunity.html`, `income.html`, `necessities.html`, `security.html` are all live with their pillar render fns; `aggregate.html` nav points to `<pillar>.html?country=<code>`. Tier I integrations done except equity. Legacy `index.html` still contains the giant overview hub + per-pillar panels (3552 lines) and is the next thing to replace.

Day 3 closes the prototype: build `equity.html` as the sixth pillar page, rewrite `index.html` as a landing hub with 6 pillar status cards + apex bar, sweep cross-page links, ship.

## Goal
End of Day 3:
- `equity.html` live on GH Pages with 4 tiles (gdi, gii, gender_pay_ratio, ipv).
- `index.html` rewritten as a thin landing hub — apex bar (gdp, hdi, household_income) on top, 6 pillar summary cards (Environment, Opportunity, Income, Necessities, Security, Equity) each showing pillar-average traffic-light status + a "view pillar" link. Footer link to aggregate.html. No giant panel HTML, no inline render fns — backed entirely by `core.js`.
- End-to-end demo path works: landing hub (DNK) → click pillar card → pillar page (?country=DNK) → click "Aggregates" → aggregate.html (?country=DNK) → back to a pillar page → back to landing hub with country preserved.
- Mobile sanity at 375px clean.

## Decisions locked (from clarifying questions)
- **Hub thresholds:** pillar score = mean of GNSD-normalised indicator scores using cutoffs in `_config/framework-definitions.md`. Tercile rule: Green ≥0.67, Yellow 0.33–0.67, Red <0.33. No new domain assumptions.
- **Old index.html:** fully replaced. Panel markup + inline scripts deleted. `index_standalone.html` already on disk serves as the backup; no second fallback needed.
- **Equity tiles:** gdi, gii, gender_pay_ratio, ipv. Drop loneliness for the prototype (Tier I #11 marked Red — no usable open source).

## Facts verified during exploration
- All four equity JSONs already exist in `04_dashboard/data/`. `gdi` and `gii` are already in `loadAll()` base list (core.js line 42); `gender_pay_ratio` + `ipv` need to be added (either to base list or via `extras` from equity.html).
- No equity render fns exist yet in `core.js` (grep confirmed). All four tiles are net-new render fns on Day 3.
- Current `index.html` has the apex bar (`#apex-bar`, lines ~1316–1345) and overview panel (`#panel-overview` line 1312) that we can lift the markup pattern from but the inline JS that drives them is the part we're retiring.
- `computeGNSD(iso3)` already exists in core.js (line 249) and is the right entry point for the per-pillar averaging. Hub will call it once per country switch and read its pillar breakdown rather than recomputing normalisations locally.
- Aggregate.html (post-Day-2 Commit 6) already propagates `?country=…` on its left-nav links. The landing hub follows the same pattern.

## Architecture
- `core.js` gains: `renderGdi`, `renderGii`, `renderGenderPayRatio`, `renderIpv`, `updateEquityTooltips`. Plus one new helper `computePillarStatus(iso3, pillarCode)` that returns `{score, level: 'green'|'amber'|'red', countedIndicators, missingIndicators}` for the landing hub cards. This helper wraps `computeGNSD`'s pillar breakdown and applies the tercile rule.
- `equity.html` is a thin shell mirroring `environment.html` / `opportunity.html`: same `<head>`, same CSS block, same left-nav, `data-pillar="Eq"`, four `.metric-card` tiles, `<script>` block that does `loadAll(['gender_pay_ratio','ipv'])` → `initCharts()` → `loadCountry(getCountryFromURL())` calling the four equity renders + `updateEquityTooltips`.
- `index.html` is rewritten: same `<head>` + CSS block as the pillar pages (consistent dark/light theming + selector bar). Body = header → country selector → apex bar (3 stat cells) → `.hub-grid` of 6 pillar status cards → footer link to `aggregate.html`. No left-nav (hub IS the nav). Page-specific `loadCountry(iso3, name)` updates apex values + 6 status cards by calling `computePillarStatus` six times. `loadAll(['gender_pay_ratio','ipv','poverty_societal','drinking_water','learning_outcomes','lbw','homicide_rate','life_satisfaction','wvs_trust','wvs_gov_confidence','ghg_total','pm25','produced_capital'])` so every indicator is in cache and pillar means are real, not partial.

## Four commits — each verified live before next

### Commit 1 — `equity.html` (4 tiles)
**Files modified/created:**
- `04_dashboard/js/core.js` — add `renderGdi`, `renderGii`, `renderGenderPayRatio`, `renderIpv`, `updateEquityTooltips`. Threshold sources:
  - `gdi.json` — UNDP convention: <0.95 red, 0.95–0.975 amber, ≥0.975 green (confirm against `_config/framework-definitions.md` first; if not present, document the chosen cutoff inline at top of render fn).
  - `gii.json` — UNDP convention: lower = better. Suggested: ≤0.10 green, 0.10–0.25 amber, >0.25 red. Same documentation rule.
  - `gender_pay_ratio.json` — ratio of 1.00 = parity. ≥0.95 green, 0.85–0.95 amber, <0.85 red.
  - `ipv.json` — Tier I #1 (SDG 5.2.1). WHO embedded thresholds if present; otherwise <10% green, 10–25% amber, >25% red (document inline).
- `04_dashboard/equity.html` — scaffold from `environment.html`; swap `<title>` → "Equity & Inclusion — Beyond GDP Dashboard"; `data-pillar="Eq"`; subtitle "Equality of opportunity and freedom from violence"; replace metric-grid with 4 cards; `initCharts()` for 4 instances; `loadCountry(iso3)` calls 4 renders + `updateEquityTooltips`; `loadAll(['gender_pay_ratio','ipv'])`.

**Verification before push:**
1. `python -m http.server 8080` in `04_dashboard/`
2. `http://localhost:8080/equity.html?country=DNK` — 4 tiles render
3. Spot-check DEU, USA, AFG, IND (varied gender-gap profiles)
4. Country selector → URL param updates → tiles re-render
5. Theme toggle works; tooltips open/close + ARIA; resize → ECharts resize
6. Console clean, no 404s
7. Cross-link: clicking "Planet & Nature" in left-nav → environment.html loads with same country preserved

**Push, hard-refresh GH Pages, confirm live.**

### Commit 2 — `computePillarStatus(iso3, pillarCode)` helper in core.js
**Files modified:**
- `04_dashboard/js/core.js` — add `computePillarStatus(iso3, pillarCode)`. Implementation: call `computeGNSD(iso3)` (already computes per-indicator normalised scores), filter the indicators by pillar code (`Eq`, `EnS`, `EcS`, `O`, `I`, `N`), take the arithmetic mean of available scores (skip null/no-data), apply tercile thresholds: ≥0.67 → `green`, ≥0.33 → `amber`, else `red`. If <50% of the pillar's indicators have data, return `{level: 'gray', score: null, ...}` instead of guessing.
- Add inline comment block documenting:
  - the tercile rationale (already in PROTOTYPE_PLAN.md "Traffic-Light Thresholds — Bullet Graphs"),
  - the 50% coverage floor,
  - which indicators map to which pillar code (single source of truth — pull from `_config/framework-definitions.md`).
- No HTML changes this commit. This is a pure refactor / helper addition.

**Verification before push:**
1. Open any existing pillar page (e.g., `environment.html?country=DNK`) — page still renders identically. The helper is unused so far; we're confirming the addition didn't break the existing render fns.
2. Browser console: manually call `computePillarStatus('DNK','EnS')`, `('AFG','EnS')`, `('USA','I')`, `('SOM','N')`. Confirm sensible levels + scores (eyeball against `aggregate.html` for the same country).
3. Manually call with a pillar code that has data gaps — confirm `gray` returns when coverage <50%.
4. Console clean.

**Push, confirm live.** (No visible change for users yet — this commit is infrastructure for Commit 3.)

### Commit 3 — Rewrite `index.html` as landing hub
**Files modified:**
- `04_dashboard/index.html` — full rewrite. Keep:
  - `<head>` (no-flash theme script, fonts, full CSS `<style>` block — same as pillar pages).
  - Country selector bar at top.
- Add new structure:
  - `<header>` with title "Beyond GDP" and one-line subtitle ("GDP+ framework — pillar status by country").
  - Apex bar (3 stat cells) mirroring current `#apex-bar` markup: `apex-gdp`, `apex-hdi`, `apex-household-income`. CSS already in scope (apex-bar styles lines 722–895 of legacy index.html — copy verbatim).
  - `.hub-grid` containing six `.pillar-card` elements: Environment (EnS), Opportunity (O), Income (I), Necessities (N), Security (EcS), Equity (Eq). Each card:
    - title + icon
    - large status badge (Green / Amber / Red / No Data) driven by `computePillarStatus`
    - one-line "X of Y indicators in scope" coverage line
    - "View pillar →" link to `<pillar>.html?country=<iso3>` (updated on each country change)
  - Footer with link to `aggregate.html?country=<iso3>`.
- Inline `<script>` block at end of body:
  - `import` `core.js`
  - `loadAll([...all Tier I extras...])`
  - `loadCountry(iso3, name)` updates apex bar values + iterates the six pillar codes calling `computePillarStatus(iso3, code)` → updates DOM (status badge class + label + coverage line + href on the "View pillar" link).
  - boot via `initSelector` + `getCountryFromURL`.
- Delete entirely: the legacy `#panel-overview`, `#panel-opportunity`, `#panel-income`, `#panel-necessities`, `#panel-security`, `#panel-environment`, `#panel-equity` markup blocks and all the inline render fns that drive them. They have moved (Day 1+2) into `core.js` already.

**CSS additions (inside the existing `<style>` block):**
- `.hub-grid` — CSS grid `repeat(auto-fit, minmax(280px, 1fr))`, gap 16px, max-width container.
- `.pillar-card` — surface background, border-radius, padding, hover-lift on `:hover`, status-tinted left border (4px) coloured by status level (`--green` / `--amber` / `--red` / `--text-subtle`).
- `.pillar-card-status` — large status pill, mirrors existing `.status-badge` classes.
- Mobile: single column at <600px (already covered by `auto-fit` minmax).

**Verification before push:**
1. `http://localhost:8080/index.html` — DNK loads, apex bar shows 3 values, 6 pillar cards render with correct status colours.
2. Spot-check DEU, USA, AFG, SOM, IND — colours plausible (eyeball against `aggregate.html` for same country).
3. Country selector → URL param updates → all 6 cards + apex re-render. "View pillar" links update to carry the new ISO3.
4. Click each pillar card → lands on correct `<pillar>.html?country=<iso3>` with country preserved.
5. Click footer → aggregate.html opens with country preserved.
6. From any pillar page, browser back → returns to landing hub with country still in URL.
7. Theme toggle works (cards and apex re-paint).
8. Console clean, no 404s, no references to deleted `#panel-X` IDs.
9. Mobile 375px: cards stack to single column, apex bar reflows vertically (legacy CSS at lines 883–885 already handles this).

**Push, confirm live.**

### Commit 4 — Cross-page sweep + polish
**Files modified:**
- `04_dashboard/aggregate.html` — if any left-nav item still points to `index.html#panel-*`, switch to `<pillar>.html?country=<iso3>`. Confirm post-Day-2 Commit 6 already did this; if so, no change needed.
- All six pillar pages (`environment.html`, `opportunity.html`, `income.html`, `necessities.html`, `security.html`, `equity.html`) — confirm the left-nav "Overview" / home link points to `index.html?country=<iso3>` (not to a stale `index.html#panel-overview` hash). Patch any stragglers.
- Add `equity.html` link to the left-nav in all five existing pillar pages if not already there (Day 2 may have left it out since equity was deferred).

**Verification — end-to-end demo path:**
1. `index.html?country=DEU` loads. All 6 cards show correct status.
2. Click Environment card → `environment.html?country=DEU` loads, tiles populated for Germany.
3. Click "Aggregates" in left-nav → `aggregate.html?country=DEU` loads.
4. Click "Equity & Inclusion" in aggregate left-nav → `equity.html?country=DEU` loads.
5. Browser back twice → back to landing hub with `?country=DEU` preserved.
6. Change country in landing hub selector to JPN → all 6 cards + apex update. Click any pillar → JPN preserved.
7. Mobile 375px sweep across landing hub + all 6 pillar pages + aggregate.html — no horizontal scroll, no clipped tiles.
8. Console clean across all 8 pages.

**Push, confirm live.** End of Day 3.

## Critical files (Day 3)
- **Create:** `04_dashboard/equity.html`
- **Modify:** `04_dashboard/js/core.js` (add 4 equity render fns + `computePillarStatus`), `04_dashboard/index.html` (full rewrite as landing hub), `04_dashboard/aggregate.html` + 5 existing pillar pages (left-nav sweep)
- **Untouched:** `js/aggregates.js`, all data files, all configs, all pillar render fns from Day 1+2

## Functions to reuse (do not rewrite)
- `computeGNSD(iso3)` — core.js line 249. Reuse for pillar averaging.
- `chartTokens()`, `loadAll()`, `Cache` — same shared infra all pages already use.
- `getCountryFromURL`, `setCountryInURL`, `initSelector`, `initThemeToggle`, `initTooltips` — all from Day 1.
- Status badge / card-class helpers (`setStatus`, classMap at core.js lines 95–118) — pillar cards reuse this so colours stay consistent with per-indicator tiles.

## Open questions deferred to Day 3 build
- **Apex bar values when household_income is missing** — fall back to GNI per capita (already in legacy apex). Decide during Commit 3 by checking the data files for top-15-by-population coverage.
- **GDI/GII embedded thresholds** — first action of Commit 1 is to open both JSONs and confirm. If absent, use UNDP conventions documented above and add an inline comment naming the source.
- **Loneliness tile** — left out per locked decision; revisit post-prototype if a licence becomes available.

## End-of-Day 3 success criteria
- Six pillar pages + landing hub + aggregate.html all live, country param round-trips on all eight pages.
- Tercile-based pillar status visible on landing hub for any country with ≥50% pillar coverage; gray badge otherwise.
- Legacy `index.html` panel HTML + inline render fns fully retired. `core.js` is the only place pillar-level rendering logic lives.
- Mobile sanity clean at 375px.
- Demo path works in one session without page reload (history-based country state, no localStorage).
