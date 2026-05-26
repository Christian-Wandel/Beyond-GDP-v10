// =============================================================================
// core.js — Shared infrastructure for Beyond GDP Dashboard
// Extracted from index.html. Contains:
//   - Theme tokens, data cache, normalization helpers
//   - GNSD composite score
//   - Country selector, tooltip drawer, theme toggle
//   - URL param helpers (getCountryFromURL / setCountryInURL)
//   - Environment pillar render functions (renderCo2, renderCh4, renderFootprint,
//     renderBii, renderGhgTotal, renderPm25, renderProducedCapital)
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
  const pillarN   = [normLow(mpi?.mpi, 0.01, 0.1, 0.35), normLow(matfp?.mf_per_capita_t, 8, 16, 30)];
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
  setStatus('footprint-status', level, level === 'green' ? null : `${fpPct}% above target`);

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
  setStatus('co2-status', level, level === 'green' ? null : `${co2Pct}% above target`);

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
  setStatus('ch4-status', level, (level === 'green' || level === 'green-dark') ? null : `${ch4Pct}% above target`);

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
  setStatus('bii-status', level, level === 'green' ? null : `${biiPct}% below target`);
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
  setStatus('pm25-status', level, level === 'green' ? null : `${pm25Pct}% above WHO guideline`);

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

// ── New Tier I: Net Produced Capital ─────────────────────────────────────────
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
  setStatus('capital-status', level, level === 'green' ? null : `${capPct}% below threshold`);

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
  const cap = Cache.produced_capital?.data?.[iso3];

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

  const capEl = document.getElementById('tooltip-capital-body');
  if (capEl) {
    if (cap?.value != null) {
      const v = cap.value;
      capEl.innerHTML = `<strong>${name}'s</strong> net produced capital stock is <strong>${fmtGni(v)} per person</strong> — the value of machinery, infrastructure, and built assets (World Bank CWON 2021). Higher produced capital enables productivity and income. Threshold: below $10k/person = low base; above $50k = adequate${cap.year ? `; data year: ${cap.year}` : ''}.`;
    } else { capEl.textContent = 'No produced capital data available for this country.'; }
  }
}
