/**
 * aggregates.js — HLEG Headline Aggregate Indicators
 *
 * Implements HLEG Option A (inequality-adjusted income, universal) and
 * Option B (country-custom penalization) as described in the UN HLEG report
 * "Counting What Counts: A Compass of Progress for People and Planet", 2026.
 *
 * Methodology: see _config/aggregate-methodology.md
 * Configuration: data/aggregate-presets.json (synced from _config/)
 *
 * Pure functions — no DOM. Call renderAggregateCard() for display.
 */

'use strict';

// ── Normalization helpers (identical to computeGNSD in index.html:2563-2576) ──

/**
 * Normalize a value where higher = better.
 * Returns 0–100. bad→0, mid→50, good→100 (linear interpolation).
 */
function normHigh(val, bad, mid, good) {
  if (val == null || !isFinite(val)) return null;
  if (val <= bad)  return 0;
  if (val <= mid)  return 50 * (val - bad) / (mid - bad);
  if (val <= good) return 50 + 50 * (val - mid) / (good - mid);
  return 100;
}

/**
 * Normalize a value where lower = better.
 * Returns 0–100. good→100, mid→50, bad→0 (linear interpolation).
 */
function normLow(val, good, mid, bad) {
  if (val == null || !isFinite(val)) return null;
  if (val <= good) return 100;
  if (val <= mid)  return 50 + 50 * (mid - val) / (mid - good);
  if (val <= bad)  return 50 * (bad - val) / (bad - mid);
  return 0;
}

/**
 * Apply normalization anchors from presets config.
 * @param {number} val - raw indicator value
 * @param {object} anchors - { type:'high'|'low', bad, mid, good } (high) or { type:'low', good, mid, bad }
 * @returns {number|null} normalized 0–100 score
 */
function applyAnchors(val, anchors) {
  if (anchors.type === 'high') return normHigh(val, anchors.bad, anchors.mid, anchors.good);
  if (anchors.type === 'low')  return normLow(val, anchors.good, anchors.mid, anchors.bad);
  return null;
}

// ── Data extraction helpers ──────────────────────────────────────────────────

/**
 * Extract raw indicator value from the Cache for a given indicator key.
 * Handles the special field names some indicators use (e.g. mpi.mpi, co2.co2_per_capita_tco2).
 */
function getRawValue(iso3, indicatorKey, Cache) {
  const sourceMap = {
    household_income:   { cache: 'household_income',  field: 'value' },
    gini:               { cache: 'gini',              field: 'value' },
    hale:               { cache: 'hale',              field: 'value' },
    pm25:               { cache: 'pm25',              field: 'value' },
    co2_per_capita:     { cache: 'co2',               field: 'co2_per_capita_tco2' },
    life_satisfaction:  { cache: 'life_satisfaction', field: 'value' },
    poverty_rate:       { cache: 'poverty_rate',      field: 'value' },
    mpi:                { cache: 'mpi',               field: 'mpi' },
  };
  const mapping = sourceMap[indicatorKey];
  if (!mapping) return null;
  const entry = Cache[mapping.cache]?.data?.[iso3];
  if (!entry) return null;
  const v = entry[mapping.field];
  return (v != null && isFinite(v)) ? v : null;
}

// ── Option A: Inequality-Adjusted Income ────────────────────────────────────

/**
 * Compute HLEG Option A: inequality-adjusted income score.
 *
 * Formula:
 *   adjustedIncome = income × (1 + (giniRef − giniCountry) / giniRef)
 *   score = normHigh(adjustedIncome, bad, mid, good)
 *
 * @param {string} iso3
 * @param {object} presets - parsed aggregate-presets.json
 * @param {object} Cache   - loaded data cache (same structure as index.html Cache)
 * @returns {object} { score, adjustedIncome, rawIncome, rawGini, adjustment, completeness, note }
 */
