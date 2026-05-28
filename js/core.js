// =============================================================================
// core.js — Shared infrastructure for Beyond GDP Dashboard
// Extracted from index.html. Contains:
//   - Theme tokens, data cache, normalization helpers
//   - GNSD composite score
//   - Country selector, tooltip drawer, theme toggle
//   - URL param helpers (getCountryFromURL / setCountryInURL)
//   - Environment pillar render functions (renderCo2, renderCh4, renderFootprint,
//     renderBii, renderGhgTotal, renderPm25, renderNaturalCapital)
//   - Opportunity pillar render functions (renderSchooling, renderLu4, renderNeet,
//     renderLearningOutcomes) + updateOppTooltips
//   - Income pillar render functions (renderWage, renderProd, renderPoverty,
//     renderPovertySocietal, renderProducedCapital) + updateIncomeTooltips
//   - Necessities pillar render functions (renderMpi, renderMatFp,
//     renderDrinkingWater) + updateNecessitiesTooltips
//   - Security pillar render functions (renderHale, renderUhc, renderHouseholdIncome,
//     renderLbw, renderGini, renderHomicide, renderLifeSatisfaction, renderWvsTrust,
//     renderWvsGovConfidence) + updateSecurityTooltips
// =============================================================================

// ── Theme tokens for ECharts (read live from CSS vars) ───────────────────────
function chartTokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, fallback) => (cs.getPropertyValue(n).trim() || fallback);
  return {
    text:     v('--chart-text',      '#e6e8f2'),
    textMid:  v('--chart-text-mid',  '#adb1c8'),
    textLow:  v('--chart-text-low',  '#8b8fa8'),
    grid:     v('--chart-grid',      'rgba(255,255,255,0.18)'),
    gridSoft: v('--chart-grid-soft', 'rgba(255,255,255,0.06)'),
    needleBorder: v('--chart-needle-border', '#141828'),
    red:      v('--red',             '#ef4444'),
  };
}

// ── Data cache ────────────────────────────────────────────────────────────────
const Cache = {};
window.CoreCache = Cache; // expose for aggregates.js on hub page
let lastGnsdResult = null;

async function loadAll(extraFiles = []) {
  const files = [
    'countries', 'ecological_footprint', 'hdi', 'gdp', 'co2', 'methane', 'gdi', 'gii',
    'mpi', 'material_footprint', 'lu4', 'neet', 'wage', 'productivity',
    'hale', 'uhc_coverage', 'poverty_rate', 'bii',
    ...extraFiles,
  ];
  await Promise.all(files.map(async (name) => {
    const res = await fetch(`data/${name}.json`);
    Cache[name] = await res.json();
  }));
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmt(n, decimals = 2) {
  if (n == null || !isFinite(n)) return 'N/A';
  return Number(n).toFixed(decimals);
}
function fmtBillion(n) {
  if (n == null || !isFinite(n)) return 'N/A';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(0) + 'M';
  return n.toFixed(0);
}
function fmtGni(n) {
  if (n == null || !isFinite(n)) return 'N/A';
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'k';
  return '$' + Math.round(n);
}

// ── No-data overlay helpers ───────────────────────────────────────────────────
function showNoData(el, chart) {
  if (chart) chart.setOption({ series: [] }, true);
  let ov = el.querySelector(':scope > .metric-nodata');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'metric-nodata';
    ov.innerHTML = '<div class="nd-icon">&#9680;</div><span>No data available</span>';
    el.appendChild(ov);
  }
  ov.style.display = 'flex';
}
function hideNoData(el) {
  const ov = el.querySelector(':scope > .metric-nodata');
  if (ov) ov.style.display = 'none';
}

// ── Zone helpers ──────────────────────────────────────────────────────────────
function makeZones(min, max, zoneDefs) {
  const total = max - min;
  return zoneDefs.map(z => [(z.maxVal - min) / total, z.color]);
}

// ── Status badge helpers ──────────────────────────────────────────────────────
function setStatus(id, level, label) {
  const el = document.getElementById(id);
  if (!el) return;
  const classMap = {
    green: 'status-green', 'green-dark': 'status-green-dark',
    amber: 'status-amber', red: 'status-red', gray: 'status-gray',
  };
  const labelMap = {
    green: 'On Target', 'green-dark': 'Net Sink',
    amber: 'Caution', red: 'Overshoot', gray: 'No Data',
  };
  el.className = 'status-badge ' + (classMap[level] || 'status-gray');
  el.textContent = label || labelMap[level] || '—';

  const cardEl = el.closest('[data-card]');
  if (cardEl) {
    cardEl.classList.remove('card-danger', 'card-amber', 'card-safe', 'card-sink', 'card-gray');
    const cardClassMap = {
      green: 'card-safe', 'green-dark': 'card-sink',
      amber: 'card-amber', red: 'card-danger', gray: 'card-gray',
    };
    if (cardClassMap[level]) cardEl.classList.add(cardClassMap[level]);
  }
}

// ── Bullet builder ────────────────────────────────────────────────────────────
function buildBulletOption({ value, min, max, zones, unitLabel, formatFn, vsText, vsColor, overflow, dangerMarkLine }) {
  const tk = chartTokens();
  const clampedValue = Math.max(min, Math.min(max, value));
  const valueColor = tk.text;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const zoneOpacity = isLight ? 0.55 : 0.42;

  const range = max - min;
  const zoneAreas = [];
  let prev = 0;
  for (const z of zones) {
    const pos = Array.isArray(z) ? z[0] : (z.maxVal - min) / range;
    const color = Array.isArray(z) ? z[1] : z.color;
    if (pos > prev) {
      zoneAreas.push([
        { xAxis: min + prev * range, itemStyle: { color, opacity: zoneOpacity } },
        { xAxis: min + pos * range },
      ]);
    }
    prev = pos;
  }

  return {
    backgroundColor: 'transparent',
    tooltip: { show: false, trigger: 'none', triggerOn: 'none' },
    axisPointer: { show: false },
    animation: true,
    animationDuration: 450,
    animationEasingUpdate: 'cubicOut',
    grid: { left: 14, right: 14, top: 36, bottom: 26, containLabel: false },
    xAxis: {
      type: 'value',
      min, max,
      splitNumber: 4,
      axisPointer: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: tk.textLow,
        fontSize: 10,
        hideOverlap: true,
        formatter: v => {
          const abs = Math.abs(v);
          if (abs >= 1000) return (v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'k';
          if (abs >= 10) return String(Math.round(v));
          if (abs >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
          return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
        },
      },
    },
    yAxis: {
      type: 'category',
      data: [''],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
    },
    series: [
      {
        type: 'bar',
        barWidth: 12,
        silent: true,
        emphasis: { disabled: true },
        data: [clampedValue],
        itemStyle: { color: valueColor, borderRadius: 2 },
        label: {
          show: true,
          position: 'top',
          color: valueColor,
          fontSize: 14,
          fontWeight: 600,
          formatter: () => (formatFn ? formatFn(value) : String(value)) + (overflow ? ' +' : ''),
          distance: 6,
        },
        markLine: (() => {
          const boundaries = zoneAreas.slice(0, -1).map(area => ({
            xAxis: area[1].xAxis,
            lineStyle: { color: tk.grid, width: 1, type: 'solid' },
            label: {
              show: true,
              position: 'end',
              formatter: p => {
                const v = p.value;
                const abs = Math.abs(v);
                if (abs >= 1000) return (v / 1000).toFixed(1) + 'k';
                if (abs >= 10) return String(Math.round(v));
                return v.toFixed(abs >= 1 ? 1 : 2);
              },
              color: tk.textLow,
              fontSize: 9,
              distance: 2,
            },
          }));
          if (dangerMarkLine != null) {
            boundaries.push({
              xAxis: dangerMarkLine,
              lineStyle: { color: tk.red, width: 2, type: 'dashed' },
              label: { show: false },
            });
          }
          if (overflow) {
            boundaries.push({
              xAxis: max,
              lineStyle: { color: tk.red, width: 2, type: 'solid' },
              label: { show: false },
            });
          }
          return {
            silent: true,
            symbol: boundaries.map((_, i) => overflow && i === boundaries.length - 1 ? 'arrow' : 'none'),
            symbolSize: [6, 8],
            data: boundaries,
          };
        })(),
        markArea: {
          silent: true,
          itemStyle: { borderWidth: 0 },
          emphasis: { disabled: true },
          data: zoneAreas,
        },
        z: 3,
      },
    ],
  };
}

// ── GNSD composite score ──────────────────────────────────────────────────────
function computeGNSD(iso3) {
  function normHigh(val, bad, mid, good) {
    if (val == null || !isFinite(val)) return null;
    if (val <= bad)  return 0;
    if (val <= mid)  return 50 * (val - bad) / (mid - bad);
    if (val <= good) return 50 + 50 * (val - mid) / (good - mid);
    return 100;
  }
  function normLow(val, good, mid, bad) {
    if (val == null || !isFinite(val)) return null;
    if (val <= good) return 100;
    if (val <= mid)  return 50 + 50 * (mid - val) / (mid - good);
    if (val <= bad)  return 50 * (bad - val) / (bad - mid);
    return 0;
  }
  const hdi   = Cache.hdi?.data?.[iso3];
  const lu4   = Cache.lu4?.data?.[iso3];
  const neet  = Cache.neet?.data?.[iso3];
  const wage  = Cache.wage?.data?.[iso3];
  const prod  = Cache.productivity?.data?.[iso3];
  const pov   = Cache.poverty_rate?.data?.[iso3];
  const mpi   = Cache.mpi?.data?.[iso3];
  const matfp = Cache.material_footprint?.data?.[iso3];
  const hale  = Cache.hale?.data?.[iso3];
  const uhc   = Cache.uhc_coverage?.data?.[iso3];
  const co2   = Cache.co2?.data?.[iso3];
  const eod   = Cache.ecological_footprint?.data?.[iso3];
  const bii   = Cache.bii?.data?.[iso3];

  const pillarO   = [normHigh(hdi?.mean_schooling, 8, 12, 15), normLow(lu4?.value, 5, 10, 25), normLow(neet?.value, 10, 15, 30)];
  const pillarI   = [normHigh(wage?.value, 15000, 35000, 60000), normHigh(prod?.value, 30000, 70000, 120000), normLow(pov?.value, 10, 20, 40)];
  const dw    = Cache.drinking_water?.data?.[iso3];
  const san   = Cache.sanitation?.data?.[iso3];
  const elec  = Cache.electricity?.data?.[iso3];
  const inet  = Cache.internet?.data?.[iso3];
  const pillarN   = [
    normLow(mpi?.mpi, 0.01, 0.1, 0.35),
    normHigh(dw?.value, 50, 75, 95),
    normHigh(san?.value, 50, 75, 95),
    normHigh(elec?.value, 60, 80, 98),
    normHigh(inet?.value, 20, 50, 90),
  ];
  const pillarEcS = [normHigh(hale?.value, 60, 70, 75), normHigh(uhc?.value, 70, 90, 100)];
  const eodNorm   = (eod?.ecological_footprint != null && eod?.biocapacity != null)
    ? normLow(eod.ecological_footprint, eod.biocapacity, eod.biocapacity * 1.5, eod.biocapacity * 3) : null;
  const pillarEnS = [normLow(co2?.co2_per_capita_tco2, 2, 7, 20), eodNorm, normHigh(bii?.value, 70, 85, 95)];

  function avgPillar(vals) {
    const valid = vals.filter(v => v != null);
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  }
  const pillarScores = {
    O:   avgPillar(pillarO),
    I:   avgPillar(pillarI),
    N:   avgPillar(pillarN),
    EcS: avgPillar(pillarEcS),
    EnS: avgPillar(pillarEnS),
  };
  const validPillarVals = Object.values(pillarScores).filter(v => v != null);
  if (!validPillarVals.length) return null;
  const mlsiAvg = validPillarVals.reduce((a, b) => a + b, 0) / validPillarVals.length;

  const allIndicators = [...pillarO, ...pillarI, ...pillarN, ...pillarEcS, ...pillarEnS];
  const indicatorCount = allIndicators.filter(v => v != null).length;
  const indicatorTotal = allIndicators.length;

  const gni = hdi?.gni_per_capita;
  let gdpNorm = null;
  if (gni != null && isFinite(gni) && gni > 0) {
    gdpNorm = Math.min(100, Math.max(0,
      (Math.log10(gni) - Math.log10(1000)) / (Math.log10(80000) - Math.log10(1000)) * 100));
  }
  let gnsd = gdpNorm != null ? 0.4 * gdpNorm + 0.6 * mlsiAvg : mlsiAvg;

  let ecoCapped = false;
  if (pillarScores.EnS != null && pillarScores.EnS < 40 && gnsd > 60) {
    gnsd = 60;
    ecoCapped = true;
  }

  return { gnsd, pillarScores, indicatorCount, indicatorTotal, ecoCapped };
}

// ── Country meta ──────────────────────────────────────────────────────────────
function updateMeta(iso3) {
  const countries = Cache.countries?.countries || [];
  const entry = countries.find(c => c.iso3 === iso3);
  const eod = Cache.ecological_footprint?.data?.[iso3];

  const regionEl = document.getElementById('meta-region');
  const incomeEl = document.getElementById('meta-income');
  const popEl    = document.getElementById('meta-pop');
  if (regionEl) regionEl.textContent = entry?.region ? `Region: ${entry.region}` : '';
  if (incomeEl) incomeEl.textContent = entry?.income_group ? `Income: ${entry.income_group}` : '';
  if (popEl)    popEl.textContent    = eod?.population_millions ? `Population: ${Number(eod.population_millions).toFixed(1)}M` : '';
}

// ── Country flag ──────────────────────────────────────────────────────────────
const ISO3_TO_ISO2 = {
  AFG:'af',ALB:'al',DZA:'dz',AND:'ad',AGO:'ao',ATG:'ag',ARG:'ar',ARM:'am',
  AUS:'au',AUT:'at',AZE:'az',BHS:'bs',BHR:'bh',BGD:'bd',BRB:'bb',BLR:'by',
  BEL:'be',BLZ:'bz',BEN:'bj',BTN:'bt',BOL:'bo',BIH:'ba',BWA:'bw',BRA:'br',
  BRN:'bn',BGR:'bg',BFA:'bf',BDI:'bi',CPV:'cv',KHM:'kh',CMR:'cm',CAN:'ca',
  CAF:'cf',TCD:'td',CHL:'cl',CHN:'cn',COL:'co',COM:'km',COD:'cd',COG:'cg',
  CRI:'cr',CIV:'ci',HRV:'hr',CUB:'cu',CYP:'cy',CZE:'cz',DNK:'dk',DJI:'dj',
  DOM:'do',ECU:'ec',EGY:'eg',SLV:'sv',GNQ:'gq',ERI:'er',EST:'ee',SWZ:'sz',
  ETH:'et',FJI:'fj',FIN:'fi',FRA:'fr',GAB:'ga',GMB:'gm',GEO:'ge',DEU:'de',
  GHA:'gh',GRC:'gr',GTM:'gt',GIN:'gn',GNB:'gw',GUY:'gy',HTI:'ht',HND:'hn',
  HUN:'hu',ISL:'is',IND:'in',IDN:'id',IRN:'ir',IRQ:'iq',IRL:'ie',ISR:'il',
  ITA:'it',JAM:'jm',JPN:'jp',JOR:'jo',KAZ:'kz',KEN:'ke',PRK:'kp',KOR:'kr',
  KWT:'kw',KGZ:'kg',LAO:'la',LVA:'lv',LBN:'lb',LSO:'ls',LBR:'lr',LBY:'ly',
  LIE:'li',LTU:'lt',LUX:'lu',MDG:'mg',MWI:'mw',MYS:'my',MDV:'mv',MLI:'ml',
  MLT:'mt',MRT:'mr',MUS:'mu',MEX:'mx',MDA:'md',MCO:'mc',MNG:'mn',MNE:'me',
  MAR:'ma',MOZ:'mz',MMR:'mm',NAM:'na',NPL:'np',NLD:'nl',NZL:'nz',NIC:'ni',
  NER:'ne',NGA:'ng',MKD:'mk',NOR:'no',OMN:'om',PAK:'pk',PAN:'pa',PNG:'pg',
  PRY:'py',PER:'pe',PHL:'ph',POL:'pl',PRT:'pt',QAT:'qa',ROU:'ro',RUS:'ru',
  RWA:'rw',WSM:'ws',SAU:'sa',SEN:'sn',SRB:'rs',SLE:'sl',SGP:'sg',SVK:'sk',
  SVN:'si',SLB:'sb',SOM:'so',ZAF:'za',SSD:'ss',ESP:'es',LKA:'lk',SDN:'sd',
  SUR:'sr',SWE:'se',CHE:'ch',SYR:'sy',TJK:'tj',TZA:'tz',THA:'th',
  TLS:'tl',TGO:'tg',TON:'to',TTO:'tt',TUN:'tn',TUR:'tr',TKM:'tm',UGA:'ug',
  UKR:'ua',ARE:'ae',GBR:'gb',USA:'us',URY:'uy',UZB:'uz',VUT:'vu',VEN:'ve',
  VNM:'vn',YEM:'ye',ZMB:'zm',ZWE:'zw',STP:'st',DMA:'dm',GRD:'gd',KIR:'ki',
  MHL:'mh',FSM:'fm',NRU:'nr',PLW:'pw',KNA:'kn',LCA:'lc',VCT:'vc',TUV:'tv',
  PSE:'ps',HKG:'hk',MAC:'mo',GRL:'gl',FRO:'fo',NCL:'nc',PYF:'pf',
  CUW:'cw',ABW:'aw',MTQ:'mq',GUF:'gf',REU:'re',MYT:'yt',SPM:'pm',
};

function updateFlag(iso3) {
  const flagEl = document.getElementById('country-flag');
  if (!flagEl) return;
  const iso2 = ISO3_TO_ISO2[iso3];
  if (iso2) {
    flagEl.src = `https://flagcdn.com/24x18/${iso2}.png`;
    flagEl.style.display = 'inline-block';
  } else {
    flagEl.style.display = 'none';
  }
}

// ── Info drawer ───────────────────────────────────────────────────────────────
function initTooltips() {
  let backdrop = document.querySelector('.drawer-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    document.body.appendChild(backdrop);
  }

  document.querySelectorAll('.metric-tooltip').forEach(t => {
    if (t.parentElement !== document.body) document.body.appendChild(t);
    t.setAttribute('role', 'dialog');
    t.setAttribute('aria-modal', 'false');
    const title = t.querySelector('.tooltip-title');
    if (title && !title.id) title.id = t.id + '-title';
    if (title) t.setAttribute('aria-labelledby', title.id);
  });

  let lastInvoker = null;
  function closeAll() {
    document.querySelectorAll('.metric-tooltip.open').forEach(t => t.classList.remove('open'));
    backdrop.classList.remove('open');
    document.body.classList.remove('drawer-open');
    if (lastInvoker && document.contains(lastInvoker)) lastInvoker.focus();
    lastInvoker = null;
  }
  function openDrawer(id, invoker) {
    const t = document.getElementById(id);
    if (!t) return;
    closeAll();
    t.classList.add('open');
    backdrop.classList.add('open');
    document.body.classList.add('drawer-open');
    lastInvoker = invoker || null;
    const close = t.querySelector('.tooltip-close');
    close?.focus();
    setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.info-btn');
    if (btn) {
      const id = btn.dataset.tooltip;
      const t = document.getElementById(id);
      if (t?.classList.contains('open')) closeAll();
      else openDrawer(id, btn);
      return;
    }
    const close = e.target.closest('.tooltip-close');
    if (close) { closeAll(); return; }
  });

  backdrop.addEventListener('click', closeAll);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
}

