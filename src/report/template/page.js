// Everything this page draws, written into the document by render.js as one JSON block.
// Nothing else in this file is templated — it is a plain script, linted like any other.
const REPORT = JSON.parse(document.getElementById('report-data').textContent);

document.getElementById('heatmap').innerHTML = REPORT.heatmapHtml;

// ── Mini SVG chart renderer ───────────────────────────────────────────────────
// Two primitives are all this report needs: a grouped bar chart and a multi-line
// chart with gaps. Keeping them here avoids pulling in a chart library.
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
}

// Round the axis up to a "nice" ceiling (1/2/5/10 × 10^n) so tick labels stay readable.
// The step is rounded to the *nearest* nice number, not up, so a max like 65 gets
// a step of 10 (0…70) instead of 20 (0…80).
function niceScale(rawMax, targetTicks) {
    if (!(rawMax > 0)) return { max: 1, step: 0.5 };
    const rough = rawMax / targetTicks;
    const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm  = rough / mag;
    const step  = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    return { max: Math.ceil(rawMax / step) * step, step: step };
}

function fmtNum(v) {
    const a = Math.abs(v);
    if (a >= 10000) return Math.round(v / 1000) + 'k';
    if (a >= 1000)  return (v / 1000).toFixed(1) + 'k';
    if (a >= 100)   return String(Math.round(v));
    if (a >= 10)    return String(Math.round(v * 10) / 10);
    return String(Math.round(v * 100) / 100);
}

function withUnit(v, unit) { return fmtNum(v) + (unit ? ' ' + unit : ''); }

function renderLegend(host, items) {
    host.innerHTML = '';
    items.forEach(function (it) {
        const wrap  = document.createElement('span');
        wrap.className = 'lg-item';
        const swatch = document.createElement('i');
        swatch.style.background = it.color;
        wrap.appendChild(swatch);
        wrap.appendChild(document.createTextNode(it.label));
        host.appendChild(wrap);
    });
}

// Shared axis frame: gridlines, y tick labels, rotated y title, x title.
function drawFrame(svg, pad, plotW, plotH, sc, yTitle, xTitle) {
    const y0    = pad.t + plotH;
    const ticks = Math.round(sc.max / sc.step);
    for (let i = 0; i <= ticks; i++) {
        const val = sc.step * i;
        const y   = y0 - (val / sc.max) * plotH;
        svg.appendChild(svgEl('line', {
            x1: pad.l, y1: y, x2: pad.l + plotW, y2: y, class: i === 0 ? 'ax-zero' : 'ax-line',
        }));
        svg.appendChild(svgEl('text', {
            x: pad.l - 8, y: y + 4, 'text-anchor': 'end', class: 'ax-text',
        }, fmtNum(val)));
    }
    if (yTitle) {
        svg.appendChild(svgEl('text', {
            class: 'ax-title', 'text-anchor': 'middle',
            transform: 'translate(14,' + (pad.t + plotH / 2) + ') rotate(-90)',
        }, yTitle));
    }
    if (xTitle) {
        svg.appendChild(svgEl('text', {
            x: pad.l + plotW / 2, y: y0 + 40, 'text-anchor': 'middle', class: 'ax-title',
        }, xTitle));
    }
}