function computeOptionA(iso3, presets, Cache) {
  const cfg = presets.optionA;
  const anchors = presets.indicatorAnchors.household_income;
  const giniAnchors = presets.indicatorAnchors.gini;
  const giniRef = presets.globalAnchors.gini2022Median;

  const rawIncome = getRawValue(iso3, 'household_income', Cache);
  const rawGini   = getRawValue(iso3, 'gini', Cache);

  const missing = [];
  if (rawIncome == null) missing.push('household income');
  if (rawGini   == null) missing.push('Gini index');

  if (rawIncome == null) {
    return { score: null, completeness: { found: 0, total: 2, missing }, note: 'Insufficient data for Option A' };
  }

  // Apply inequality adjustment (if Gini missing, use unadjusted income)
  let adjustment = 1;
  let adjustedIncome = rawIncome;
  if (rawGini != null) {
    adjustment = 1 + (giniRef - rawGini) / giniRef;
    adjustedIncome = rawIncome * adjustment;
  }

  const score = normHigh(adjustedIncome, anchors.bad, anchors.mid, anchors.good);

  return {
    score: score != null ? Math.round(score * 10) / 10 : null,
    adjustedIncome: Math.round(adjustedIncome),
    rawIncome,
    rawGini,
    giniRef,
    adjustment: Math.round(adjustment * 1000) / 1000,
    completeness: {
      found: missing.length === 0 ? 2 : 1,
      total: 2,
      missing,
    },
  };
}

// ── Option B: Country-Custom Penalization ────────────────────────────────────

/**
 * Compute HLEG Option B: country-custom penalization aggregate.
 *
 * Formula:
 *   baseScore = Option A score
 *   for each dimension d:
 *     indicatorScore_d  = normalize(rawValue_d)
 *     benchmarkScore_d  = normalize(globalMedian_d)
 *     shortfall_d       = max(0, benchmarkScore_d − indicatorScore_d)
 *     penaltyFactor_d   = (shortfall_d / benchmarkScore_d) × weight_d
 *   finalScore = baseScore × ∏(1 − penaltyFactor_d)
 *
 * @param {string} iso3
 * @param {object} presets         - parsed aggregate-presets.json
 * @param {object} Cache
 * @returns {object} { score, baseScore, penalties, completeness }
 */