// ── Country search / dropdown ─────────────────────────────────────────────────
let currentISO = null, currentName = null;

function buildDropdown(filter = '') {
  const dropdown = document.getElementById('country-dropdown');
  if (!dropdown) return;
  const countries = Cache.countries?.countries || [];
  const q = filter.toLowerCase().trim();

  let items = countries;
  if (q) {
    const startsWith = countries.filter(c => c.name.toLowerCase().startsWith(q));
    const contains   = countries.filter(c => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
    items = [...startsWith, ...contains];
  }
  items = items.slice(0, 60);

  dropdown.innerHTML = items.map(c =>
    `<div class="dropdown-item" data-iso3="${c.iso3}" data-name="${c.name}">
      <span>${c.name}</span>
      <span class="item-tag">${c.iso3}</span>
    </div>`
  ).join('');

  dropdown.querySelectorAll('.dropdown-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // loadCountry is defined per-page — call via window to allow override
      if (typeof loadCountry === 'function') loadCountry(el.dataset.iso3, el.dataset.name);
      setCountryInURL(el.dataset.iso3);
      dropdown.classList.remove('open');
    });
  });
}

function initSelector() {
  const input    = document.getElementById('country-input');
  const dropdown = document.getElementById('country-dropdown');
  if (!input || !dropdown) return;

  input.addEventListener('focus', () => {
    buildDropdown(input.value);
    dropdown.classList.add('open');
  });
  input.addEventListener('input', () => {
    buildDropdown(input.value);
    dropdown.classList.add('open');
  });
  input.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.remove('open'), 150);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = dropdown.querySelector('.dropdown-item');
      if (first) {
        if (typeof loadCountry === 'function') loadCountry(first.dataset.iso3, first.dataset.name);
        setCountryInURL(first.dataset.iso3);
        dropdown.classList.remove('open');
      }
      e.preventDefault();
    }
  });
}

// ── URL param helpers ─────────────────────────────────────────────────────────
// Rewrite every cross-page link with `?country=<iso3>` so country state
// survives navigation. Targets pillar pages, aggregate, and index by .html ref.
function propagateCountryParam(iso3) {
  if (!iso3) return;
  const sel = 'a.left-nav-item[href*=".html"], a.left-nav-link[href*=".html"]';
  document.querySelectorAll(sel).forEach(a => {
    const base = a.getAttribute('href').split('?')[0].split('#')[0];
    a.setAttribute('href', `${base}?country=${iso3}`);
  });
}

function getCountryFromURL() {
  return new URLSearchParams(location.search).get('country') || 'DNK';
}

function setCountryInURL(iso3) {
  const url = new URL(location.href);
  url.searchParams.set('country', iso3);
  history.replaceState({}, '', url.toString());
}

// ── Theme toggle ──────────────────────────────────────────────────────────────
function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('bgdp-theme', next); } catch (e) {}
    if (window.__chartInstances) {
      window.__chartInstances.forEach(c => c && c.resize());
    }
    if (currentISO && typeof loadCountry === 'function') loadCountry(currentISO, currentName);
  });
}

// ── Keyboard shortcut: "/" focuses country search ─────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const t = e.target;
      const isInput = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!isInput) {
        e.preventDefault();
        document.getElementById('country-input')?.focus();
      }
    }
  });
}

// =============================================================================
// ── ENVIRONMENT PILLAR RENDER FUNCTIONS ──────────────────────────────────────
// =============================================================================

function renderFootprint(eodEntry) {
  const el = document.getElementById('gauge-footprint');
  if (!el) return;
  if (!eodEntry || eodEntry.ecological_footprint == null) {
    showNoData(el, window.chartFootprint);
    setStatus('footprint-status', 'gray');
    return;
  }
  hideNoData(el);

  const fp = eodEntry.ecological_footprint;
  const bc = eodEntry.biocapacity;
  const worldBc = 1.63;
  const threshold = bc != null ? bc : worldBc;
  const maxScale  = 20;

  const level = fp <= threshold ? 'green' : fp <= threshold * 1.5 ? 'amber' : 'red';
  const fpPct = Math.round((fp / threshold - 1) * 100);
  setStatus('footprint-status', level, level === 'green' ? null : 'Above Target');

  const footprintLimitLabel = document.getElementById('footprint-limit-label');
  if (footprintLimitLabel) {
    footprintLimitLabel.textContent = bc != null
      ? `Danger threshold: ${fmt(bc)} gha (your biocapacity)`
      : `Danger threshold: ${worldBc} gha (world avg biocapacity)`;
  }

  const zones = makeZones(0, maxScale, [
    { maxVal: threshold,       color: '#22c55e' },
    { maxVal: threshold * 1.5, color: '#f59e0b' },
    { maxVal: maxScale,        color: '#ef4444' },
  ]);

  const ratio = (fp / threshold).toFixed(1);
  const vsText  = fp <= threshold ? 'safe zone' : `×${ratio} above threshold`;
  const vsColor = fp <= threshold ? '#22c55e' : fp <= threshold * 1.5 ? '#f59e0b' : '#ef4444';

  const option = buildBulletOption({
    value: fp, min: 0, max: maxScale, zones,
    unitLabel: 'gha / person',
    formatFn: v => fmt(v, 2),
    vsText, vsColor,
  });
  window.chartFootprint.setOption(option, true);
}

function renderCo2(co2Entry) {
  const el = document.getElementById('gauge-co2');
  if (!el) return;
  if (!co2Entry || co2Entry.co2_per_capita_tco2 == null) {
    showNoData(el, window.chartCo2);
    setStatus('co2-status', 'gray');
    return;
  }
  hideNoData(el);

  const co2 = co2Entry.co2_per_capita_tco2;
  const parisLimit = 2.0;
  const maxScale = 20;

  const zones = makeZones(0, maxScale, [
    { maxVal: parisLimit, color: '#22c55e' },
    { maxVal: 7,          color: '#f59e0b' },
    { maxVal: maxScale,   color: '#ef4444' },
  ]);
  const level = co2 <= parisLimit ? 'green' : co2 <= 7 ? 'amber' : 'red';
  const co2Pct = Math.round((co2 / parisLimit - 1) * 100);
  setStatus('co2-status', level, level === 'green' ? null : 'Above Target');

  const ratio   = (co2 / parisLimit).toFixed(1);
  const vsText  = co2 <= parisLimit ? 'within Paris budget' : `×${ratio} above threshold`;
  const vsColor = co2 <= parisLimit ? '#22c55e' : co2 <= 7 ? '#f59e0b' : '#ef4444';

  const option = buildBulletOption({
    value: Math.min(co2, maxScale),
    min: 0, max: maxScale, zones,
    unitLabel: 't CO₂ / person',
    formatFn: () => fmt(co2, 1) + ' t',
    vsText, vsColor,
    overflow: co2 > maxScale,
  });
  window.chartCo2.setOption(option, true);
}

