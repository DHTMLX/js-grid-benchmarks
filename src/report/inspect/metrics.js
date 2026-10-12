/**
 * The full metric set, the failure breakdown, correlations, outliers and a survivor map:
 * what the published report leaves out.
 */
import { FIGURE_NOTE, GRIDS, axesOf, collectFailures, indexCells, readSnapshots } from './history.js';

const SECTIONS = ['fails', 'cells', 'corr', 'outliers', 'survivor'];

export function run({ section = 'all' } = {}) {
    if (section !== 'all' && !SECTIONS.includes(section)) {
        throw new Error(`Unknown section "${section}" — one of: all, ${SECTIONS.join(', ')}`);
    }

    const snapshots = readSnapshots();
    const cells     = indexCells(snapshots);
    const failures  = collectFailures(snapshots);
    const { sizes, scenarios } = axesOf(snapshots);

    const context = { cells, failures, sizes, scenarios };
    const wanted  = (name) => section === 'all' || section === name;

    if (wanted('fails'))    failureBreakdown(context);
    if (wanted('cells'))    perCellDump(context);
    if (wanted('corr'))     correlations(context);
    if (wanted('outliers')) outliers(context);
    if (wanted('survivor')) survivorMap(context);
    console.log('');
}

// ── 1. Failure breakdown ──────────────────────────────────────────────────
function failureBreakdown({ failures, sizes }) {
    console.log('\n# Failure breakdown\n');

    const byType     = {};
    const byGrid     = {};
    const byGridSize = {};

    for (const failure of failures) {
        byType[failure.error] = (byType[failure.error] || 0) + 1;

        byGrid[failure.grid] ??= {};
        byGrid[failure.grid][failure.error] = (byGrid[failure.grid][failure.error] || 0) + 1;

        byGridSize[failure.grid] ??= {};
        byGridSize[failure.grid][failure.size] ??= {};
        const bucket = byGridSize[failure.grid][failure.size];
        bucket[failure.error] = (bucket[failure.error] || 0) + 1;
    }

    console.log('## By error type');
    for (const [error, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${error.padEnd(28)} ${count}`);
    }

    console.log('\n## By grid × error type');
    const errorTypes = [...new Set(failures.map(failure => failure.error))];
    console.log('  grid          ' + errorTypes.map(error => error.padStart(22)).join(' '));
    for (const grid of GRIDS) {
        const counts = errorTypes.map(error => String(byGrid[grid]?.[error] ?? 0).padStart(22));
        console.log('  ' + grid.padEnd(12) + '  ' + counts.join(' '));
    }

    console.log('\n## By grid × size (timeout / data_load_failed)');
    console.log('  grid       ' + sizes.map(size => `${(size / 1000).toFixed(0)}k`.padStart(14)).join(' '));
    for (const grid of GRIDS) {
        const cells = sizes.map(size => {
            const bucket = byGridSize[grid]?.[size];
            if (!bucket) return '—'.padStart(14);
            return `${bucket.timeout || 0}t/${bucket.data_load_failed || 0}d`.padStart(14);
        });
        console.log('  ' + grid.padEnd(10) + ' ' + cells.join(' '));
    }

    console.log('\n## Sample of unique failure reasons (first 12)');
    const seen = new Set();
    for (const failure of failures) {
        const signature = `${failure.error}:${(failure.reason || '').slice(0, 80)}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        console.log(`  [${failure.error}] (${failure.grid}/${failure.scenario}/${failure.size}) ${failure.reason?.slice(0, 100) || ''}`);
        if (seen.size >= 12) break;
    }
}

// ── 2. Per-cell full metrics ─────────────────────────────────────────────
const CELL_FIELDS = [
    ['fps',                   'fps'],
    ['p95FrameMs',            'p95'],
    ['p99FrameMs',            'p99'],
    ['avgFrameMs',            'avg'],
    ['maxFrameMs',            'max'],
    ['initialRenderMs',       'init'],
    ['scrollDurationMs',      'scrl'],
    ['jumpMs',                'jump'],
    ['jsHeapPageMB',          'memPg'],
    ['jsHeapGridMB',          'memGr'],
    ['layoutCountDelta',      'lyts'],
    ['layoutDurationDelta',   'lyDur'],
    ['recalcStyleCountDelta', 'styCt'],
    ['recalcStyleDeltaMs',    'styMs'],
    ['scriptDurationMs',      'scrip'],
    ['taskDurationMs',        'task'],
];

function perCellDump({ cells, sizes, scenarios }) {
    console.log('\n# Per-cell full metrics\n');
    console.log(`${FIGURE_NOTE}`);

    for (const size of sizes) {
        if (![...cells.values()].some(cell => cell.size === size)) continue;

        console.log(`\n── size = ${size.toLocaleString()} ───────────────────────────────────────────`);
        console.log('  grid       sc      ' + CELL_FIELDS.map(([, short]) => short.padStart(8)).join(' '));

        for (const scenario of scenarios) {
            for (const grid of GRIDS) {
                const cell = cells.get(`${grid}|${scenario}|${size}`);
                if (!cell) continue;

                const values = CELL_FIELDS.map(([metric]) => {
                    const value = cell[metric]?.value;
                    if (value === null || value === undefined) return '—'.padStart(8);
                    return (Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(1)).padStart(8);
                });
                console.log('  ' + grid.padEnd(10) + ' ' + scenario.padEnd(7) + ' ' + values.join(' '));
            }
        }
    }
}

// ── 3. Correlations ──────────────────────────────────────────────────────
function pearson(xValues, yValues) {
    const count = xValues.length;
    if (count < 3) return null;

    const meanX = xValues.reduce((sum, value) => sum + value, 0) / count;
    const meanY = yValues.reduce((sum, value) => sum + value, 0) / count;

    let covariance = 0, varianceX = 0, varianceY = 0;
    for (let i = 0; i < count; i++) {
        const deviationX = xValues[i] - meanX;
        const deviationY = yValues[i] - meanY;
        covariance += deviationX * deviationY;
        varianceX  += deviationX * deviationX;
        varianceY  += deviationY * deviationY;
    }

    const spread = Math.sqrt(varianceX * varianceY);
    return spread === 0 ? null : covariance / spread;
}

const CORRELATION_PAIRS = [
    ['layoutCountDelta',      'maxFrameMs'],
    ['layoutDurationDelta',   'maxFrameMs'],
    ['scriptDurationMs',      'p95FrameMs'],
    ['scriptDurationMs',      'fps'],
    ['recalcStyleCountDelta', 'p95FrameMs'],
    ['jsHeapGridMB',          'p99FrameMs'],
    ['initialRenderMs',       'fps'],
];

function sample(cells, xMetric, yMetric, gridFilter) {
    const xValues = [], yValues = [];
    for (const cell of cells.values()) {
        if (gridFilter && cell.grid !== gridFilter) continue;
        const x = cell[xMetric]?.value;
        const y = cell[yMetric]?.value;
        if (x !== null && x !== undefined && y !== null && y !== undefined) {
            xValues.push(x);
            yValues.push(y);
        }
    }
    return { xValues, yValues, correlation: pearson(xValues, yValues) };
}

const formatCorrelation = (value) => value === null ? '—' : value.toFixed(3);

function correlations({ cells }) {
    console.log('\n# Correlations (Pearson r across all surviving cells)\n');

    for (const [xMetric, yMetric] of CORRELATION_PAIRS) {
        const { xValues, correlation } = sample(cells, xMetric, yMetric);
        console.log(`  ${xMetric.padEnd(24)} × ${yMetric.padEnd(20)}  n=${String(xValues.length).padStart(3)}  r=${formatCorrelation(correlation)}`);
    }

    console.log('\n## layoutCountDelta × maxFrameMs — per grid');
    for (const grid of GRIDS) {
        const { xValues, correlation } = sample(cells, 'layoutCountDelta', 'maxFrameMs', grid);
        console.log(`  ${grid.padEnd(12)} n=${String(xValues.length).padStart(3)} r=${formatCorrelation(correlation)}`);
    }
}

// ── 4. Outliers / surprising cells ───────────────────────────────────────
const describeCell = (cell) =>
    `${cell.grid.padEnd(11)} ${cell.scenario.padEnd(7)} ${String(cell.size).padStart(7)}`;

function outliers({ cells, failures }) {
    console.log('\n# Outliers / surprising cells\n');

    console.log('## Hidden stutter: FPS ≥ 50 but maxFrameMs > 500');
    for (const cell of cells.values()) {
        const fps          = cell.fps?.value;
        const worstFrameMs = cell.maxFrameMs?.value;
        if (fps >= 50 && worstFrameMs > 500) {
            console.log(`  ${describeCell(cell)}  FPS=${fps.toFixed(0).padStart(3)}  max=${worstFrameMs.toFixed(0).padStart(5)}ms`);
        }
    }

    console.log('\n## Layout-thrash: layoutCountDelta > 5000');
    for (const cell of cells.values()) {
        const layouts = cell.layoutCountDelta?.value;
        if (layouts > 5000) {
            console.log(`  ${describeCell(cell)}  layouts=${layouts.toFixed(0).padStart(6)}  FPS=${cell.fps?.value?.toFixed(0)?.padStart(3) || '—'}  script=${cell.scriptDurationMs?.value?.toFixed(0) || '—'}ms`);
        }
    }

    console.log('\n## Suspiciously low layout count (<300): potential canvas/no-DOM rendering?');
    for (const cell of cells.values()) {
        const layouts = cell.layoutCountDelta?.value;
        if (layouts !== null && layouts !== undefined && layouts < 300) {
            console.log(`  ${describeCell(cell)}  layouts=${layouts.toFixed(0).padStart(4)}  FPS=${cell.fps?.value?.toFixed(0)?.padStart(3) || '—'}`);
        }
    }

    console.log('\n## Instability: p99/p95 ratio > 3 (occasional catastrophic frames)');
    const unstable = [];
    for (const cell of cells.values()) {
        const p95 = cell.p95FrameMs?.value;
        const p99 = cell.p99FrameMs?.value;
        if (p95 && p99 && p95 > 0 && p99 / p95 > 3) unstable.push({ cell, ratio: p99 / p95, p95, p99 });
    }
    unstable.sort((a, b) => b.ratio - a.ratio);
    for (const { cell, ratio, p95, p99 } of unstable.slice(0, 15)) {
        console.log(`  ${describeCell(cell)}  p95=${p95.toFixed(1).padStart(6)}  p99=${p99.toFixed(1).padStart(7)}  ratio=${ratio.toFixed(1)}`);
    }

    console.log('\n## Failures below 200k rows (every grid should survive these)');
    for (const failure of failures) {
        if (failure.size <= 200_000) {
            console.log(`  ${failure.grid}/${failure.scenario}/${failure.size} → ${failure.error}: ${failure.reason?.slice(0, 90) || ''}`);
        }
    }
}

// ── 5. Survivor map ──────────────────────────────────────────────────────
function survivorMap({ cells, failures, sizes, scenarios }) {
    console.log('\n# Survivor map (✓ = succeeded, F = failed, — = no data)\n');

    for (const size of sizes) {
        const measured = [...cells.values()].some(cell => cell.size === size);
        const failed   = failures.some(failure => failure.size === size);
        if (!measured && !failed) continue;

        console.log(`\n── size = ${size.toLocaleString()} ───────`);
        console.log('  scenario  ' + GRIDS.map(grid => grid.padStart(11)).join(' '));

        for (const scenario of scenarios) {
            const marks = GRIDS.map(grid => {
                if (cells.get(`${grid}|${scenario}|${size}`)) return '✓'.padStart(11);
                const cellFailed = failures.some(failure =>
                    failure.grid === grid && failure.scenario === scenario && failure.size === size);
                return (cellFailed ? 'F' : '—').padStart(11);
            });
            console.log('  ' + scenario.padEnd(9) + ' ' + marks.join(' '));
        }
    }
}