function computeOptionB(iso3, presets, Cache) {
  const optionAResult = computeOptionA(iso3, presets, Cache);
  if (optionAResult.score == null) {
    return { score: null, baseScore: null, penalties: [], completeness: optionAResult.completeness };
  }

  const countryConfig = presets.countryAggregates?.[iso3];
  if (!countryConfig) {
    return { score: null, baseScore: null, penalties: [], completeness: { found: 0, total: 0, missing: ['No country config'] } };
  }

  const dimensions = countryConfig.dimensions;
  const penalties = [];
  let missingDimensions = [];
  let foundCount = 0;

  // Global median lookup
  const medianMap = {
    hale:               presets.globalAnchors.hale2022Median,
    pm25:               presets.globalAnchors.pm252022Median,
    co2_per_capita:     presets.globalAnchors.co2PerCap2022Median,
    life_satisfaction:  presets.globalAnchors.lifeSatisfaction2022Median,
    poverty_rate:       presets.globalAnchors.povertyRate2022Median,
    mpi:                presets.globalAnchors.mpi2022Median,
  };

  for (const dim of dimensions) {
    const { indicator, weight } = dim;
    const anchors = presets.indicatorAnchors[indicator];
    if (!anchors) continue;

    const rawValue = getRawValue(iso3, indicator, Cache);

    if (rawValue == null) {
      missingDimensions.push(indicator);
      penalties.push({
        indicator,
        weight,
        rawValue: null,
        indicatorScore: null,
        benchmarkScore: null,
        penaltyFactor: 0,
        missing: true,
        rationale: dim.rationale,
      });
      continue;
    }

    foundCount++;
    const indicatorScore  = applyAnchors(rawValue, anchors);
    const globalMedian    = medianMap[indicator];
    const benchmarkScore  = globalMedian != null ? applyAnchors(globalMedian, anchors) : 50;

    let penaltyFactor = 0;
    let shortfall = 0;
    if (indicatorScore != null && benchmarkScore != null && benchmarkScore > 0) {
      shortfall = Math.max(0, benchmarkScore - indicatorScore);
      penaltyFactor = (shortfall / benchmarkScore) * weight;
    }

    penalties.push({
      indicator,
      weight,
      rawValue,
      indicatorScore: indicatorScore != null ? Math.round(indicatorScore * 10) / 10 : null,
      benchmarkScore: benchmarkScore != null ? Math.round(benchmarkScore * 10) / 10 : null,
      shortfall: Math.round(shortfall * 10) / 10,
      penaltyFactor: Math.round(penaltyFactor * 1000) / 1000,
      missing: false,
      rationale: dim.rationale,
    });
  }

  // Multiplicative penalization
  const baseScore = optionAResult.score;
  let finalScore = baseScore;
  for (const p of penalties) {
    finalScore *= (1 - p.penaltyFactor);
  }

  return {
    score: Math.round(finalScore * 10) / 10,
    baseScore,
    optionAResult,
    penalties,
    completeness: {
      found: foundCount,
      total: dimensions.length,
      missing: missingDimensions,
    },
    countryConfig,
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

/** Format a 0–100 score as a letter grade (A–F, US scale) */
function scoreToGrade(score) {
  if (score == null) return '—';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** Map score to color token */
function scoreToColor(score) {
  if (score == null) return '#8b8fa8';
  if (score >= 80) return '#22c55e';
  if (score >= 65) return '#f59e0b';
  if (score >= 50) return '#f97316';
  return '#ef4444';
}

/** Format indicator label for display */
function indicatorLabel(key) {
  const labels = {
    household_income:  'Household Income (proxy)',
    gini:              'Gini Index',
    hale:              'Healthy Life Expectancy',
    pm25:              'PM2.5 Air Quality',
    co2_per_capita:    'CO₂ per Capita (fossil)',
    life_satisfaction: 'Life Satisfaction',
    poverty_rate:      'Poverty Rate',
    mpi:               'Multidimensional Poverty',
  };
  return labels[key] || key;
}

/** Format raw value with unit for display */
function formatRawValue(key, val) {
  if (val == null) return 'N/A';
  const fmts = {
    household_income:  v => `$${Math.round(v).toLocaleString()}`,
    gini:              v => v.toFixed(1),
    hale:              v => `${v.toFixed(1)} yrs`,
    pm25:              v => `${v.toFixed(1)} µg/m³`,
    co2_per_capita:    v => `${v.toFixed(2)} t`,
    life_satisfaction: v => v.toFixed(2),
    poverty_rate:      v => `${v.toFixed(1)}%`,
    mpi:               v => v.toFixed(3),
  };
  return (fmts[key] || (v => v.toFixed(2)))(val);
}

/**
 * Render an aggregate card into a DOM container element.
 *
 * @param {HTMLElement} containerEl - target element
 * @param {'A'|'B'} optionType
 * @param {object} result - from computeOptionA() or computeOptionB()
 * @param {object} presets - parsed aggregate-presets.json
 * @param {string} iso3 - for Option B country name
 */
function renderAggregateCard(containerEl, optionType, result, presets, iso3) {
  if (!containerEl) return;

  const score = result.score;
  const grade = scoreToGrade(score);
  const color = scoreToColor(score);
  const isOptionA = optionType === 'A';

  const cfg = isOptionA ? presets.optionA : presets.countryAggregates?.[iso3];
  const title    = cfg?.name    ?? (isOptionA ? 'Inequality-Adjusted Income' : 'Country Aggregate');
  const subtitle = cfg?.method  ?? '';
  const { found, total, missing } = result.completeness ?? { found: 0, total: 0, missing: [] };
  const hasGap = missing.length > 0;

  // Score bar fill
  const pct = score != null ? Math.round(score) : 0;

  // Build breakdown rows
  let breakdownHtml = '';
  if (isOptionA) {
    const r = result;
    const adjSign = r.adjustment > 1 ? '+' : '';
    const adjPct  = r.adjustment != null ? `${adjSign}${((r.adjustment - 1) * 100).toFixed(1)}%` : 'N/A';
    breakdownHtml = `
      <div class="agg-breakdown">
        <div class="agg-breakdown-title">Breakdown</div>
        <div class="agg-row">
          <span class="agg-label">Income (GDP proxy)</span>
          <span class="agg-value">$${r.rawIncome != null ? Math.round(r.rawIncome).toLocaleString() : 'N/A'}</span>
        </div>
        <div class="agg-row">
          <span class="agg-label">Country Gini</span>
          <span class="agg-value">${r.rawGini != null ? r.rawGini.toFixed(1) : 'N/A'}</span>
        </div>
        <div class="agg-row">
          <span class="agg-label">Reference Gini (global median)</span>
          <span class="agg-value">${r.giniRef?.toFixed(1) ?? 'N/A'}</span>
        </div>
        <div class="agg-row agg-row-highlight">
          <span class="agg-label">Inequality adjustment</span>
          <span class="agg-value" style="color:${r.adjustment > 1 ? '#22c55e' : '#ef4444'}">${adjPct}</span>
        </div>
        <div class="agg-row agg-row-highlight">
          <span class="agg-label">Adjusted income</span>
          <span class="agg-value">$${r.adjustedIncome != null ? r.adjustedIncome.toLocaleString() : 'N/A'}</span>
        </div>
      </div>`;
  } else {
    const penalties = result.penalties ?? [];
    const penaltyRows = penalties.map(p => {
      const dirArrow = p.missing ? '—' : (p.penaltyFactor > 0 ? '▼' : '✓');
      const penaltyCss = p.missing ? 'color:#8b8fa8' : (p.penaltyFactor > 0.01 ? 'color:#ef4444' : 'color:#22c55e');
      const penaltyPct = p.missing ? 'missing' : `−${(p.penaltyFactor * 100).toFixed(1)}%`;
      return `
        <div class="agg-row ${p.missing ? 'agg-row-missing' : ''}">
          <span class="agg-label">${indicatorLabel(p.indicator)}</span>
          <span class="agg-value-group">
            <span class="agg-raw">${formatRawValue(p.indicator, p.rawValue)}</span>
            <span class="agg-penalty" style="${penaltyCss}" title="${p.rationale}">${dirArrow} ${penaltyPct}</span>
          </span>
        </div>`;
    }).join('');

    breakdownHtml = `
      <div class="agg-breakdown">
        <div class="agg-breakdown-title">Starting score: ${result.baseScore?.toFixed(1) ?? '—'} (Option A)</div>
        <div class="agg-row" style="opacity:0.5;font-size:11px;padding-bottom:4px">
          <span class="agg-label">Dimension</span>
          <span class="agg-value-group">
            <span class="agg-raw">Value</span>
            <span class="agg-penalty">Score penalty</span>
          </span>
        </div>
        ${penaltyRows}
      </div>`;
  }

  // Completeness badge
  const compBadge = hasGap
    ? `<span class="agg-completeness agg-completeness-warn">⚠ Score adjusted: ${total - found} of ${total} indicator${total - found > 1 ? 's' : ''} unavailable</span>`
    : `<span class="agg-completeness agg-completeness-ok">${found}/${total} indicators</span>`;

  // Methodology toggle (plain-language content per option and country)
  const methId = `meth-${optionType}-${iso3}`;

  const methOptionA = `
    <p><strong>What this measures:</strong> This score asks: <em>"How much real spending power does this country's average person have — and is that money distributed fairly?"</em> It starts with income per person, then adjusts it up or down based on inequality. A country where income is shared more equally than the global average gets a boost. A country where a small group holds most of the wealth gets a penalty.</p>
    <p><strong>How the adjustment works:</strong> We use the Gini index — a standard measure of income inequality where 0 means perfect equality and 100 means one person holds everything. The global average Gini in 2022 was ${presets.globalAnchors.gini2022Median}. If a country's Gini is below that (more equal), income is scaled up. If it's above (more unequal), income is scaled down. The adjusted figure is then placed on a 0–100 scale: $1,000/person or below scores 0; $80,000/person or above scores 100.</p>
    <p><strong>Same formula for all countries.</strong> This makes scores directly comparable across Denmark, Vietnam, and Kenya — a key advantage of Option A.</p>
    <p><em>Data note: uses GDP per capita as a proxy for household disposable income. True household disposable income is not available for most countries in the UN national accounts database.</em></p>`;

  const methOptionB = {
    DNK: `
      <p><strong>What this measures:</strong> Denmark starts from its Option A income score, then gets adjusted downward on areas where it falls short of the global average — weighted by how much Denmark's own national strategy says each area matters.</p>
      <p><strong>Denmark's four priority dimensions:</strong></p>
      <ul style="margin:6px 0 10px 16px;line-height:1.8">
        <li><strong>CO₂ emissions per person (35% weight):</strong> Denmark's Climate Act targets a 70% cut in greenhouse gas emissions by 2030. At roughly 5 tonnes of CO₂ per person, Denmark still emits more than twice the Paris-aligned target of 2 tonnes — its biggest structural gap. Highest weight.</li>
        <li><strong>Healthy life expectancy (25% weight):</strong> How many years a person can expect to live in good health. Denmark sits around 70 years — solid, but not exceptional for a wealthy country. A core output of Denmark's welfare state, tracked by Statistics Denmark and the OECD.</li>
        <li><strong>Life satisfaction (25% weight):</strong> Denmark consistently ranks among the world's happiest countries (Cantril scale 7.5/10). Subjective well-being is a primary national output in Danish policy documents.</li>
        <li><strong>Air quality — PM2.5 (15% weight):</strong> Fine particle pollution at 7.7 µg/m³ — below the WHO guideline of 15. Denmark performs well here; lower weight reflects this strength rather than a gap.</li>
      </ul>
      <p><strong>How the penalty works:</strong> For each dimension, if Denmark scores below the global 2022 average on that indicator, the shortfall reduces the overall score. The reductions multiply together — so falling short on two dimensions at once compounds, not just adds.</p>
      <p><strong>Why a global average — not a peer-group average?</strong> You might expect Denmark to be benchmarked against other wealthy countries, not the whole world. The UN expert group chose the global median deliberately: this aggregate is designed to sit alongside GDP in national accounts, and GDP uses the same denominator for every country. If the bar moves per country, you lose the ability to compare scores across them — which defeats the purpose. The trade-off is that the global median is a low bar for wealthy countries on some indicators (Denmark's HALE of 70 is well above the global median of 62.9, so no penalty there) and a tough bar on others (Denmark's CO₂ of 5t is above the global median of 2.5t, so a penalty applies even though Denmark emits far less than most rich nations). An alternative — benchmarking against high-income-country peers — would penalise Denmark more on health and reward it less on emissions. The HLEG acknowledged this trade-off but prioritised cross-country consistency for the headline aggregate.</p>
      <p><em>Weight source: Statistics Denmark national sustainability indicators; OECD How's Life 2024 Denmark; SGI Network 2024 Denmark Social Sustainability Report. Weights are dashboard authors' editorial interpretation — not official Danish government indices.</em></p>`,

    VNM: `
      <p><strong>What this measures:</strong> Vietnam starts from its Option A income score, then gets adjusted based on four dimensions that Vietnam's own national strategy identifies as the key challenges of its development transition.</p>
      <p><strong>Vietnam's four priority dimensions:</strong></p>
      <ul style="margin:6px 0 10px 16px;line-height:1.8">
        <li><strong>Poverty rate (30% weight):</strong> The share of the population living below the poverty line. Vietnam cut multidimensional poverty from 9.2% to 4.3% between 2016 and 2022 — real progress, but poverty reduction remains the primary stated objective of Vietnam's 2021–2030 Socio-Economic Development Strategy.</li>
        <li><strong>Healthy life expectancy (25% weight):</strong> At 65.4 years, Vietnam exceeds the global median but lags peers at its income level. The 2023 UN progress review flags expanding healthcare for vulnerable populations as a top remaining priority.</li>
        <li><strong>CO₂ emissions per person (25% weight):</strong> At 3.5 tonnes per person, Vietnam's emissions are rising as industry expands — already above the Paris-aligned 2-tonne target. Managing this tension between growth and emissions is explicitly named in national strategy documents.</li>
        <li><strong>Life satisfaction (20% weight):</strong> Vietnam scores 6.35 on the Cantril 0–10 scale — above the global average of 5.83. Reflects genuine social cohesion gains during the growth period. Social cohesion is a named strategic priority in Vietnam's development plan.</li>
      </ul>
      <p><strong>How the penalty works:</strong> For each dimension, if Vietnam falls below the global 2022 average, the shortfall reduces the overall score. Because Vietnam outperforms the global average on poverty and health compared to its income level, the Option B penalty is small — the composite stays close to Option A.</p>
      <p><strong>Why a global average — not a peer-group average?</strong> You might expect Vietnam to be benchmarked against lower-middle-income peers. The UN expert group chose the global median deliberately: this aggregate is designed to sit alongside GDP, and GDP uses the same denominator for every country. A shifting bar would make scores incomparable across countries. For Vietnam, the global median is a meaningful reference — its HALE of 65.4 is above the world median of 62.9 (no penalty), while its CO₂ of 3.5t is above the global median of 2.5t (small penalty). An income-group benchmark would set a tougher bar on health and a more lenient one on emissions. The HLEG acknowledged this trade-off but prioritised cross-country consistency for the headline aggregate.</p>
      <p><em>Weight source: Vietnam Socio-Economic Development Strategy 2021–2030; Vietnam Voluntary National Review 2023 (UN HLPF); Vietnam national SDG action plan. Weights are dashboard authors' editorial interpretation — not official Vietnamese government indices.</em></p>`,

    KEN: `
      <p><strong>What this measures:</strong> Kenya starts from its Option A income score, then gets penalized on four dimensions where it falls short of the global average — weighted by how central each is to Kenya's national development plan.</p>
      <p><strong>Kenya's four priority dimensions:</strong></p>
      <ul style="margin:6px 0 10px 16px;line-height:1.8">
        <li><strong>Poverty rate (35% weight):</strong> At 45.5%, nearly half of Kenya's population lives below the poverty line — more than double the global median of 20.7%. Kenya Vision 2030's Social Pillar names poverty elimination first. Highest weight.</li>
        <li><strong>Healthy life expectancy (30% weight):</strong> At 58.2 years, below the global median of 62.9. Kenya's Medium Term Plan IV identifies universal health coverage as the primary social sector priority. Healthcare is one of five named pillars in the government's economic transformation agenda.</li>
        <li><strong>Multidimensional poverty — MPI (20% weight):</strong> The MPI goes beyond income to count overlapping deprivations in health, education, and living standards. Kenya's MPI of 0.171 means roughly 17% of the population experience multiple simultaneous deprivations — income poverty alone understates the depth of the challenge.</li>
        <li><strong>Air quality — PM2.5 (15% weight):</strong> Fine particle pollution at 17.4 µg/m³ — above the WHO guideline of 15. As a primarily agricultural economy, air quality directly affects health and crop productivity. Included as an environmental resilience indicator; lower weight reflects it as a secondary gap relative to poverty and health.</li>
      </ul>
      <p><strong>How the penalty works:</strong> Kenya's large shortfalls on poverty and health compound multiplicatively — falling short on multiple dimensions simultaneously produces a much lower final score than any single penalty alone. This reflects the reality that deep, overlapping deprivations are harder to overcome than isolated gaps.</p>
      <p><strong>Why a global average — not a peer-group average?</strong> You might expect Kenya to be benchmarked against other low-income countries. The UN expert group chose the global median deliberately: this aggregate is designed to sit alongside GDP, and GDP uses the same denominator for every country. A shifting bar would make scores incomparable. For Kenya the global median is a demanding but honest benchmark — Kenya's poverty rate of 45.5% is more than double the world median of 20.7%, and its HALE of 58.2 years is below the world median of 62.9. Benchmarking against sub-Saharan African peers would make Kenya look stronger on both. The HLEG acknowledged this trade-off — for within-country communication a peer benchmark makes more narrative sense — but prioritised cross-country consistency for the headline aggregate.</p>
      <p><em>Weight source: Kenya Vision 2030 Social Pillar; Kenya Medium Term Plan IV 2023–2027; Bottom-Up Economic Transformation Agenda (BETA). Weights are dashboard authors' editorial interpretation — not official Kenyan government indices.</em></p>`,
  };

  const methContent = isOptionA
    ? methOptionA
    : (methOptionB[iso3] ?? `<p>HLEG Option B: starts from the Option A base score, then applies multiplicative penalties when non-monetary dimensions fall below the global 2022 median. Each penalty reduces the score proportionally to its assigned weight and the size of the shortfall.</p><p><em>Weight source: ${cfg?.weightSourceNote ?? 'national policy framework'}</em></p>`);

  containerEl.innerHTML = `
    <div class="agg-card">
      <div class="agg-header">
        <div class="agg-title-group">
          <span class="agg-badge">${isOptionA ? 'HLEG Option A' : 'HLEG Option B'}</span>
          <h3 class="agg-name">${title}</h3>
          <p class="agg-subtitle">${subtitle}</p>
        </div>
        <div class="agg-score-group">
          <div class="agg-score" style="color:${color}">${score != null ? score.toFixed(1) : '—'}</div>
          <div class="agg-grade" style="color:${color}">${grade}</div>
          <div class="agg-score-label">/ 100</div>
        </div>
      </div>

      <div class="agg-progress-bar">
        <div class="agg-progress-fill" style="width:${pct}%;background:${color}"></div>
      </div>

      <div class="agg-meta-row">
        ${compBadge}
      </div>

      ${breakdownHtml}

      <div class="agg-meth-toggle">
        <button class="agg-meth-btn" onclick="document.getElementById('${methId}').classList.toggle('agg-meth-open')">
          Methodology ▾
        </button>
        <div id="${methId}" class="agg-meth-content">
          ${methContent}
          <p class="agg-disclaimer">These composites are illustrative — they show how the HLEG aggregation logic works in practice, not an official ranking. The UN expert group reviewed multiple approaches but did not endorse a single method. The weights shown here are the dashboard authors' reading of cited national documents, not positions of those governments.</p>
        </div>
      </div>
    </div>`;
}

// ── Exports (module-style, also works as global in non-module context) ────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normHigh, normLow, computeOptionA, computeOptionB, renderAggregateCard };
} else {
  window.AggregatesLib = { normHigh, normLow, computeOptionA, computeOptionB, renderAggregateCard };
}