function renderCh4(ch4Entry) {
  const el = document.getElementById('gauge-ch4');
  if (!el) return;
  if (!ch4Entry || ch4Entry.ch4_per_capita_kg == null) {
    showNoData(el, window.chartCh4);
    setStatus('ch4-status', 'gray');
    return;
  }
  hideNoData(el);

  const ch4 = ch4Entry.ch4_per_capita_kg;
  const minScale = -250;
  const maxScale = 300;

  const zones = makeZones(minScale, maxScale, [
    { maxVal: 0,        color: '#16a34a' },
    { maxVal: 50,       color: '#22c55e' },
    { maxVal: 200,      color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);

  const level = ch4 < 0 ? 'green-dark' : ch4 < 50 ? 'green' : ch4 < 200 ? 'amber' : 'red';
  const ch4Pct = Math.round((ch4 / 50 - 1) * 100);
  setStatus('ch4-status', level, (level === 'green' || level === 'green-dark') ? null : 'Above Target');

  let vsText, vsColor;
  if (ch4 < 0)        { vsText = 'net sink';          vsColor = '#16a34a'; }
  else if (ch4 < 50)  { vsText = 'within safe range'; vsColor = '#22c55e'; }
  else if (ch4 < 200) { vsText = 'moderate level';    vsColor = '#f59e0b'; }
  else                { vsText = 'high emissions';    vsColor = '#ef4444'; }

  const displayVal = Math.min(Math.max(ch4, minScale), maxScale);
  const option = buildBulletOption({
    value: displayVal,
    min: minScale, max: maxScale, zones,
    unitLabel: 'kg CH₄ / person',
    formatFn: () => (ch4 < 0 ? '' : '+') + fmt(ch4, 1) + ' kg',
    vsText, vsColor,
  });
  window.chartCh4.setOption(option, true);
}

function renderBii(biiEntry) {
  const el = document.getElementById('gauge-bii');
  if (!el) return;
  if (!biiEntry || biiEntry.value == null) {
    showNoData(el, window.chartBii);
    setStatus('bii-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = biiEntry.value;
  const zones = makeZones(0, 100, [
    { maxVal: 70, color: '#ef4444' }, { maxVal: 85, color: '#f59e0b' },
    { maxVal: 95, color: '#86efac' }, { maxVal: 100, color: '#22c55e' },
  ]);
  const level = val >= 85 ? 'green' : val >= 70 ? 'amber' : 'red';
  const biiPct = Math.round((1 - val / 85) * 100);
  setStatus('bii-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 85 ? 'above target' : `${fmt(val / 85 * 100, 0)}% of 85% target`;
  const vsColor = val >= 85 ? '#22c55e' : val >= 70 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: val, min: 0, max: 100, zones,
    unitLabel: 'BII score', formatFn: v => fmt(v, 1), vsText, vsColor });
  window.chartBii.setOption(option, true);
}

// ── New Tier I: Total GHG Emissions ──────────────────────────────────────────
function renderGhgTotal(ghgEntry) {
  const el = document.getElementById('gauge-ghg');
  if (!el) return;
  if (!ghgEntry || ghgEntry.value == null) {
    showNoData(el, window.chartGhg);
    setStatus('ghg-status', 'gray');
    return;
  }
  hideNoData(el);

  const val = ghgEntry.value;  // MtCO2e total
  // Thresholds from meta: red 500, amber 100
  // Scale: 0–2000 MtCO2e. Most countries <500; giants (CHN ~14000, USA ~5500) overflow.
  const maxScale = 2000;
  const zones = makeZones(0, maxScale, [
    { maxVal: 100,      color: '#22c55e' },
    { maxVal: 500,      color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 100 ? 'green' : val <= 500 ? 'amber' : 'red';
  setStatus('ghg-status', level);

  const vsText  = val <= 100 ? 'low total' : val <= 500 ? 'medium total' : 'high total';
  const vsColor = val <= 100 ? '#22c55e' : val <= 500 ? '#f59e0b' : '#ef4444';

  const option = buildBulletOption({
    value: Math.min(val, maxScale),
    min: 0, max: maxScale, zones,
    unitLabel: 'MtCO₂e total (all gases)',
    formatFn: () => val >= 1000 ? `${(val / 1000).toFixed(1)}k Mt` : `${Math.round(val)} Mt`,
    vsText, vsColor,
    overflow: val > maxScale,
  });
  window.chartGhg.setOption(option, true);
}

// ── New Tier I: PM2.5 Air Pollution ──────────────────────────────────────────
function renderPm25(pm25Entry) {
  const el = document.getElementById('gauge-pm25');
  if (!el) return;
  if (!pm25Entry || pm25Entry.value == null) {
    showNoData(el, window.chartPm25);
    setStatus('pm25-status', 'gray');
    return;
  }
  hideNoData(el);

  const val = pm25Entry.value;
  const maxScale = 80;
  // WHO AQG 2021: 5 µg/m³ annual mean (green), 15 (amber threshold), 35 (red)
  const zones = makeZones(0, maxScale, [
    { maxVal: 5,        color: '#22c55e' },
    { maxVal: 15,       color: '#86efac' },
    { maxVal: 35,       color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 5 ? 'green' : val <= 15 ? 'green' : val <= 35 ? 'amber' : 'red';
  const pm25Pct = Math.round((val / 5 - 1) * 100);
  setStatus('pm25-status', level, level === 'green' ? null : 'Above Target');

  const vsText  = val <= 5 ? 'meets WHO guideline' : val <= 15 ? 'above WHO, below IT-3' : val <= 35 ? 'caution zone' : 'high pollution';
  const vsColor = val <= 5 ? '#22c55e' : val <= 15 ? '#86efac' : val <= 35 ? '#f59e0b' : '#ef4444';

  const option = buildBulletOption({
    value: Math.min(val, maxScale),
    min: 0, max: maxScale, zones,
    unitLabel: 'μg/m³ annual mean PM2.5',
    formatFn: v => fmt(v, 1) + ' µg',
    vsText, vsColor,
    overflow: val > maxScale,
    dangerMarkLine: 15,
  });
  window.chartPm25.setOption(option, true);
}

// ── Natural Capital (Environment pillar) ─────────────────────────────────────
// World Bank CWON NW.NCA.TOTL.PC — total natural capital per capita (USD).
// Covers forests, agricultural land, fisheries, fossil fuels, minerals,
// protected areas. Thresholds: red <$2k, amber <$10k, green ≥$10k.
function renderNaturalCapital(natEntry) {
  const el = document.getElementById('gauge-natcap');
  if (!el) return;
  if (!natEntry || natEntry.value == null) {
    showNoData(el, window.chartNatcap);
    setStatus('natcap-status', 'gray');
    return;
  }
  hideNoData(el);

  const val = natEntry.value;  // USD per capita
  const maxScale = 120000;
  const zones = makeZones(0, maxScale, [
    { maxVal: 2000,     color: '#ef4444' },
    { maxVal: 10000,    color: '#f59e0b' },
    { maxVal: 40000,    color: '#86efac' },
    { maxVal: maxScale, color: '#22c55e' },
  ]);
  const level = val >= 10000 ? 'green' : val >= 2000 ? 'amber' : 'red';
  const natPct = Math.round((1 - val / 10000) * 100);
  setStatus('natcap-status', level, level === 'green' ? null : 'Below Target');

  const vsText  = val >= 10000 ? 'above threshold' : val >= 2000 ? `${fmt(val / 10000 * 100, 0)}% of target` : 'severely depleted';
  const vsColor = val >= 10000 ? '#22c55e' : val >= 2000 ? '#f59e0b' : '#ef4444';

  const option = buildBulletOption({
    value: Math.min(val, maxScale),
    min: 0, max: maxScale, zones,
    unitLabel: 'natural capital / person (USD)',
    formatFn: () => fmtGni(val),
    vsText, vsColor,
  });
  window.chartNatcap.setOption(option, true);
}

// ── Net Produced Capital (Income pillar) ─────────────────────────────────────
function renderProducedCapital(capEntry) {
  const el = document.getElementById('gauge-capital');
  if (!el) return;
  if (!capEntry || capEntry.value == null) {
    showNoData(el, window.chartCapital);
    setStatus('capital-status', 'gray');
    return;
  }
  hideNoData(el);

  const val = capEntry.value;  // USD per capita
  const maxScale = 200000;
  // Thresholds from meta: red <10k, amber <50k
  const zones = makeZones(0, maxScale, [
    { maxVal: 10000,    color: '#ef4444' },
    { maxVal: 50000,    color: '#f59e0b' },
    { maxVal: 120000,   color: '#86efac' },
    { maxVal: maxScale, color: '#22c55e' },
  ]);
  const level = val >= 50000 ? 'green' : val >= 10000 ? 'amber' : 'red';
  const capPct = Math.round((1 - val / 50000) * 100);
  setStatus('capital-status', level, level === 'green' ? null : 'Below Target');

  const vsText  = val >= 50000 ? 'above threshold' : val >= 10000 ? `${fmt(val / 50000 * 100, 0)}% of target` : 'low capital base';
  const vsColor = val >= 50000 ? '#22c55e' : val >= 10000 ? '#f59e0b' : '#ef4444';

  const option = buildBulletOption({
    value: Math.min(val, maxScale),
    min: 0, max: maxScale, zones,
    unitLabel: 'net produced capital / person (USD)',
    formatFn: () => fmtGni(val),
    vsText, vsColor,
  });
  window.chartCapital.setOption(option, true);
}

// ── Tooltip content for environment pillar ────────────────────────────────────
function updateEnvTooltips(iso3, name) {
  const eod = Cache.ecological_footprint?.data?.[iso3];
  const co2 = Cache.co2?.data?.[iso3];
  const ch4 = Cache.methane?.data?.[iso3];
  const bii = Cache.bii?.data?.[iso3];
  const ghg = Cache.ghg_total?.data?.[iso3];
  const pm25 = Cache.pm25?.data?.[iso3];
  const nat = Cache.natural_capital?.data?.[iso3];
  const matfp = Cache.material_footprint?.data?.[iso3];

  const fpEl = document.getElementById('tooltip-footprint-body');
  if (fpEl) {
    if (eod?.ecological_footprint != null && eod?.biocapacity != null) {
      const fp = eod.ecological_footprint;
      const bc = eod.biocapacity;
      const ratio = (fp / bc).toFixed(1);
      const earths = eod.earths_required;
      if (fp > bc) {
        fpEl.innerHTML = `<strong>${name}'s</strong> footprint of <strong>${fmt(fp)} gha/person</strong> exceeds its own biocapacity of ${fmt(bc)} gha by <strong>${ratio}×</strong>${earths ? `, as if requiring <strong>${fmt(earths, 1)} Earths</strong> if everyone lived this way` : ''}. The country consumes more from nature than its land can regenerate each year.`;
      } else {
        fpEl.innerHTML = `<strong>${name}</strong> lives within its ecological means — its footprint of <strong>${fmt(fp)} gha/person</strong> stays below its own biocapacity of ${fmt(bc)} gha. The country's resource consumption is locally sustainable.`;
      }
    } else { fpEl.textContent = 'No ecological footprint data available for this country.'; }
  }

  const co2El = document.getElementById('tooltip-co2-body');
  if (co2El) {
    if (co2?.co2_per_capita_tco2 != null) {
      const c = co2.co2_per_capita_tco2;
      const ratio = (c / 2.0).toFixed(1);
      if (c <= 2.0) {
        co2El.innerHTML = `<strong>${name}</strong> emits <strong>${fmt(c, 1)} t CO₂/person</strong> from fossil fuels — within the 2.0 t/person budget consistent with limiting warming to 1.5°C. This is among the relatively few countries currently meeting the Paris Agreement's per-capita carbon target.`;
      } else {
        co2El.innerHTML = `<strong>${name}</strong> emits <strong>${fmt(c, 1)} t CO₂/person</strong> from fossil fuels — <strong>${ratio}× the Paris 1.5°C per-capita budget</strong> of 2.0 t. Significant emissions reductions are needed to align with global climate targets.`;
      }
    } else { co2El.textContent = 'No CO₂ emissions data available for this country.'; }
  }

  const ch4El = document.getElementById('tooltip-ch4-body');
  if (ch4El) {
    if (ch4?.ch4_per_capita_kg != null) {
      const m = ch4.ch4_per_capita_kg;
      if (m < 0) {
        ch4El.innerHTML = `<strong>${name}'s</strong> land use absorbs more methane than it emits, making it a <strong>net CH₄ sink</strong> (${fmt(m, 1)} kg/person). This is a positive indicator — forests or wetlands are sequestering more than agricultural activity releases.`;
      } else if (m < 50) {
        ch4El.innerHTML = `<strong>${name}</strong> emits <strong>${fmt(m, 1)} kg CH₄/person</strong> from land use — a low level below the 50 kg/person moderate threshold.`;
      } else if (m < 200) {
        ch4El.innerHTML = `<strong>${name}</strong> emits <strong>${fmt(m, 1)} kg CH₄/person</strong> from land use — a moderate level reflecting significant livestock or agricultural activity.`;
      } else {
        ch4El.innerHTML = `<strong>${name}</strong> emits <strong>${fmt(m, 1)} kg CH₄/person</strong> from land use — a high level driven by intensive livestock farming or land-use change.`;
      }
    } else { ch4El.textContent = 'No methane data available for this country.'; }
  }

  const biiEl = document.getElementById('tooltip-bii-body');
  if (biiEl) {
    if (bii?.value != null) {
      const v = bii.value;
      const yearStr = bii.year ? `; data year: ${bii.year}` : '';
      const base = `<strong>${name}'s</strong> Biodiversity Intactness Index (BII) is <strong>${fmt(v, 1)}</strong> — meaning roughly ${fmt(v, 0)}% of the wildlife and species that would naturally exist here are still present${yearStr}. Source: UK Natural History Museum, Newbold et al. (2016).`;
      let context;
      if (v >= 90)      context = `${name} is above the 90 planetary boundary — the minimum safe threshold for long-term ecosystem stability.`;
      else if (v >= 85) context = `${name} has crossed the 90 planetary boundary, though it remains above the 85 caution threshold.`;
      else if (v >= 70) context = `${name} is in the caution zone (70–85): biodiversity loss approaches hard-to-reverse ecosystem breakdown.`;
      else              context = `${name} has fallen below 70 — ecosystems risk breaking down in ways that are difficult or impossible to reverse.`;
      biiEl.innerHTML = `${base}<br><br>${context}`;
    } else { biiEl.textContent = 'No data available.'; }
  }

  const ghgEl = document.getElementById('tooltip-ghg-body');
  if (ghgEl) {
    if (ghg?.value != null) {
      const v = ghg.value;
      ghgEl.innerHTML = `<strong>${name}</strong> emits <strong>${v >= 1000 ? (v/1000).toFixed(1) + 'k' : Math.round(v)} MtCO₂e</strong> total (all gases incl. LULUCF). This is the most comprehensive greenhouse gas measure — including methane, N₂O, and fluorinated gases alongside CO₂. Threshold: below 100 MtCO₂e = low; 100–500 = medium; above 500 = high${ghg.year ? `; data year: ${ghg.year}` : ''}.`;
    } else { ghgEl.textContent = 'No total GHG data available for this country.'; }
  }

  const pm25El = document.getElementById('tooltip-pm25-body');
  if (pm25El) {
    if (pm25?.value != null) {
      const v = pm25.value;
      const who = 5;
      const ratio = (v / who).toFixed(1);
      if (v <= 5) {
        pm25El.innerHTML = `<strong>${name}</strong> has a mean PM2.5 concentration of <strong>${fmt(v, 1)} µg/m³</strong> — meeting the WHO 2021 Air Quality Guideline of 5 µg/m³. This is among the cleanest air in the world.`;
      } else {
        pm25El.innerHTML = `<strong>${name}</strong> has a mean PM2.5 concentration of <strong>${fmt(v, 1)} µg/m³</strong> — <strong>${ratio}× the WHO 2021 guideline</strong> of 5 µg/m³. PM2.5 is a major driver of cardiovascular and respiratory disease${pm25.year ? `; data year: ${pm25.year}` : ''}.`;
      }
    } else { pm25El.textContent = 'No PM2.5 data available for this country.'; }
  }

  const natEl = document.getElementById('tooltip-natcap-body');
  if (natEl) {
    if (nat?.value != null) {
      const v = nat.value;
      const yr = nat.year ? `; data year: ${nat.year}` : '';
      let context;
      if (v >= 40000)      context = `${name} holds very high natural capital — large forests, agricultural land, mineral or fossil fuel wealth per person.`;
      else if (v >= 10000) context = `${name} has a substantial natural capital base, supporting ecosystem services and resource-based livelihoods.`;
      else if (v >= 2000)  context = `${name} has a limited natural capital base. Resource depletion or small land area may constrain long-term ecological resilience.`;
      else                 context = `${name} has very low natural capital per capita — high risk of resource scarcity and ecosystem service loss.`;
      natEl.innerHTML = `<strong>${name}'s</strong> total natural capital is <strong>${fmtGni(v)} per person</strong> — the monetary value of forests, agricultural land, fisheries, fossil fuels, minerals, and protected areas (World Bank CWON 2021, series NW.NCA.TOTL.PC)${yr}. Natural capital is distinct from produced capital (machinery, buildings); together they make up a country's total wealth base.<br><br>${context}`;
    } else { natEl.textContent = 'No natural capital data available for this country.'; }
  }

  const matFpEl = document.getElementById('tooltip-matfp-body');
  if (matFpEl) {
    if (matfp?.mf_per_capita_t != null) {
      const v = matfp.mf_per_capita_t;
      const ratio = (v / 8).toFixed(1);
      matFpEl.innerHTML = `<strong>${name}'s</strong> material footprint is <strong>${fmt(v, 1)} t/person</strong>. The UNEP safe range is 8 t/person; the danger threshold is 16 t/person${v > 8 ? ` — this is <strong>${ratio}×</strong> the safe range` : ''}. Material footprint includes all biomass, fossil fuels, metals, and non-metallic minerals embodied in domestic final demand. Source: UNEP.`;
    } else { matFpEl.textContent = 'No material footprint data available.'; }
  }
}

// =============================================================================
// Opportunity pillar render functions
// Ported verbatim from index.html (renderSchooling 2492-2513, renderLu4 2515-2539,
// renderNeet 2541-2562). renderLearningOutcomes is new (Tier I #8).
// =============================================================================

function renderSchooling(hdiEntry) {
  const el = document.getElementById('gauge-schooling');
  if (!el) return;
  if (!hdiEntry || hdiEntry.mean_schooling == null) {
    showNoData(el, window.chartSchooling);
    setStatus('schooling-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = hdiEntry.mean_schooling;
  const maxScale = 16;
  const zones = makeZones(0, maxScale, [
    { maxVal: 8, color: '#ef4444' }, { maxVal: 12, color: '#f59e0b' },
    { maxVal: 15, color: '#86efac' }, { maxVal: maxScale, color: '#22c55e' },
  ]);
  const level = val >= 12 ? 'green' : val >= 8 ? 'amber' : 'red';
  const schlPct = Math.round((1 - val / 12) * 100);
  setStatus('schooling-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 12 ? 'on target' : `${fmt(val / 12 * 100, 0)}% of target`;
  const vsColor = val >= 12 ? '#22c55e' : val >= 8 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: 'mean years of school', formatFn: v => fmt(v, 1) + ' yrs', vsText, vsColor });
  window.chartSchooling.setOption(option, true);
}

function renderLu4(lu4Entry) {
  const el = document.getElementById('gauge-lu4');
  if (!el) return;
  if (!lu4Entry || lu4Entry.value == null) {
    showNoData(el, window.chartLu4);
    setStatus('lu4-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = lu4Entry.value;
  const maxScale = 60;
  const zones = makeZones(0, maxScale, [
    { maxVal: 5, color: '#22c55e' }, { maxVal: 10, color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 5 ? 'green' : val <= 10 ? 'amber' : 'red';
  const lu4Pct = Math.round((val / 5 - 1) * 100);
  setStatus('lu4-status', level, level === 'green' ? null : 'Above Target');
  const vsText  = val <= 5 ? 'safe zone' : `${fmt(val / 10 * 100, 0)}% of danger threshold`;
  const vsColor = val <= 5 ? '#22c55e' : val <= 10 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: '% labour underutilized', formatFn: v => fmt(v, 1) + '%', vsText, vsColor, dangerMarkLine: 10 });
  window.chartLu4.setOption(option, true);
  if (lu4Entry.year) {
    const footer = document.querySelector('[data-card="lu4"] .limit-label span');
    if (footer) footer.textContent = `Danger: 10% (lower is better; ${lu4Entry.year})`;
  }
}

function renderNeet(neetEntry) {
  const el = document.getElementById('gauge-neet');
  if (!el) return;
  if (!neetEntry || neetEntry.value == null) {
    showNoData(el, window.chartNeet);
    setStatus('neet-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = neetEntry.value;
  const maxScale = 60;
  const zones = makeZones(0, maxScale, [
    { maxVal: 10, color: '#22c55e' }, { maxVal: 15, color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 10 ? 'green' : val <= 15 ? 'amber' : 'red';
  const neetPct = Math.round((val / 10 - 1) * 100);
  setStatus('neet-status', level, level === 'green' ? null : 'Above Target');
  const vsText  = val <= 10 ? 'safe zone' : `${fmt(val / 15 * 100, 0)}% of danger threshold`;
  const vsColor = val <= 10 ? '#22c55e' : val <= 15 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: '% youth NEET (15–24)', formatFn: v => fmt(v, 1) + '%', vsText, vsColor, dangerMarkLine: 15 });
  window.chartNeet.setOption(option, true);
}

// New Tier I #8 — World Bank HCI Harmonized Test Scores (proxy for SDG 4.1.1)
// Scale 300-625; embedded thresholds: red <420, amber <490.
function renderLearningOutcomes(loEntry) {
  const el = document.getElementById('gauge-learning');
  if (!el) return;
  if (!loEntry || loEntry.value == null) {
    showNoData(el, window.chartLearning);
    setStatus('learning-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = loEntry.value;
  const minScale = 300, maxScale = 625;
  const zones = makeZones(minScale, maxScale, [
    { maxVal: 420, color: '#ef4444' },
    { maxVal: 490, color: '#f59e0b' },
    { maxVal: 550, color: '#86efac' },
    { maxVal: maxScale, color: '#22c55e' },
  ]);
  const level = val >= 490 ? 'green' : val >= 420 ? 'amber' : 'red';
  const loPct = Math.round((1 - val / 490) * 100);
  setStatus('learning-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 490 ? 'above OECD benchmark' : val >= 420 ? `${fmt(val / 490 * 100, 0)}% of benchmark` : 'below minimum proficiency';
  const vsColor = val >= 490 ? '#22c55e' : val >= 420 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({
    value: Math.max(minScale, Math.min(val, maxScale)),
    min: minScale, max: maxScale, zones,
    unitLabel: 'harmonized test score',
    formatFn: v => fmt(v, 0),
    vsText, vsColor,
    dangerMarkLine: 420,
  });
  window.chartLearning.setOption(option, true);
}

// ── Tooltip content for opportunity pillar ────────────────────────────────────
function updateOppTooltips(iso3, name) {
  const hdi = Cache.hdi?.data?.[iso3];
  const lu4 = Cache.lu4?.data?.[iso3];
  const neet = Cache.neet?.data?.[iso3];
  const lo = Cache.learning_outcomes?.data?.[iso3];

  const schoolingEl = document.getElementById('tooltip-schooling-body');
  if (schoolingEl) {
    if (hdi?.mean_schooling != null) {
      const v = hdi.mean_schooling;
      schoolingEl.innerHTML = `<strong>${name}'s</strong> population averages <strong>${fmt(v, 1)} years of schooling</strong> among adults aged 25+. The MLSI target is 12 years (upper secondary completion). This is one of the three components driving Pillar O (Opportunity) scores. Source: UNDP Human Development Report 2025.`;
    } else { schoolingEl.textContent = 'No data available.'; }
  }

  const lu4El = document.getElementById('tooltip-lu4-body');
  if (lu4El) {
    if (lu4?.value != null) {
      const v = lu4.value;
      lu4El.innerHTML = `<strong>${name}</strong> has <strong>${fmt(v, 1)}%</strong> of its workforce that is unemployed, underemployed, or discouraged — the ILO composite LU4 measure. This is broader than headline unemployment: it captures workers who want more hours and those who stopped looking. The MLSI danger threshold is 10%${lu4.year ? `; data year: ${lu4.year}` : ''}. Source: ILOSTAT.`;
    } else { lu4El.textContent = 'No data available.'; }
  }

  const neetEl = document.getElementById('tooltip-neet-body');
  if (neetEl) {
    if (neet?.value != null) {
      const v = neet.value;
      neetEl.innerHTML = `<strong>${name}</strong> has <strong>${fmt(v, 1)}%</strong> of youth aged 15–24 not in employment, education, or training (NEET). High NEET rates signal a generation at risk of skill stagnation and long-term unemployment. The MLSI danger threshold is 15%${neet.year ? `; data year: ${neet.year}` : ''}. Source: ILOSTAT.`;
    } else { neetEl.textContent = 'No data available.'; }
  }

  const loEl = document.getElementById('tooltip-learning-body');
  if (loEl) {
    if (lo?.value != null) {
      const v = lo.value;
      const yr = lo.year ? `; data year: ${lo.year}` : '';
      let context;
      if (v >= 490)      context = `${name} is above the OECD lower benchmark (490). Pupils on average meet minimum proficiency in reading and mathematics.`;
      else if (v >= 420) context = `${name} is in the caution zone (420–490): substantial share of pupils below minimum proficiency.`;
      else               context = `${name} is below 420 — most pupils have not reached minimum proficiency in foundational reading and maths.`;
      loEl.innerHTML = `<strong>${name}'s</strong> harmonized learning score is <strong>${fmt(v, 0)}</strong> on the 300–625 World Bank HCI scale${yr}. The score synthesises PISA, TIMSS, PIRLS, and national assessments — a proxy for SDG 4.1.1 minimum proficiency in reading and mathematics.<br><br>${context}`;
    } else { loEl.textContent = 'No learning outcomes data available for this country.'; }
  }
}

// =============================================================================
// Income pillar render functions
// renderWage / renderProd / renderPoverty ported verbatim from index.html
// (lines 2564-2635). renderPovertySocietal is new (Tier I #15, $6.85/day).
// =============================================================================

function renderWage(wageEntry) {
  const el = document.getElementById('gauge-wage');
  if (!el) return;
  if (!wageEntry || wageEntry.value == null) {
    showNoData(el, window.chartWage);
    setStatus('wage-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = wageEntry.value;
  const maxScale = 80000;
  const zones = makeZones(0, maxScale, [
    { maxVal: 15000, color: '#ef4444' }, { maxVal: 35000, color: '#f59e0b' },
    { maxVal: 60000, color: '#86efac' }, { maxVal: maxScale, color: '#22c55e' },
  ]);
  const level = val >= 35000 ? 'green' : val >= 15000 ? 'amber' : 'red';
  const wagePct = Math.round((1 - val / 35000) * 100);
  setStatus('wage-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 35000 ? 'above target' : val >= 15000 ? `${fmt(val / 35000 * 100, 0)}% of target` : 'below $15k';
  const vsColor = val >= 35000 ? '#22c55e' : val >= 15000 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: 'avg annual wage (USD)', formatFn: () => fmtGni(val), vsText, vsColor });
  window.chartWage.setOption(option, true);
}

function renderProd(prodEntry) {
  const el = document.getElementById('gauge-prod');
  if (!el) return;
  if (!prodEntry || prodEntry.value == null) {
    showNoData(el, window.chartProd);
    setStatus('prod-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = prodEntry.value;
  const maxScale = 200000;
  const zones = makeZones(0, maxScale, [
    { maxVal: 30000, color: '#ef4444' }, { maxVal: 70000, color: '#f59e0b' },
    { maxVal: 120000, color: '#86efac' }, { maxVal: maxScale, color: '#22c55e' },
  ]);
  const level = val >= 70000 ? 'green' : val >= 30000 ? 'amber' : 'red';
  const prodPct = Math.round((1 - val / 70000) * 100);
  setStatus('prod-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 70000 ? 'above target' : val >= 30000 ? `${fmt(val / 70000 * 100, 0)}% of target` : 'below $30k';
  const vsColor = val >= 70000 ? '#22c55e' : val >= 30000 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: 'output/worker (2021 PPP)', formatFn: () => fmtGni(val), vsText, vsColor });
  window.chartProd.setOption(option, true);
}

function renderPoverty(povEntry) {
  const el = document.getElementById('gauge-poverty');
  if (!el) return;
  if (!povEntry || povEntry.value == null) {
    showNoData(el, window.chartPoverty);
    setStatus('poverty-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = povEntry.value;
  const maxScale = 100;
  const zones = makeZones(0, maxScale, [
    { maxVal: 10, color: '#22c55e' }, { maxVal: 20, color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 10 ? 'green' : val <= 20 ? 'amber' : 'red';
  const povPct = Math.round((val / 10 - 1) * 100);
  setStatus('poverty-status', level, level === 'green' ? null : 'Above Target');
  const vsText  = val <= 10 ? 'below 10% target' : `${fmt(val / 20 * 100, 0)}% of danger threshold`;
  const vsColor = val <= 10 ? '#22c55e' : val <= 20 ? '#f59e0b' : '#ef4444';
  const line = povEntry.poverty_line;
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: line ? `% below $${line}/day` : '% below poverty line',
    formatFn: v => fmt(v, 1) + '%', vsText, vsColor, dangerMarkLine: 20 });
  window.chartPoverty.setOption(option, true);
  const lbl = document.getElementById('poverty-limit-label');
  if (lbl && line) lbl.textContent = `Danger: 20% (line: $${line}/day)`;
}

// New Tier I #15 — World Bank societal poverty line ($6.85/day PPP)
// Embedded thresholds in JSON meta: red 20.0, amber 10.0 (% population below line).
function renderPovertySocietal(psEntry) {
  const el = document.getElementById('gauge-poverty-societal');
  if (!el) return;
  if (!psEntry || psEntry.value == null) {
    showNoData(el, window.chartPovertySocietal);
    setStatus('poverty-societal-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = psEntry.value;
  const maxScale = 100;
  const zones = makeZones(0, maxScale, [
    { maxVal: 10, color: '#22c55e' }, { maxVal: 20, color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 10 ? 'green' : val <= 20 ? 'amber' : 'red';
  const psPct = Math.round((val / 10 - 1) * 100);
  setStatus('poverty-societal-status', level, level === 'green' ? null : 'Above Target');
  const vsText  = val <= 10 ? 'below 10% target' : `${fmt(val / 20 * 100, 0)}% of danger threshold`;
  const vsColor = val <= 10 ? '#22c55e' : val <= 20 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: '% below $6.85/day (societal)',
    formatFn: v => fmt(v, 1) + '%', vsText, vsColor, dangerMarkLine: 20 });
  window.chartPovertySocietal.setOption(option, true);
}

// ── Tooltip content for income pillar ─────────────────────────────────────────
function updateIncomeTooltips(iso3, name) {
  const wage = Cache.wage?.data?.[iso3];
  const prod = Cache.productivity?.data?.[iso3];
  const pov  = Cache.poverty_rate?.data?.[iso3];
  const ps   = Cache.poverty_societal?.data?.[iso3];
  const cap  = Cache.produced_capital?.data?.[iso3];

  const wageEl = document.getElementById('tooltip-wage-body');
  if (wageEl) {
    if (wage?.value != null) {
      const v = wage.value;
      wageEl.innerHTML = `<strong>${name}'s</strong> average annual wage is <strong>${fmtGni(v)}</strong> (nominal USD). This measures mean gross earnings per employee across the economy. The MLSI minimum threshold is $15,000/year; the comfort target is $35,000/year${wage.year ? `; data year: ${wage.year}` : ''}. Source: ILOSTAT.`;
    } else { wageEl.textContent = 'No data available.'; }
  }

  const prodEl = document.getElementById('tooltip-prod-body');
  if (prodEl) {
    if (prod?.value != null) {
      const v = prod.value;
      prodEl.innerHTML = `<strong>${name}'s</strong> labour productivity is <strong>${fmtGni(v)}</strong> output per worker (2021 PPP). Higher productivity enables higher wages without inflation and reflects technology, capital, and education. The MLSI minimum is $30,000/worker; the target is $70,000${prod.year ? `; data year: ${prod.year}` : ''}. Source: ILOSTAT.`;
    } else { prodEl.textContent = 'No data available.'; }
  }

  const povertyEl = document.getElementById('tooltip-poverty-body');
  if (povertyEl) {
    if (pov?.value != null) {
      const v = pov.value; const line = pov.poverty_line;
      povertyEl.innerHTML = `<strong>${fmt(v, 1)}%</strong> of <strong>${name}'s</strong> population lives below ${line ? `$${line}/day` : 'the national poverty line'}. The poverty line is tiered by income group so comparisons are meaningful across development levels. The MLSI danger threshold is 20%; below 10% is safe${pov.year ? `; data year: ${pov.year}` : ''}. Source: World Bank PIP.`;
    } else { povertyEl.textContent = 'No poverty data available (common for conflict-affected or high-income states).'; }
  }

  const psEl = document.getElementById('tooltip-poverty-societal-body');
  if (psEl) {
    if (ps?.value != null) {
      const v = ps.value;
      const yr = ps.year ? `; data year: ${ps.year}` : '';
      psEl.innerHTML = `<strong>${fmt(v, 1)}%</strong> of <strong>${name}'s</strong> population lives below the World Bank societal poverty line ($6.85/day PPP) — a single cross-country comparable line (HLEG Tier I #15). Unlike the tiered national poverty line, this stays fixed across income groups, so direct comparisons between countries are meaningful. Danger threshold: 20%; safe below 10%${yr}. Source: World Bank Open Data (SI.POV.SOPO).`;
    } else { psEl.textContent = 'No societal poverty data available for this country.'; }
  }

  const capEl = document.getElementById('tooltip-capital-body');
  if (capEl) {
    if (cap?.value != null) {
      const v = cap.value;
      const yr = cap.year ? `; data year: ${cap.year}` : '';
      capEl.innerHTML = `<strong>${name}'s</strong> net produced capital stock is <strong>${fmtGni(v)} per person</strong> — the value of machinery, infrastructure, buildings, and other built assets (World Bank CWON 2021, HLEG Tier I #17). Produced capital is the accumulated stock of human-made assets that enables productivity. A larger capital stock generally supports higher wages and output per worker. Threshold: below $10k/person = low base; $10–50k = developing; above $50k = adequate${yr}. Source: World Bank Changing Wealth of Nations (NW.PCA.TOTL.CD).`;
    } else { capEl.textContent = 'No produced capital data available for this country.'; }
  }
}

// =============================================================================
// Necessities pillar render functions
// renderMpi / renderMatFp ported verbatim from index.html (lines 2637-2682).
// renderDrinkingWater is new (Tier I #13).
// =============================================================================

function renderMpi(mpiEntry) {
  const el = document.getElementById('gauge-mpi');
  if (!el) return;
  if (!mpiEntry || mpiEntry.mpi == null) {
    showNoData(el, window.chartMpi);
    setStatus('mpi-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = mpiEntry.mpi;
  const maxScale = 0.4;
  const zones = makeZones(0, maxScale, [
    { maxVal: 0.01, color: '#22c55e' }, { maxVal: 0.1, color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 0.01 ? 'green' : val <= 0.1 ? 'amber' : 'red';
  const mpiPct = Math.round((val / 0.01 - 1) * 100);
  setStatus('mpi-status', level, level === 'green' ? null : 'Above Target');
  const vsText  = val <= 0.01 ? 'safe zone' : `${fmt(val / 0.1 * 100, 0)}% of danger threshold`;
  const vsColor = val <= 0.01 ? '#22c55e' : val <= 0.1 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: 'MPI score (0–1)', formatFn: v => Number(v).toFixed(3), vsText, vsColor });
  window.chartMpi.setOption(option, true);
}

function renderMatFp(matFpEntry) {
  const el = document.getElementById('gauge-matfp');
  if (!el) return;
  if (!matFpEntry || matFpEntry.mf_per_capita_t == null) {
    showNoData(el, window.chartMatFp);
    setStatus('matfp-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = matFpEntry.mf_per_capita_t;
  const maxScale = 50;
  const zones = makeZones(0, maxScale, [
    { maxVal: 8, color: '#22c55e' }, { maxVal: 16, color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 8 ? 'green' : val <= 16 ? 'amber' : 'red';
  const matfpPct = Math.round((val / 8 - 1) * 100);
  setStatus('matfp-status', level, level === 'green' ? null : 'Above Target');
  const ratio   = (val / 8).toFixed(1);
  const vsText  = val <= 8 ? 'within safe range' : `×${ratio} above safe range`;
  const vsColor = val <= 8 ? '#22c55e' : val <= 16 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: 't material / person', formatFn: v => fmt(v, 1) + ' t', vsText, vsColor, dangerMarkLine: 30 });
  window.chartMatFp.setOption(option, true);
}

// New Tier I #13 — WHO/UNICEF JMP SDG 6.1.1 safely managed drinking water
// Embedded thresholds: red 60.0, amber 85.0 (% population coverage).
function renderDrinkingWater(dwEntry) {
  const el = document.getElementById('gauge-water');
  if (!el) return;
  if (!dwEntry || dwEntry.value == null) {
    showNoData(el, window.chartWater);
    setStatus('water-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = dwEntry.value;
  const zones = makeZones(0, 100, [
    { maxVal: 60,  color: '#ef4444' },
    { maxVal: 85,  color: '#f59e0b' },
    { maxVal: 95,  color: '#86efac' },
    { maxVal: 100, color: '#22c55e' },
  ]);
  const level = val >= 85 ? 'green' : val >= 60 ? 'amber' : 'red';
  const waterPct = Math.round((1 - val / 85) * 100);
  setStatus('water-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 85 ? 'above target' : val >= 60 ? `${fmt(val / 85 * 100, 0)}% of target` : 'low coverage';
  const vsColor = val >= 85 ? '#22c55e' : val >= 60 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: val, min: 0, max: 100, zones,
    unitLabel: '% safely managed drinking water',
    formatFn: v => fmt(v, 1) + '%', vsText, vsColor });
  window.chartWater.setOption(option, true);
}

function renderSanitation(sanEntry) {
  const el = document.getElementById('gauge-sanitation');
  if (!el) return;
  if (!sanEntry || sanEntry.value == null) {
    showNoData(el, window.chartSanitation);
    setStatus('sanitation-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = sanEntry.value;
  const zones = makeZones(0, 100, [
    { maxVal: 60,  color: '#ef4444' },
    { maxVal: 85,  color: '#f59e0b' },
    { maxVal: 95,  color: '#86efac' },
    { maxVal: 100, color: '#22c55e' },
  ]);
  const level = val >= 85 ? 'green' : val >= 60 ? 'amber' : 'red';
  setStatus('sanitation-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 85 ? 'above target' : val >= 60 ? `${fmt(val / 85 * 100, 0)}% of target` : 'low coverage';
  const vsColor = val >= 85 ? '#22c55e' : val >= 60 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: val, min: 0, max: 100, zones,
    unitLabel: '% safely managed sanitation',
    formatFn: v => fmt(v, 1) + '%', vsText, vsColor });
  window.chartSanitation.setOption(option, true);
}

function renderElectricity(elecEntry) {
  const el = document.getElementById('gauge-electricity');
  if (!el) return;
  if (!elecEntry || elecEntry.value == null) {
    showNoData(el, window.chartElectricity);
    setStatus('electricity-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = elecEntry.value;
  const zones = makeZones(0, 100, [
    { maxVal: 70,  color: '#ef4444' },
    { maxVal: 90,  color: '#f59e0b' },
    { maxVal: 98,  color: '#86efac' },
    { maxVal: 100, color: '#22c55e' },
  ]);
  const level = val >= 90 ? 'green' : val >= 70 ? 'amber' : 'red';
  setStatus('electricity-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 90 ? 'above target' : val >= 70 ? `${fmt(val / 90 * 100, 0)}% of target` : 'major energy poverty';
  const vsColor = val >= 90 ? '#22c55e' : val >= 70 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: val, min: 0, max: 100, zones,
    unitLabel: '% with access to electricity',
    formatFn: v => fmt(v, 1) + '%', vsText, vsColor });
  window.chartElectricity.setOption(option, true);
}

function renderInternet(netEntry) {
  const el = document.getElementById('gauge-internet');
  if (!el) return;
  if (!netEntry || netEntry.value == null) {
    showNoData(el, window.chartInternet);
    setStatus('internet-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = netEntry.value;
  const zones = makeZones(0, 100, [
    { maxVal: 30,  color: '#ef4444' },
    { maxVal: 70,  color: '#f59e0b' },
    { maxVal: 90,  color: '#86efac' },
    { maxVal: 100, color: '#22c55e' },
  ]);
  const level = val >= 70 ? 'green' : val >= 30 ? 'amber' : 'red';
  setStatus('internet-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 70 ? 'above target' : val >= 30 ? `${fmt(val / 70 * 100, 0)}% of target` : 'limited connectivity';
  const vsColor = val >= 70 ? '#22c55e' : val >= 30 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: val, min: 0, max: 100, zones,
    unitLabel: '% individuals using the internet',
    formatFn: v => fmt(v, 1) + '%', vsText, vsColor });
  window.chartInternet.setOption(option, true);
}

// ── Tooltip content for necessities pillar ────────────────────────────────────
function updateNecessitiesTooltips(iso3, name) {
  const mpi        = Cache.mpi?.data?.[iso3];
  const water      = Cache.drinking_water?.data?.[iso3];
  const sanitation = Cache.sanitation?.data?.[iso3];
  const electricity = Cache.electricity?.data?.[iso3];
  const internet   = Cache.internet?.data?.[iso3];

  const mpiEl = document.getElementById('tooltip-mpi-body');
  if (mpiEl) {
    if (mpi?.mpi != null) {
      const v = mpi.mpi; const hp = mpi.headcount_pct;
      mpiEl.innerHTML = `<strong>${name}'s</strong> Multidimensional Poverty Index is <strong>${Number(v).toFixed(3)}</strong>${hp != null ? ` — <strong>${fmt(hp, 1)}%</strong> of the population is multidimensionally poor` : ''}. The MPI captures deprivations in health, education, and living standards simultaneously, beyond income alone. Danger threshold: 0.10. Note: MPI data is only available for developing countries. Source: UNDP/OPHI.`;
    } else { mpiEl.textContent = 'No MPI data available — this indicator covers developing countries only.'; }
  }

  const waterEl = document.getElementById('tooltip-water-body');
  if (waterEl) {
    if (water?.value != null) {
      const v = water.value;
      const yr = water.year ? `; data year: ${water.year}` : '';
      let context;
      if (v >= 95)      context = `Universal safely managed drinking water is essentially achieved.`;
      else if (v >= 85) context = `Most of the population has safely managed services; remaining gaps tend to concentrate in rural or marginalised areas.`;
      else if (v >= 60) context = `Substantial coverage gap — a significant minority lack safely managed services.`;
      else              context = `Low coverage — the majority of the population lacks safely managed drinking water (SDG 6.1.1 indicator).`;
      waterEl.innerHTML = `<strong>${fmt(v, 1)}%</strong> of <strong>${name}'s</strong> population uses safely managed drinking water services (SDG 6.1.1, HLEG Tier I #13)${yr}.<br><br>${context} Source: WHO/UNICEF JMP 2025.`;
    } else { waterEl.textContent = 'No drinking water coverage data available for this country.'; }
  }

  const sanEl = document.getElementById('tooltip-sanitation-body');
  if (sanEl) {
    if (sanitation?.value != null) {
      const v = sanitation.value;
      const yr = sanitation.year ? `; data year: ${sanitation.year}` : '';
      let context;
      if (v >= 95)      context = `Near-universal safely managed sanitation — the vast majority have safe, private facilities.`;
      else if (v >= 85) context = `Most of the population has safely managed sanitation; remaining gaps tend to affect rural and informal settlements.`;
      else if (v >= 60) context = `Substantial sanitation gap — a significant share of the population lacks safely managed services, increasing disease risk.`;
      else              context = `Major sanitation deficit — the majority lack safely managed sanitation (SDG 6.2.1 target). Risk of waterborne disease and loss of dignity is high.`;
      sanEl.innerHTML = `<strong>${fmt(v, 1)}%</strong> of <strong>${name}'s</strong> population uses safely managed sanitation services (SDG 6.2.1)${yr}.<br><br>${context} Source: WHO/UNICEF JMP 2025.`;
    } else { sanEl.textContent = 'No sanitation coverage data available for this country.'; }
  }

  const elecEl = document.getElementById('tooltip-electricity-body');
  if (elecEl) {
    if (electricity?.value != null) {
      const v = electricity.value;
      const yr = electricity.year ? `; data year: ${electricity.year}` : '';
      let context;
      if (v >= 98)      context = `Universal electricity access — essentially the entire population can power lights, appliances, and communications.`;
      else if (v >= 90) context = `Nearly universal access; remaining gaps tend to be in remote or rural areas.`;
      else if (v >= 70) context = `Significant electricity access gap — a meaningful share of the population lacks reliable power, limiting education, health, and economic opportunity.`;
      else              context = `Major energy poverty — less than 70% of the population has electricity access. This constrains health services, education, and economic participation at a fundamental level.`;
      elecEl.innerHTML = `<strong>${fmt(v, 1)}%</strong> of <strong>${name}'s</strong> population has access to electricity (SDG 7.1.1)${yr}.<br><br>${context} Source: World Bank WDI (EG.ELC.ACCS.ZS).`;
    } else { elecEl.textContent = 'No electricity access data available for this country.'; }
  }

  const netEl = document.getElementById('tooltip-internet-body');
  if (netEl) {
    if (internet?.value != null) {
      const v = internet.value;
      const yr = internet.year ? `; data year: ${internet.year}` : '';
      let context;
      if (v >= 90)      context = `Widespread digital participation — the internet is a mainstream part of daily life for most residents, enabling economic and civic engagement.`;
      else if (v >= 70) context = `Majority connected — internet access is mainstream, though a meaningful share remains offline.`;
      else if (v >= 30) context = `Emerging connectivity — a significant portion of the population is offline, limiting access to education, services, and economic opportunity.`;
      else              context = `Limited connectivity — less than 30% of the population uses the internet, a significant barrier to economic participation in the modern world (SDG 17.8.1).`;
      netEl.innerHTML = `<strong>${fmt(v, 1)}%</strong> of <strong>${name}'s</strong> population uses the internet (SDG 17.8.1)${yr}.<br><br>${context} Source: World Bank WDI / ITU (IT.NET.USER.ZS).`;
    } else { netEl.textContent = 'No internet access data available for this country.'; }
  }
}

// =============================================================================
// Security pillar render functions
// renderHale / renderUhc ported verbatim from index.html lines 2684-2728.
// renderHouseholdIncome + six Tier I renders are new.
// =============================================================================

function renderHale(haleEntry) {
  const el = document.getElementById('gauge-hale');
  if (!el) return;
  if (!haleEntry || haleEntry.value == null) {
    showNoData(el, window.chartHale);
    setStatus('hale-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = haleEntry.value;
  const minScale = 40; const maxScale = 80;
  const zones = makeZones(minScale, maxScale, [
    { maxVal: 60, color: '#ef4444' }, { maxVal: 70, color: '#f59e0b' },
    { maxVal: 75, color: '#86efac' }, { maxVal: maxScale, color: '#22c55e' },
  ]);
  const level = val >= 70 ? 'green' : val >= 60 ? 'amber' : 'red';
  const halePct = Math.round((1 - val / 70) * 100);
  setStatus('hale-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 70 ? 'above target' : `${fmt(val / 70 * 100, 0)}% of 70-yr target`;
  const vsColor = val >= 70 ? '#22c55e' : val >= 60 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({
    value: Math.min(Math.max(val, minScale), maxScale), min: minScale, max: maxScale, zones,
    unitLabel: 'healthy life years', formatFn: v => fmt(v, 1) + ' yrs', vsText, vsColor });
  window.chartHale.setOption(option, true);
}

function renderUhc(uhcEntry) {
  const el = document.getElementById('gauge-uhc');
  if (!el) return;
  if (!uhcEntry || uhcEntry.value == null) {
    showNoData(el, window.chartUhc);
    setStatus('uhc-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = uhcEntry.value;
  const zones = makeZones(0, 100, [
    { maxVal: 70, color: '#ef4444' }, { maxVal: 90, color: '#f59e0b' },
    { maxVal: 95, color: '#86efac' }, { maxVal: 100, color: '#22c55e' },
  ]);
  const level = val >= 90 ? 'green' : val >= 70 ? 'amber' : 'red';
  const uhcPct = Math.round((1 - val / 90) * 100);
  setStatus('uhc-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 90 ? 'above target' : `${fmt(val / 90 * 100, 0)}% of 90% target`;
  const vsColor = val >= 90 ? '#22c55e' : val >= 70 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: val, min: 0, max: 100, zones,
    unitLabel: 'Health system coverage index (0–100)', formatFn: v => fmt(v, 0) + '%', vsText, vsColor });
  window.chartUhc.setOption(option, true);
}

// Tier I #4 — Household disposable income per capita (GDP/capita proxy via UNSD AMA)
// Embedded thresholds: red 5000, amber 20000 USD/person.
function renderHouseholdIncome(hhEntry) {
  const el = document.getElementById('gauge-hhinc');
  if (!el) return;
  if (!hhEntry || hhEntry.value == null) {
    showNoData(el, window.chartHhinc);
    setStatus('hhinc-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = hhEntry.value;
  const maxScale = 100000;
  const zones = makeZones(0, maxScale, [
    { maxVal: 5000,     color: '#ef4444' },
    { maxVal: 20000,    color: '#f59e0b' },
    { maxVal: 50000,    color: '#86efac' },
    { maxVal: maxScale, color: '#22c55e' },
  ]);
  const level = val >= 20000 ? 'green' : val >= 5000 ? 'amber' : 'red';
  const hhPct = Math.round((1 - val / 20000) * 100);
  setStatus('hhinc-status', level, level === 'green' ? null : 'Below Target');
  const vsText  = val >= 20000 ? 'above $20k' : val >= 5000 ? `${fmt(val / 20000 * 100, 0)}% of target` : 'below $5k';
  const vsColor = val >= 20000 ? '#22c55e' : val >= 5000 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({
    value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: 'income / person (USD, GDP proxy)',
    formatFn: () => fmtGni(val),
    vsText, vsColor,
  });
  window.chartHhinc.setOption(option, true);
}

// Tier I #7 — Low birthweight (% of live births). Red >15, amber 7-15, green <=7.
function renderLbw(lbwEntry) {
  const el = document.getElementById('gauge-lbw');
  if (!el) return;
  if (!lbwEntry || lbwEntry.value == null) {
    showNoData(el, window.chartLbw);
    setStatus('lbw-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = lbwEntry.value;
  const maxScale = 30;
  const zones = makeZones(0, maxScale, [
    { maxVal: 7,        color: '#22c55e' },
    { maxVal: 15,       color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 7 ? 'green' : val <= 15 ? 'amber' : 'red';
  const lbwPct = Math.round((val / 7 - 1) * 100);
  setStatus('lbw-status', level, level === 'green' ? null : 'Above Target');
  const vsText  = val <= 7 ? 'safe zone' : `${fmt(val / 15 * 100, 0)}% of danger threshold`;
  const vsColor = val <= 7 ? '#22c55e' : val <= 15 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: '% low-birthweight births', formatFn: v => fmt(v, 1) + '%', vsText, vsColor, dangerMarkLine: 15 });
  window.chartLbw.setOption(option, true);
}

// Tier I #14 — Gini index of income inequality. Red >=45, amber 35-45, green <35.
function renderGini(giniEntry) {
  const el = document.getElementById('gauge-gini');
  if (!el) return;
  if (!giniEntry || giniEntry.value == null) {
    showNoData(el, window.chartGini);
    setStatus('gini-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = giniEntry.value;
  const maxScale = 70;
  const zones = makeZones(0, maxScale, [
    { maxVal: 35,       color: '#22c55e' },
    { maxVal: 45,       color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val < 35 ? 'green' : val < 45 ? 'amber' : 'red';
  setStatus('gini-status', level);
  const vsText  = val < 35 ? 'low inequality' : val < 45 ? 'moderate inequality' : 'high inequality';
  const vsColor = val < 35 ? '#22c55e' : val < 45 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: 'Gini index (0=equal, 100=unequal)', formatFn: v => fmt(v, 1), vsText, vsColor, dangerMarkLine: 45 });
  window.chartGini.setOption(option, true);
}

// Tier I #9 — Intentional homicides per 100,000 (WHO GHO as SDG 16.1.1 fallback).
// Embedded thresholds: red 10.0, amber 3.0.
function renderHomicide(hmEntry) {
  const el = document.getElementById('gauge-homicide');
  if (!el) return;
  if (!hmEntry || hmEntry.value == null) {
    showNoData(el, window.chartHomicide);
    setStatus('homicide-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = hmEntry.value;
  const maxScale = 30;
  const zones = makeZones(0, maxScale, [
    { maxVal: 3,        color: '#22c55e' },
    { maxVal: 10,       color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 3 ? 'green' : val <= 10 ? 'amber' : 'red';
  setStatus('homicide-status', level);
  const vsText  = val <= 3 ? 'low rate' : val <= 10 ? 'elevated rate' : 'high rate';
  const vsColor = val <= 3 ? '#22c55e' : val <= 10 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({
    value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: 'homicides per 100k',
    formatFn: v => fmt(v, 1),
    vsText, vsColor,
    overflow: val > maxScale,
    dangerMarkLine: 10,
  });
  window.chartHomicide.setOption(option, true);
}

// Tier I #10 — Life satisfaction (Cantril ladder 0–10, WHR 2025).
// Embedded thresholds: red <5.0, amber <6.5.
function renderLifeSatisfaction(lsEntry) {
  const el = document.getElementById('gauge-lifesat');
  if (!el) return;
  if (!lsEntry || lsEntry.value == null) {
    showNoData(el, window.chartLifesat);
    setStatus('lifesat-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = lsEntry.value;
  const zones = makeZones(0, 10, [
    { maxVal: 5,    color: '#ef4444' },
    { maxVal: 6.5,  color: '#f59e0b' },
    { maxVal: 8,    color: '#86efac' },
    { maxVal: 10,   color: '#22c55e' },
  ]);
  const level = val >= 6.5 ? 'green' : val >= 5 ? 'amber' : 'red';
  setStatus('lifesat-status', level);
  const vsText  = val >= 6.5 ? 'above benchmark' : val >= 5 ? `${fmt(val / 6.5 * 100, 0)}% of target` : 'below threshold';
  const vsColor = val >= 6.5 ? '#22c55e' : val >= 5 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: val, min: 0, max: 10, zones,
    unitLabel: 'Cantril ladder (0–10)', formatFn: v => fmt(v, 2), vsText, vsColor });
  window.chartLifesat.setOption(option, true);
}

// Tier I #20 — Generalised social trust (WVS Wave 7). Red <20, amber <40, green >=40.
function renderWvsTrust(trustEntry) {
  const el = document.getElementById('gauge-trust');
  if (!el) return;
  if (!trustEntry || trustEntry.value == null) {
    showNoData(el, window.chartTrust);
    setStatus('trust-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = trustEntry.value;
  const zones = makeZones(0, 100, [
    { maxVal: 20,  color: '#ef4444' },
    { maxVal: 40,  color: '#f59e0b' },
    { maxVal: 70,  color: '#86efac' },
    { maxVal: 100, color: '#22c55e' },
  ]);
  const level = val >= 40 ? 'green' : val >= 20 ? 'amber' : 'red';
  setStatus('trust-status', level);
  const vsText  = val >= 40 ? 'high trust' : val >= 20 ? 'moderate trust' : 'low trust';
  const vsColor = val >= 40 ? '#22c55e' : val >= 20 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: val, min: 0, max: 100, zones,
    unitLabel: '% "most people can be trusted"', formatFn: v => fmt(v, 1) + '%', vsText, vsColor });
  window.chartTrust.setOption(option, true);
}

// Tier I #19 — Confidence in civil services (WVS Wave 7). Red <30, amber <50, green >=50.
function renderWvsGovConfidence(gcEntry) {
  const el = document.getElementById('gauge-govconf');
  if (!el) return;
  if (!gcEntry || gcEntry.value == null) {
    showNoData(el, window.chartGovconf);
    setStatus('govconf-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = gcEntry.value;
  const zones = makeZones(0, 100, [
    { maxVal: 30,  color: '#ef4444' },
    { maxVal: 50,  color: '#f59e0b' },
    { maxVal: 75,  color: '#86efac' },
    { maxVal: 100, color: '#22c55e' },
  ]);
  const level = val >= 50 ? 'green' : val >= 30 ? 'amber' : 'red';
  setStatus('govconf-status', level);
  const vsText  = val >= 50 ? 'high confidence' : val >= 30 ? 'moderate confidence' : 'low confidence';
  const vsColor = val >= 50 ? '#22c55e' : val >= 30 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({ value: val, min: 0, max: 100, zones,
    unitLabel: '% confidence in civil services', formatFn: v => fmt(v, 1) + '%', vsText, vsColor });
  window.chartGovconf.setOption(option, true);
}

// ── Tooltip content for security pillar ───────────────────────────────────────
function updateSecurityTooltips(iso3, name) {
  const hale  = Cache.hale?.data?.[iso3];
  const uhc   = Cache.uhc_coverage?.data?.[iso3];
  const hh    = Cache.household_income?.data?.[iso3];
  const lbw   = Cache.lbw?.data?.[iso3];
  const gini  = Cache.gini?.data?.[iso3];
  const hm    = Cache.homicide_rate?.data?.[iso3];
  const ls    = Cache.life_satisfaction?.data?.[iso3];
  const tr    = Cache.wvs_trust?.data?.[iso3];
  const gc    = Cache.wvs_gov_confidence?.data?.[iso3];

  const haleEl = document.getElementById('tooltip-hale-body');
  if (haleEl) {
    if (hale?.value != null) {
      const v = hale.value;
      haleEl.innerHTML = `<strong>${name}'s</strong> healthy life expectancy at birth is <strong>${fmt(v, 1)} years</strong>${hale.year ? ` (${hale.year})` : ''}. HALE measures the years a newborn can expect to live in full health, accounting for time lost to disability and disease. The MLSI target is 70 years; below 60 indicates serious mortality and morbidity gaps. Source: WHO GHO.`;
    } else { haleEl.textContent = 'No HALE data available.'; }
  }

  const uhcEl = document.getElementById('tooltip-uhc-body');
  if (uhcEl) {
    if (uhc?.value != null) {
      const v = uhc.value;
      uhcEl.innerHTML = `<strong>${name}</strong> scores <strong>${fmt(v, 0)}/100</strong> on the WHO Health System Coverage Index${uhc.year ? ` (${uhc.year})` : ''}.<p>This score measures whether people can actually get the healthcare they need — not just whether a health system exists. It combines three things:</p><ul><li><strong>Access</strong> — can people reach health services (clinics, hospitals, medicines)?</li><li><strong>Quality</strong> — are those services effective enough to improve health outcomes?</li><li><strong>Financial protection</strong> — can people afford care without falling into poverty?</li></ul><p>A country with universal insurance but expensive co-pays, long wait times, or poor rural access will score below 100. That is why high-income countries rarely reach 90+.</p><p>Composed of 14 tracer indicators across reproductive health, child health, infectious disease, and noncommunicable diseases. <strong>Target: 90+</strong> (SDG 3.8.1). Source: WHO Global Health Observatory.</p>`;
    } else { uhcEl.textContent = 'No UHC data available.'; }
  }

  const hhEl = document.getElementById('tooltip-hhinc-body');
  if (hhEl) {
    if (hh?.value != null) {
      const v = hh.value;
      const yr = hh.year ? `; data year: ${hh.year}` : '';
      hhEl.innerHTML = `<strong>${name}'s</strong> proxy for household disposable income per capita is <strong>${fmtGni(v)}</strong> (UNSD GDP/capita stand-in for HLEG Tier I #4)${yr}. True household sector disposable income is not exposed via the open AMA API; the GDP/capita series is used as a directional proxy. Threshold: below $5k/person = low; above $20k = adequate. Source: UN Statistics Division.`;
    } else { hhEl.textContent = 'No household income data available.'; }
  }

  const lbwEl = document.getElementById('tooltip-lbw-body');
  if (lbwEl) {
    if (lbw?.value != null) {
      const v = lbw.value;
      const yr = lbw.year ? `; data year: ${lbw.year}` : '';
      lbwEl.innerHTML = `<strong>${fmt(v, 1)}%</strong> of <strong>${name}'s</strong> live births are low-birthweight (under 2,500 g, HLEG Tier I #7)${yr}. Low birthweight is a leading predictor of neonatal mortality, stunting, and lifelong cognitive deficits — a sensitive measure of maternal nutrition and prenatal care. Danger threshold: 15%; safe at or below 7%. Source: WHO GHO / UNICEF.`;
    } else { lbwEl.textContent = 'No low-birthweight data available.'; }
  }

  const giniEl = document.getElementById('tooltip-gini-body');
  if (giniEl) {
    if (gini?.value != null) {
      const v = gini.value;
      const yr = gini.year ? `; data year: ${gini.year}` : '';
      giniEl.innerHTML = `<strong>${name}'s</strong> Gini index is <strong>${fmt(v, 1)}</strong> on a 0 (perfect equality) – 100 (perfect inequality) scale (HLEG Tier I #14)${yr}. Below 35 indicates low inequality; 35–45 moderate; 45+ high. The Gini summarises the income distribution across the entire population. Source: World Bank Open Data (SI.POV.GINI).`;
    } else { giniEl.textContent = 'No Gini data available.'; }
  }

  const hmEl = document.getElementById('tooltip-homicide-body');
  if (hmEl) {
    if (hm?.value != null) {
      const v = hm.value;
      const yr = hm.year ? `; data year: ${hm.year}` : '';
      hmEl.innerHTML = `<strong>${name}'s</strong> intentional homicide rate is <strong>${fmt(v, 1)} per 100,000</strong> population (SDG 16.1.1, HLEG Tier I #9)${yr}. Used as a core indicator of physical security and rule-of-law strength. Threshold: at or below 3 = safe; 3–10 = elevated; above 10 = high. Source: WHO GHO (fallback for UNODC).`;
    } else { hmEl.textContent = 'No homicide rate data available.'; }
  }

  const lsEl = document.getElementById('tooltip-lifesat-body');
  if (lsEl) {
    if (ls?.value != null) {
      const v = ls.value;
      const yr = ls.year ? `; data year: ${ls.year}` : '';
      lsEl.innerHTML = `<strong>${name}'s</strong> mean life satisfaction is <strong>${fmt(v, 2)}</strong> on the 0–10 Cantril ladder (HLEG Tier I #10)${yr}. The Cantril ladder asks respondents to rate their current life on a scale where 0 = worst possible and 10 = best possible. Threshold: at or above 6.5 = adequate; below 5.0 indicates widespread dissatisfaction. Source: World Happiness Report 2025 (SDSN, openly available Gallup extract).`;
    } else { lsEl.textContent = 'No life satisfaction data available.'; }
  }

  const trEl = document.getElementById('tooltip-trust-body');
  if (trEl) {
    if (tr?.value != null) {
      const v = tr.value;
      const yr = tr.year ? `; data year: ${tr.year}` : '';
      trEl.innerHTML = `<strong>${fmt(v, 1)}%</strong> of <strong>${name}'s</strong> adult population say "most people can be trusted" (HLEG Tier I #20)${yr}. Generalised social trust is one of the strongest correlates of governance quality and collective action. Threshold: 40%+ = high; below 20% = low. Coverage limited to ~66 countries (World Values Survey Wave 7, 2017–2022). Source: WVS.`;
    } else { trEl.textContent = 'No social trust data available (WVS Wave 7 covers ~66 countries).'; }
  }

  const gcEl = document.getElementById('tooltip-govconf-body');
  if (gcEl) {
    if (gc?.value != null) {
      const v = gc.value;
      const yr = gc.year ? `; data year: ${gc.year}` : '';
      gcEl.innerHTML = `<strong>${fmt(v, 1)}%</strong> of <strong>${name}'s</strong> adult population express confidence in the civil service (HLEG Tier I #19)${yr}. Captures perceived state capacity and impartiality. Threshold: 50%+ = high; below 30% = low. Coverage limited to ~65 countries (World Values Survey Wave 7). Source: WVS.`;
    } else { gcEl.textContent = 'No civil-service confidence data available (WVS Wave 7 covers ~65 countries).'; }
  }
}

// =============================================================================
// Equity pillar render functions
// gdi: UNDP GDI (female HDI / male HDI). Parity = 1.0. Embedded threshold: 0.975 (UNDP Group 1).
// gii: UNDP GII (0–1, lower = better). Embedded threshold_ambitious: 0.1.
// gender_pay_ratio: female/male hourly earnings (ILO SDG 8.5.1). Embedded thresholds: red<0.80, amber<0.92.
// ipv: SDG 5.2.1 IPV prevalence (%). Embedded thresholds: amber<=10, red>20.
// =============================================================================

function renderGdi(gdiEntry) {
  const el = document.getElementById('gauge-gdi');
  if (!el) return;
  if (!gdiEntry || gdiEntry.gdi == null) {
    showNoData(el, window.chartGdi);
    setStatus('gdi-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = gdiEntry.gdi;
  // UNDP Group 1 (≥0.975) = parity; scale centred on 1.0 (parity).
  // Display range 0.80–1.20; zones: red <0.95, amber 0.95–0.975, green ≥0.975.
  const minScale = 0.80, maxScale = 1.20;
  const zones = makeZones(minScale, maxScale, [
    { maxVal: 0.95,  color: '#ef4444' },
    { maxVal: 0.975, color: '#f59e0b' },
    { maxVal: 1.025, color: '#22c55e' },
    { maxVal: maxScale, color: '#86efac' },
  ]);
  const level = val >= 0.975 ? 'green' : val >= 0.95 ? 'amber' : 'red';
  const vsText  = val >= 0.975 ? 'gender parity' : `${((1 - val / 0.975) * 100).toFixed(1)}% below parity`;
  const vsColor = val >= 0.975 ? '#22c55e' : val >= 0.95 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({
    value: Math.min(Math.max(val, minScale), maxScale),
    min: minScale, max: maxScale, zones,
    unitLabel: 'female HDI / male HDI', formatFn: v => v.toFixed(3), vsText, vsColor,
  });
  setStatus('gdi-status', level);
  window.chartGdi.setOption(option, true);
  if (gdiEntry.year) {
    const footer = document.querySelector('[data-card="gdi"] .limit-label span');
    if (footer) footer.textContent = `Parity: 1.000 (UNDP Group 1 ≥0.975; ${gdiEntry.year})`;
  }
}

function renderGii(giiEntry) {
  const el = document.getElementById('gauge-gii');
  if (!el) return;
  if (!giiEntry || giiEntry.gii == null) {
    showNoData(el, window.chartGii);
    setStatus('gii-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = giiEntry.gii;
  // GII: 0 = perfect equality, 1 = maximum inequality. Lower is better.
  // UNDP ambitious target: ≤0.10. Moderate: ≤0.30. High: >0.30.
  const maxScale = 0.80;
  const zones = makeZones(0, maxScale, [
    { maxVal: 0.10, color: '#22c55e' },
    { maxVal: 0.30, color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 0.10 ? 'green' : val <= 0.30 ? 'amber' : 'red';
  const giiPct = val <= 0.10 ? 0 : Math.round((val / 0.30) * 100);
  setStatus('gii-status', level, level === 'green' ? null : 'Above Target');
  const vsText  = val <= 0.10 ? 'near equality' : `${fmt(val / 0.30 * 100, 0)}% of moderate threshold`;
  const vsColor = val <= 0.10 ? '#22c55e' : val <= 0.30 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({
    value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: 'gender inequality index', formatFn: v => v.toFixed(3), vsText, vsColor, dangerMarkLine: 0.30,
  });
  window.chartGii.setOption(option, true);
  if (giiEntry.year) {
    const footer = document.querySelector('[data-card="gii"] .limit-label span');
    if (footer) footer.textContent = `Danger: 0.30 (lower is better; ${giiEntry.year})`;
  }
}

function renderGenderPayRatio(gprEntry) {
  const el = document.getElementById('gauge-gpr');
  if (!el) return;
  if (!gprEntry || gprEntry.value == null) {
    showNoData(el, window.chartGpr);
    setStatus('gpr-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = gprEntry.value;
  // Ratio: 1.0 = parity (women earn same as men). Embedded: red<0.80, amber<0.92.
  // Display range 0.50–1.30; values >1 mean women earn more.
  const minScale = 0.50, maxScale = 1.30;
  const zones = makeZones(minScale, maxScale, [
    { maxVal: 0.80,  color: '#ef4444' },
    { maxVal: 0.92,  color: '#f59e0b' },
    { maxVal: 1.05,  color: '#22c55e' },
    { maxVal: maxScale, color: '#86efac' },
  ]);
  const level = val >= 0.92 ? 'green' : val >= 0.80 ? 'amber' : 'red';
  const vsText  = val >= 0.92 ? 'near parity' : `${((1 - val) * 100).toFixed(1)}% pay gap`;
  const vsColor = val >= 0.92 ? '#22c55e' : val >= 0.80 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({
    value: Math.min(Math.max(val, minScale), maxScale),
    min: minScale, max: maxScale, zones,
    unitLabel: 'female / male hourly earnings', formatFn: v => v.toFixed(2), vsText, vsColor,
  });
  setStatus('gpr-status', level);
  window.chartGpr.setOption(option, true);
  if (gprEntry.year) {
    const footer = document.querySelector('[data-card="gpr"] .limit-label span');
    if (footer) footer.textContent = `Parity: 1.00 (ILO SDG 8.5.1; ${gprEntry.year})`;
  }
}

function renderIpv(ipvEntry) {
  const el = document.getElementById('gauge-ipv');
  if (!el) return;
  if (!ipvEntry || ipvEntry.value == null) {
    showNoData(el, window.chartIpv);
    setStatus('ipv-status', 'gray');
    return;
  }
  hideNoData(el);
  const val = ipvEntry.value;
  // IPV prevalence (%): lower is better. Embedded: amber ≤10, red >20.
  const maxScale = 50;
  const zones = makeZones(0, maxScale, [
    { maxVal: 10, color: '#22c55e' },
    { maxVal: 20, color: '#f59e0b' },
    { maxVal: maxScale, color: '#ef4444' },
  ]);
  const level = val <= 10 ? 'green' : val <= 20 ? 'amber' : 'red';
  setStatus('ipv-status', level, level === 'green' ? null : 'Above Target');
  const vsText  = val <= 10 ? 'below danger threshold' : `${fmt(val / 20 * 100, 0)}% of danger threshold`;
  const vsColor = val <= 10 ? '#22c55e' : val <= 20 ? '#f59e0b' : '#ef4444';
  const option = buildBulletOption({
    value: Math.min(val, maxScale), min: 0, max: maxScale, zones,
    unitLabel: '% women experienced IPV', formatFn: v => fmt(v, 1) + '%', vsText, vsColor, dangerMarkLine: 20,
  });
  window.chartIpv.setOption(option, true);
  if (ipvEntry.year) {
    const footer = document.querySelector('[data-card="ipv"] .limit-label span');
    if (footer) footer.textContent = `Danger: 20% (SDG 5.2.1; lower is better; ${ipvEntry.year})`;
  }
}

// ── Equity pillar tooltip update ──────────────────────────────────────────────
function updateEquityTooltips(iso3, name) {
  const gdi = Cache.gdi?.data?.[iso3];
  const gii = Cache.gii?.data?.[iso3];
  const gpr = Cache.gender_pay_ratio?.data?.[iso3];
  const ipv = Cache.ipv?.data?.[iso3];

  const gdiEl = document.getElementById('tooltip-gdi-body');
  if (gdiEl) {
    if (gdi?.gdi != null) {
      const v = gdi.gdi;
      const yr = gdi.year ? `; data year: ${gdi.year}` : '';
      const group = v >= 0.975 ? 'UNDP Group 1 (near-parity)' : v >= 0.95 ? 'UNDP Group 2 (medium disparity)' : 'UNDP Group 3–5 (high disparity)';
      gdiEl.innerHTML = `<strong>${name}'s</strong> Gender Development Index is <strong>${v.toFixed(3)}</strong> — a ratio of female to male HDI${yr}. 1.00 = perfect parity; above 1.00 = women score higher. ${name} is in ${group}. UNDP Group 1 threshold: ≥0.975. Source: UNDP Human Development Report 2023.`;
    } else { gdiEl.textContent = 'No GDI data available.'; }
  }

  const giiEl = document.getElementById('tooltip-gii-body');
  if (giiEl) {
    if (gii?.gii != null) {
      const v = gii.gii;
      const yr = gii.year ? `; data year: ${gii.year}` : '';
      giiEl.innerHTML = `<strong>${name}'s</strong> Gender Inequality Index is <strong>${v.toFixed(3)}</strong> on a 0 (equality) – 1 (maximum inequality) scale${yr}. The GII captures reproductive health, empowerment, and labour market gaps. Target: ≤0.10 (ambitious); ≤0.30 (moderate). Source: UNDP Human Development Report 2023.`;
    } else { giiEl.textContent = 'No GII data available.'; }
  }

  const gprEl = document.getElementById('tooltip-gpr-body');
  if (gprEl) {
    if (gpr?.value != null) {
      const v = gpr.value;
      const yr = gpr.year ? `; data year: ${gpr.year}` : '';
      const gap = v < 1 ? `Women earn ${((1 - v) * 100).toFixed(1)}% less per hour than men.` : `Women earn ${((v - 1) * 100).toFixed(1)}% more per hour than men.`;
      gprEl.innerHTML = `<strong>${name}'s</strong> gender pay ratio is <strong>${v.toFixed(2)}</strong> (female / male hourly earnings, SDG 8.5.1)${yr}. ${gap} Threshold: ≥0.92 = near-parity; <0.80 = significant gap. Source: ILOSTAT.`;
    } else { gprEl.textContent = 'No gender pay data available.'; }
  }

  const ipvEl = document.getElementById('tooltip-ipv-body');
  if (ipvEl) {
    if (ipv?.value != null) {
      const v = ipv.value;
      const yr = ipv.year ? `; data year: ${ipv.year}` : '';
      ipvEl.innerHTML = `<strong>${fmt(v, 1)}%</strong> of ever-partnered women in <strong>${name}</strong> have experienced physical or sexual violence by an intimate partner in the past 12 months (SDG 5.2.1, HLEG Tier I #1)${yr}. Safe threshold: below 10%; danger: above 20%. Source: WHO GHO.`;
    } else { ipvEl.textContent = 'No IPV data available.'; }
  }
}

// =============================================================================
// Apex bar update — used by both landing hub (index.html) and can be called
// from any page that has #apex-gnsd / #apex-gni / #apex-gdp elements.
// =============================================================================
function updateApexBar(iso3) {
  const hdi = Cache.hdi?.data?.[iso3];
  const gdp = Cache.gdp?.data?.[iso3];
  lastGnsdResult = computeGNSD(iso3);
  const gnsdResult = lastGnsdResult;
  const gnsd = gnsdResult?.gnsd ?? null;

  const gnsdEl = document.getElementById('apex-gnsd');
  if (gnsdEl) {
    const numEl  = gnsdEl.querySelector('.gnsd-number');
    const fillEl = gnsdEl.querySelector('.gnsd-bar-fill');
    const ofEl   = gnsdEl.querySelector('.gnsd-of');
    if (gnsd != null) {
      const v = Math.round(gnsd);
      const cls = v >= 70 ? 'gnsd-green' : v >= 40 ? 'gnsd-amber' : 'gnsd-red';
      if (numEl)  { numEl.textContent = v; numEl.className = 'gnsd-number ' + cls; }
      if (fillEl) { fillEl.style.width = v + '%'; fillEl.className = 'gnsd-bar-fill ' + cls; }
      if (ofEl) {
        const capNote  = gnsdResult.ecoCapped ? ' · ⚠ eco cap' : '';
        const dataNote = gnsdResult.indicatorCount < gnsdResult.indicatorTotal
          ? ` · ${gnsdResult.indicatorCount}/${gnsdResult.indicatorTotal} indicators` : '';
        ofEl.textContent = '/ 100' + capNote + dataNote;
      }
    } else {
      if (numEl)  { numEl.textContent = '—'; numEl.className = 'gnsd-number'; }
      if (fillEl) { fillEl.style.width = '0%'; fillEl.className = 'gnsd-bar-fill'; }
      if (ofEl)   { ofEl.textContent = 'insufficient data'; }
    }
  }
  const gniEl = document.getElementById('apex-gni');
  if (gniEl) {
    const gni = hdi?.gni_per_capita;
    gniEl.innerHTML = gni != null
      ? `<div class="apex-stat-label">GNI per Capita</div><div class="apex-stat-value">${fmtGni(gni)}</div><div class="apex-stat-sub">2017 PPP</div>`
      : `<div class="apex-stat-label">GNI per Capita</div><div class="apex-stat-value" style="color:var(--text-muted);font-size:1.5rem">—</div><div class="apex-stat-sub">no data</div>`;
  }
  const gdpEl = document.getElementById('apex-gdp');
  if (gdpEl) {
    gdpEl.innerHTML = gdp?.gdp_total_usd != null
      ? `<div class="apex-stat-label">Total GDP</div><div class="apex-stat-value">$${fmtBillion(gdp.gdp_total_usd)}</div><div class="apex-stat-sub">${gdp.year} · current USD</div>`
      : `<div class="apex-stat-label">Total GDP</div><div class="apex-stat-value" style="color:var(--text-muted);font-size:1.5rem">—</div><div class="apex-stat-sub">no data</div>`;
  }
  document.getElementById('apex-bar')?.classList.add('visible');
}

// =============================================================================
// Landing hub: computePillarStatus
// Returns {score, level, counted, total} for a given pillar code.
// score: pillar mean on 0–100 scale (same as computeGNSD pillar scores).
// level: 'green' (≥67), 'amber' (≥33), 'red' (<33), or 'gray' (<50% coverage).
// Tercile rationale: mirrors traffic-light thresholds in PROTOTYPE_PLAN.md.
// Pillar–indicator mapping mirrors computeGNSD normalisations above.
// Equity pillar added here (not in computeGNSD core — it is a new Day 3 pillar).
// =============================================================================
function computePillarStatus(iso3, pillarCode) {
  function normHigh(val, bad, mid, good) {
    if (val == null || !isFinite(val)) return null;
    if (val <= bad)  return 0;
    if (val <= mid)  return 50 * (val - bad) / (mid - bad);
    if (val <= good) return 50 + 50 * (val - mid) / (good - mid);
    return 100;
  }
  function normLow(val, good, mid, bad) {
    if (val == null || !isFinite(val)) return null;
    if (val <= good) return 100;
    if (val <= mid)  return 50 + 50 * (mid - val) / (mid - good);
    if (val <= bad)  return 50 * (bad - val) / (bad - mid);
    return 0;
  }

  let indicators = [];
  switch (pillarCode) {
    case 'O': {
      const hdi  = Cache.hdi?.data?.[iso3];
      const lu4  = Cache.lu4?.data?.[iso3];
      const neet = Cache.neet?.data?.[iso3];
      const lo   = Cache.learning_outcomes?.data?.[iso3];
      indicators = [
        normHigh(hdi?.mean_schooling, 8, 12, 15),
        normLow(lu4?.value, 5, 10, 25),
        normLow(neet?.value, 10, 15, 30),
        normHigh(lo?.value, 420, 490, 570),
      ];
      break;
    }
    case 'I': {
      const wage = Cache.wage?.data?.[iso3];
      const prod = Cache.productivity?.data?.[iso3];
      const pov  = Cache.poverty_rate?.data?.[iso3];
      const povS = Cache.poverty_societal?.data?.[iso3];
      const cap  = Cache.produced_capital?.data?.[iso3];
      indicators = [
        normHigh(wage?.value, 15000, 35000, 60000),
        normHigh(prod?.value, 30000, 70000, 120000),
        normLow(pov?.value, 10, 20, 40),
        normLow(povS?.value, 5, 15, 35),
        normHigh(cap?.value, 10000, 50000, 120000),
      ];
      break;
    }
    case 'N': {
      const mpi  = Cache.mpi?.data?.[iso3];
      const dw   = Cache.drinking_water?.data?.[iso3];
      const san  = Cache.sanitation?.data?.[iso3];
      const elec = Cache.electricity?.data?.[iso3];
      const inet = Cache.internet?.data?.[iso3];
      indicators = [
        normLow(mpi?.mpi, 0.01, 0.1, 0.35),
        normHigh(dw?.value, 50, 75, 95),
        normHigh(san?.value, 50, 75, 95),
        normHigh(elec?.value, 60, 80, 98),
        normHigh(inet?.value, 20, 50, 90),
      ];
      break;
    }
    case 'EcS': {
      const hale = Cache.hale?.data?.[iso3];
      const uhc  = Cache.uhc_coverage?.data?.[iso3];
      const lbw  = Cache.lbw?.data?.[iso3];
      const gini = Cache.gini?.data?.[iso3];
      const hm   = Cache.homicide_rate?.data?.[iso3];
      const ls   = Cache.life_satisfaction?.data?.[iso3];
      const tr   = Cache.wvs_trust?.data?.[iso3];
      const gc   = Cache.wvs_gov_confidence?.data?.[iso3];
      indicators = [
        normHigh(hale?.value, 60, 70, 75),
        normHigh(uhc?.value, 70, 90, 100),
        normLow(lbw?.value, 7, 10, 15),
        normLow(gini?.value, 30, 40, 50),
        normLow(hm?.value, 3, 6, 10),
        normHigh(ls?.value, 5.0, 6.0, 7.5),
        normHigh(tr?.value, 20, 30, 50),
        normHigh(gc?.value, 30, 40, 60),
      ];
      break;
    }
    case 'EnS': {
      const co2  = Cache.co2?.data?.[iso3];
      const eod  = Cache.ecological_footprint?.data?.[iso3];
      const bii  = Cache.bii?.data?.[iso3];
      const ghg  = Cache.ghg_total?.data?.[iso3];
      const pm25 = Cache.pm25?.data?.[iso3];
      const nat  = Cache.natural_capital?.data?.[iso3];
      const eodNorm = (eod?.ecological_footprint != null && eod?.biocapacity != null)
        ? normLow(eod.ecological_footprint, eod.biocapacity, eod.biocapacity * 1.5, eod.biocapacity * 3) : null;
      indicators = [
        normLow(co2?.co2_per_capita_tco2, 2, 7, 20),
        eodNorm,
        normHigh(bii?.value, 70, 85, 95),
        normLow(ghg?.value, 100, 300, 1000),
        normLow(pm25?.value, 5, 15, 35),
        normHigh(nat?.value, 2000, 10000, 40000),
      ];
      break;
    }
    case 'Eq': {
      const gdi  = Cache.gdi?.data?.[iso3];
      const gii  = Cache.gii?.data?.[iso3];
      const gpr  = Cache.gender_pay_ratio?.data?.[iso3];
      const ipv  = Cache.ipv?.data?.[iso3];
      indicators = [
        normHigh(gdi?.gdi, 0.90, 0.95, 0.975),
        normLow(gii?.gii, 0.10, 0.25, 0.50),
        normHigh(gpr?.value, 0.70, 0.85, 0.95),
        normLow(ipv?.value, 5, 10, 25),
      ];
      break;
    }
    default:
      return { score: null, level: 'gray', counted: 0, total: 0 };
  }

  const counted = indicators.filter(v => v != null).length;
  const total   = indicators.length;
  if (counted === 0 || counted < total * 0.5) {
    return { score: null, level: 'gray', counted, total };
  }
  const score = indicators.filter(v => v != null).reduce((a, b) => a + b, 0) / counted;
  const level = score >= 67 ? 'green' : score >= 33 ? 'amber' : 'red';
  return { score, level, counted, total };
}