// spec: { height, categories, unit, yMax, yTitle, series: [{ label, values, color, spread }] }
// series.color may be a single color or a per-category array; series.spread, when present,
// is one standard deviation per category and is drawn as a whisker over the bar.
function renderBarChart(host, spec) {
    const W   = Math.max(320, host.clientWidth || 800);
    const H   = spec.height;
    const pad = { l: 74, r: 18, t: 26, b: 44 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const y0    = pad.t + plotH;

    let rawMax = spec.yMax;
    if (rawMax == null) {
        rawMax = 0;
        spec.series.forEach(function (s) {
            s.values.forEach(function (v) { if (v != null && v > rawMax) rawMax = v; });
        });
    }
    const sc  = niceScale(rawMax, 5);
    const svg = svgEl('svg', { width: W, height: H });
    drawFrame(svg, pad, plotW, plotH, sc, spec.yTitle, null);

    const groupW = plotW / spec.categories.length;
    const sn     = spec.series.length;
    const barW   = Math.min(46, (groupW * 0.7) / sn);

    spec.categories.forEach(function (cat, ci) {
        const cx = pad.l + groupW * (ci + 0.5);
        svg.appendChild(svgEl('text', {
            x: cx, y: y0 + 22, 'text-anchor': 'middle', class: 'cat-text',
        }, cat));

        spec.series.forEach(function (s, si) {
            const v = s.values[ci];
            if (v == null) {
                if (si === 0) {
                    svg.appendChild(svgEl('text', {
                        x: cx, y: y0 - 6, 'text-anchor': 'middle', class: 'no-data',
                    }, 'no data'));
                }
                return;
            }
            const x    = cx - (sn * barW) / 2 + si * barW + 1;
            const w    = Math.max(2, barW - 2);
            const yTop = y0 - (Math.min(v, sc.max) / sc.max) * plotH;
            const fill = Array.isArray(s.color) ? s.color[ci] : s.color;

            const rect = svgEl('rect', {
                x: x, y: yTop, width: w, height: Math.max(1, y0 - yTop), rx: 5, fill: fill,
            });
            rect.appendChild(svgEl('title', {}, s.label + ' — ' + cat + ': ' + withUnit(v, spec.unit)));
            svg.appendChild(rect);

            const sd = s.spread ? s.spread[ci] : null;
            let labelY = yTop - 6;

            if (sd > 0) {
                const yHigh = y0 - (Math.min(v + sd, sc.max) / sc.max) * plotH;
                const yLow  = y0 - (Math.max(v - sd, 0) / sc.max) * plotH;
                const cxBar = x + w / 2;
                const cap   = Math.min(7, w / 2);
                svg.appendChild(svgEl('path', {
                    class: 'whisker',
                    d: 'M' + (cxBar - cap) + ',' + yHigh + 'H' + (cxBar + cap)
                     + 'M' + cxBar + ',' + yHigh + 'V' + yLow
                     + 'M' + (cxBar - cap) + ',' + yLow + 'H' + (cxBar + cap),
                }));
                labelY = yHigh - 6;
            }

            const valueText = svgEl('text', {
                x: x + w / 2, y: Math.max(labelY, pad.t + 9), 'text-anchor': 'middle',
                class: 'val-text', fill: si === 0 ? '#1e293b' : '#64748b',
            }, withUnit(v, spec.unit));
            if (sd > 0) valueText.appendChild(svgEl('title', {}, '± ' + withUnit(sd, spec.unit)));
            svg.appendChild(valueText);
        });
    });

    host.innerHTML = '';
    host.appendChild(svg);
}

// spec: { height, xLabels, xTitle, yTitle, unit, series: [{ label, color, values }] }
// Every series draws with the same stroke width and marker size.
// Nulls break the line rather than being bridged (Chart.js spanGaps: false).
function renderLineChart(host, spec) {
    const W   = Math.max(300, host.clientWidth || 600);
    const H   = spec.height;
    const pad = { l: 72, r: 18, t: 14, b: 52 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const y0    = pad.t + plotH;
    const n     = spec.xLabels.length;

    let rawMax = 0;
    spec.series.forEach(function (s) {
        s.values.forEach(function (v) { if (v != null && v > rawMax) rawMax = v; });
    });

    const sc  = niceScale(rawMax, 5);
    const svg = svgEl('svg', { width: W, height: H });
    drawFrame(svg, pad, plotW, plotH, sc, spec.yTitle, spec.xTitle);

    const xOf = function (i) { return n < 2 ? pad.l + plotW / 2 : pad.l + (plotW * i) / (n - 1); };
    const yOf = function (v) { return y0 - (v / sc.max) * plotH; };

    spec.xLabels.forEach(function (label, i) {
        svg.appendChild(svgEl('text', {
            x: xOf(i), y: y0 + 20, 'text-anchor': 'middle', class: 'cat-text',
        }, label));
    });

    if (rawMax === 0) {
        svg.appendChild(svgEl('text', {
            x: pad.l + plotW / 2, y: pad.t + plotH / 2, 'text-anchor': 'middle', class: 'no-data',
        }, 'no data for this combination'));
        host.innerHTML = '';
        host.appendChild(svg);
        return;
    }

    // Lines first, points after, so markers stay on top of every stroke.
    spec.series.forEach(function (s) {
        let run = [];
        const flush = function () {
            if (run.length > 1) {
                svg.appendChild(svgEl('polyline', {
                    points: run.join(' '), fill: 'none', stroke: s.color,
                    'stroke-width': 2,
                    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
                }));
            }
            run = [];
        };
        s.values.forEach(function (v, i) {
            if (v == null) { flush(); return; }
            run.push(xOf(i) + ',' + yOf(v));
        });
        flush();
    });

    spec.series.forEach(function (s) {
        s.values.forEach(function (v, i) {
            if (v == null) return;
            const dot = svgEl('circle', {
                cx: xOf(i), cy: yOf(v), r: 3.5,
                fill: s.color, stroke: '#fff', 'stroke-width': 1,
            });
            dot.appendChild(svgEl('title', {},
                s.label + ' @ ' + spec.xLabels[i] + ': ' + withUnit(v, spec.unit)));
            svg.appendChild(dot);
        });
    });

    host.innerHTML = '';
    host.appendChild(svg);
}

// ── Interactive bar chart ─────────────────────────────────────────────────────
const IDATA = REPORT.interactive;

let iMetric   = IDATA.metrics[0].key;
let iSize     = IDATA.sizes[0];
let iScenario = IDATA.scenarios[0];

function getInteractiveValues() {
    return IDATA.grids.map(g => {
        const rec = IDATA.lookup[`${g}|${iScenario}|${iSize}`];
        return rec ? (rec[iMetric] ?? null) : null;
    });
}

function getInteractiveSpread() {
    return IDATA.grids.map(g => {
        const rec = IDATA.lookup[`${g}|${iScenario}|${iSize}`];
        return rec ? (rec[iMetric + 'Stddev'] ?? null) : null;
    });
}

// How many runs the shown bars stand on. Cells are measured the same number of times, so
// a single figure is the usual answer; a mixed selection says so rather than picking one.
function getInteractiveRuns() {
    const counts = [];
    IDATA.grids.forEach(g => {
        const rec = IDATA.lookup[`${g}|${iScenario}|${iSize}`];
        if (rec && rec.runs && counts.indexOf(rec.runs) === -1) counts.push(rec.runs);
    });
    return counts.sort((a, b) => a - b);
}

function getPrevValues() {
    return IDATA.grids.map(g => {
        const rec = IDATA.prevLookup[`${g}|${iScenario}|${iSize}`];
        return rec ? (rec[iMetric] ?? null) : null;
    });
}

// Worst, middle, best. The same three stops the legend swatch spells out as RANK_GRADIENT.
const RANK_STOPS = [
    [220, 38, 38],
    [202, 138, 4],
    [22, 163, 74],
];

/** Rank 0 (worst) to 1 (best) as a colour, through the middle stop at 0.5. */
function interpolateColor(ratio) {
    const half     = ratio < 0.5 ? 0 : 1;
    const from     = RANK_STOPS[half];
    const to       = RANK_STOPS[half + 1];
    const distance = ratio * 2 - half;

    const [r, g, b] = from.map((channel, i) => Math.round(channel + (to[i] - channel) * distance));
    return `rgb(${r},${g},${b})`;
}

function getInteractiveColors(values) {
    const m    = getMetricMeta();
    const nums = values.filter(v => v != null);
    if (!nums.length) return values.map(() => '#e2e8f0');
    const min  = Math.min(...nums);
    const max  = Math.max(...nums);
    return values.map(v => {
        if (v == null) return '#e2e8f0';
        const ratio = max === min ? 1 : (v - min) / (max - min);
        return interpolateColor(m.higherBetter ? ratio : 1 - ratio);
    });
}

function getMetricMeta() {
    return IDATA.metrics.find(m => m.key === iMetric);
}

const RANK_GRADIENT = 'linear-gradient(90deg,#dc2626,#ca8a04,#16a34a)';

// What the display can and cannot say about the FPS column. rAF cannot outrun the screen,
// so bars at the ceiling are the screen's number, not the grid's.
function displayNote() {
    const d = IDATA.display;
    if (!d) return 'This run recorded no display, so the FPS ceiling is unknown.';
    if (d.source === 'headless') {
        return 'Headless Chromium: frames follow a synthetic cadence rather than a display, so these '
             + 'figures compare the grids with each other and with nothing else.';
    }
    if (!d.trustworthy) return 'FPS not validated — ' + d.warning;
    return 'The display measured ' + d.refreshHz + ' Hz, and no bar can go above it: grids that '
         + 'reach the ceiling are separated by the frame-time metrics, not by this one.';
}

function selectionNote() {
    const m     = getMetricMeta();
    const runs  = getInteractiveRuns();
    const parts = [];

    if (runs.length === 1) parts.push('Median of ' + runs[0] + ' runs; the whisker spans ±1 SD.');
    else if (runs.length)  parts.push('Median of ' + runs.join('–') + ' runs; the whisker spans ±1 SD.');

    if (m.note) parts.push(m.note);
    if (m.key === 'fps') parts.push(displayNote());

    return parts.join(' ');
}

function updateIChart() {
    const m        = getMetricMeta();
    const values   = getInteractiveValues();
    const prev     = getPrevValues();
    const fixedMax = m.max ?? (IDATA.scales[iMetric + '|' + iSize] ?? null);

    renderLegend(document.getElementById('interactive-legend'), [
        { label: 'Latest run (color = rank in this chart)', color: RANK_GRADIENT },
        { label: 'Previous run',                             color: 'rgba(148,163,184,0.45)' },
    ]);

    renderBarChart(document.getElementById('interactive-chart'), {
        height:     420,
        categories: IDATA.grids.map(g => IDATA.gridLabels[g]),
        unit:       m.unit,
        yMax:       fixedMax,
        yTitle:     m.label + (m.higherBetter ? ' (higher = better)' : ' (lower = better)'),
        series: [
            {
                label:  'Latest run',
                values: values,
                color:  getInteractiveColors(values),
                spread: getInteractiveSpread(),
            },
            { label: 'Previous run', values: prev, color: 'rgba(148,163,184,0.45)' },
        ],
    });

    document.getElementById('interactive-note').textContent = selectionNote();
}

function buildControls() {
    const ctrl = document.getElementById('interactive-controls');

    const rows = [
        { label: 'Metric:',   items: IDATA.metrics.map(m => ({ val: m.key,      txt: m.label, tier: m.tier })), get: () => iMetric, set: v => { iMetric = v; } },
        { label: 'Size:',     items: IDATA.sizes.map(s =>    ({ val: s,          txt: s >= 1000 ? (s/1000)+'k' : s })), get: () => iSize,     set: v => { iSize     = +v; } },
        { label: 'Scenario:', items: IDATA.scenarios.map(s => ({ val: s,         txt: s })),           get: () => iScenario, set: v => { iScenario = v; } },
    ];

    rows.forEach(row => {
        const div = document.createElement('div');
        div.className = 'ctrl-row';
        const lbl = document.createElement('span');
        lbl.className = 'ctrl-label';
        lbl.textContent = row.label;
        div.appendChild(lbl);

        // The headline metrics are the comparison; what follows the divider qualifies them
        // and is not ranked on.
        let dividerPlaced = false;

        row.items.forEach(item => {
            if (item.tier === 'secondary' && !dividerPlaced) {
                dividerPlaced = true;
                const divider = document.createElement('span');
                divider.className = 'ctrl-tier';
                divider.textContent = 'read alongside';
                div.appendChild(divider);
            }

            const btn = document.createElement('button');
            btn.className = 'ctrl-btn' + (item.tier === 'secondary' ? ' ctrl-btn-secondary' : '')
                          + (String(row.get()) === String(item.val) ? ' active' : '');
            btn.textContent = IDATA.scenarioLabels?.[item.val] || item.txt;
            btn.dataset.val = item.val;
            btn.addEventListener('click', () => {
                row.set(item.val);
                div.querySelectorAll('.ctrl-btn').forEach(b => b.classList.toggle('active', b.dataset.val === String(item.val)));
                updateIChart();
            });
            div.appendChild(btn);
        });
        ctrl.appendChild(div);
    });
}

buildControls();
updateIChart();

// ── Scaling line charts ───────────────────────────────────────────────────────
// The same measured cells the bar chart above draws from; only the axes differ.
const SDATA = REPORT.scaling;

let sMetric       = SDATA.defaults.metric;
let sRowsScenario = SDATA.defaults.rowsScenario;
let sColsSize     = SDATA.defaults.colsSize;
let sColsFamily   = SDATA.defaults.colsFamily;

function getFamily() {
    return SDATA.families.find(f => f.id === sColsFamily) || SDATA.families[0];
}

function sizeLabel(sz) { return sz >= 1000 ? (sz / 1000) + 'k' : String(sz); }

function getSMetricMeta() {
    return SDATA.metrics.find(m => m.key === sMetric);
}

// Compute metric value from a record, deriving rows/ms for "speed" metrics.
function metricValue(rec, x) {
    if (!rec) return null;
    const m = getSMetricMeta();
    if (m.base) {
        const t = rec[m.base];
        if (t == null || t <= 0 || x == null) return null;
        return Math.round((x / t) * 100) / 100;  // rows per ms, 2 decimals
    }
    return rec[m.key] ?? null;
}

function rowsSeries() {
    return SDATA.grids.map(g => ({
        label:  SDATA.gridLabels[g],
        color:  SDATA.gridColors[g],
        values: SDATA.sizes.map(sz => metricValue(IDATA.lookup[`${g}|${sRowsScenario}|${sz}`], sz)),
    }));
}

function colsSeries() {
    const fam = getFamily();
    return SDATA.grids.map(g => ({
        label:  SDATA.gridLabels[g],
        color:  SDATA.gridColors[g],
        values: fam.scens.map(sc => metricValue(IDATA.lookup[`${g}|${sc}|${sColsSize}`], sColsSize)),
    }));
}

function updateScalingCharts() {
    const m    = getSMetricMeta();
    const hint = m.higherBetter ? ' (higher = better)' : ' (lower = better)';
    // Skip the unit when the label already carries it, so "Scroll FPS" does not
    // render as "Scroll FPS, fps".
    const dup    = m.unit && m.label.toLowerCase().indexOf(m.unit.toLowerCase()) !== -1;
    const yTitle = m.label + (m.unit && !dup ? ', ' + m.unit : '') + hint;

    const legendItems = SDATA.grids.map(g => ({
        label: SDATA.gridLabels[g], color: SDATA.gridColors[g],
    }));
    renderLegend(document.getElementById('rows-legend'), legendItems);
    renderLegend(document.getElementById('cols-legend'), legendItems);

    renderLineChart(document.getElementById('rows-chart'), {
        height:  340,
        xLabels: SDATA.sizes.map(sizeLabel),
        xTitle:  'Row count',
        yTitle:  yTitle,
        unit:    m.unit,
        series:  rowsSeries(),
    });

    renderLineChart(document.getElementById('cols-chart'), {
        height:  340,
        xLabels: getFamily().cols.map(String),
        xTitle:  'Column count — ' + getFamily().label.toLowerCase() + ' cells',
        yTitle:  yTitle,
        unit:    m.unit,
        series:  colsSeries(),
    });
}

function buildScalingControls() {
    const root = document.getElementById('scaling-controls');

    const rows = [
        {
            label: 'Metric:',
            items: SDATA.metrics.map(m => ({ val: m.key, txt: m.label })),
            get:   () => sMetric,
            set:   v => { sMetric = v; },
        },
        {
            label: 'Scenario (rows):',
            items: SDATA.rowsScens.map(s => ({ val: s, txt: SDATA.scenarioLabels[s] || s })),
            get:   () => sRowsScenario,
            set:   v => { sRowsScenario = v; },
        },
        {
            label: 'Size (cols):',
            items: SDATA.sizes.map(s => ({ val: s, txt: sizeLabel(s) })),
            get:   () => sColsSize,
            set:   v => { sColsSize = +v; },
        },
        {
            label: 'Cells (cols):',
            items: SDATA.families.map(f => ({ val: f.id, txt: f.label })),
            get:   () => sColsFamily,
            set:   v => { sColsFamily = v; },
        },
    ];

    rows.forEach(row => {
        const div = document.createElement('div');
        div.className = 'ctrl-row';
        const lbl = document.createElement('span');
        lbl.className = 'ctrl-label';
        lbl.textContent = row.label;
        div.appendChild(lbl);

        row.items.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'ctrl-btn' + (String(row.get()) === String(item.val) ? ' active' : '');
            btn.textContent = item.txt;
            btn.dataset.val = item.val;
            btn.addEventListener('click', () => {
                row.set(item.val);
                div.querySelectorAll('.ctrl-btn').forEach(b => b.classList.toggle('active', b.dataset.val === String(item.val)));
                updateScalingCharts();
            });
            div.appendChild(btn);
        });
        root.appendChild(div);
    });
}

buildScalingControls();
updateScalingCharts();

// SVG is sized in real pixels, so redraw on resize instead of relying on CSS scaling.
let resizeTimer = null;
window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
        updateIChart();
        updateScalingCharts();
    }, 150);
});
