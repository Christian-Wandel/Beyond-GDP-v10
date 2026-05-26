## Stage 04 — Dashboard

Static single-file frontend. No build step. Reads JSON data files and renders ECharts bullet-chart panels grouped by MLSI pillar.

**Why no build system**: the dashboard ships as one HTML file plus a local ECharts library. Anyone can clone, open `index.html`, and ship it on any static host. Adding a build step (Vite, npm, etc.) trades away that property for marginal DX gains — don't.

**Known gotchas**: ECharts SVG renderer breaks if you call `chart.clear()` then `setOption()` to repopulate; use `chart.setOption({series: []}, true)` to "empty" a chart while preserving internal state (this is what `showNoData()` does). All metric panels read from `./data/` which is a mirror written by stage 03 — do not edit `./data/` directly, edits will be wiped on next merge.

## Inputs

- Layer 4 (working): `./data/*.json` — populated by stage 03 (16 JSON files)
- Layer 3 (reference): `../_config/dashboard-gauge-config.md` — ECharts gauge structure, thresholds, inverted-scale pattern
- Layer 3 (reference): `../_config/framework-definitions.md` — GDP+ 4-dial rationale, MLSI pillar definitions

## Process

```bash
cd "projects/Beyond GDP Project/04_dashboard"
python -m http.server 8080
# Open http://localhost:8080
```

Run stage 03 first if source data has changed.

## Outputs

Live browser dashboard at `http://localhost:8080`. Four dial panels:

| Panel | Indicators |
|-------|-----------|
| GDP | gdp |
| Well-Being & Agency | hdi, hale, uhc_coverage, neet, lu4, wage, productivity |
| Inequality | gdi, gii, mpi, poverty_rate |
| Future-Proof | ecological_footprint, co2, methane, material_footprint |
