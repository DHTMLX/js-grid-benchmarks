/**
 * Runs inside host.html: reads the URL parameters, loads the grid's assets, fetches the
 * dataset, creates the grid and runs the scroll benchmark.
 *
 * URL params:
 *   grid     — grid id (dhtmlx, ag-grid, kendo, …)
 *   scenario — scenario id (tpl10, pln20, …)
 *   size     — dataset size (default 10000)
 *   gate             — if present, pause before create() until the runner opens the gate
 *   maxScrollDistance — how far the scroll test travels, in px
 */

import { gridMap }              from '../core/registry.js';
import { scenarios }            from '../config/scenarios.js';
import { getColumns }           from '../utils/columns.js';
import { classCensus, fpsCounter, scroller, watchJump, watchRows } from '../bench/measure.js';
import { adapterFor }           from '../adapters/index.js';
import {
    DEFAULT_SCROLL_DISTANCE, DRAIN_MS, JUMP_TARGET_FRACTION, PAINT_SETTLE_MS,
    ROW_HEIGHT, ROW_HEIGHT_TOLERANCE_PX,
} from '../core/measurement.js';

// Read by host.html's stylesheet, which is where Kendo's row height is set.
document.documentElement.style.setProperty('--bench-row-height', `${ROW_HEIGHT}px`);

// Injected by vite.config.js from src/core/ports.js.
const DATA_SERVER_URL = __DATA_SERVER_URL__;

const params     = new URLSearchParams(location.search);
const gridId     = params.get('grid')     || 'dhtmlx';
const scenarioId = params.get('scenario') || 'tpl20';
const size       = parseInt(params.get('size') || '50', 10);
const gated      = params.has('gate');
// The fallback is for the manual viewer, which opens this page without the parameter.
const maxScrollDistance = parseInt(params.get('maxScrollDistance'), 10) || DEFAULT_SCROLL_DISTANCE;

const gridConfig = gridMap[gridId];
const scenario   = scenarios[scenarioId];

if (!gridConfig || !scenario) {
    document.body.innerHTML = `<pre style="color:red;padding:16px">Unknown grid "${gridId}" or scenario "${scenarioId}"</pre>`;
    throw new Error('Bad params');
}

/** End the run with a reason. The runner reads __benchmarkResult and reports it as a cell. */
function fail(error, message) {
    window.__benchmarkResult = { error, message };
    window.__benchmarkDone   = true;
    return new Error(message);
}

// License banners and JS exceptions.
window.onerror = (msg, _src, _line, _col, err) => {
    if (!window.__benchmarkDone) {
        fail('uncaught_error', err?.message || (typeof msg === 'string' ? msg : 'uncaught_error'));
    }
};

// ── 1. Load the grid's vendored scripts and styles ─────────────────────────
async function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script   = document.createElement('script');
        script.src     = src;
        script.onload  = resolve;
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
}

function loadStyle(href) {
    const link = document.createElement('link');
    link.rel   = 'stylesheet';
    link.href  = href;
    document.head.appendChild(link);
}

for (const href of (gridConfig.assets.styles || []))  loadStyle(href);
try {
    for (const src of (gridConfig.assets.scripts || [])) await loadScript(src);
} catch (err) {
    throw fail('asset_load_failed', err.message);
}

// ── 2. Fetch dataset ───────────────────────────────────────────────────────
let data;
try {
    const response = await fetch(`${DATA_SERVER_URL}/${scenarioId}/${size}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    console.log(`[host] loaded ${data.length} rows`);
} catch (err) {
    document.body.innerHTML = `<pre style="color:red;padding:16px">Failed to load dataset: ${err.message}\n\nMake sure the dataset server is running:\n  npm run data-server</pre>`;
    throw fail('data_load_failed', err.message);
}

// ── 3. Select adapter ─────────────────────────────────────────────────────
const adapter = adapterFor(gridId);

const columns   = getColumns(scenario);
const container = document.getElementById('grid-container');

// ── 4. Create the grid and time it by the DOM ──────────────────────────────
// The clock starts before create() and stops when rows are on screen; the creation promise
// is awaited only for the handle.
let grid;
let render;

// An adapter whose row selector matches nothing waits forever on a page that looks correct.
// The runner collects console errors and reports this with the timeout.
setTimeout(() => {
    if (window.__renderWatch?.rows) return;
    console.error(`[host] ${gridId}: nothing matched the adapter's row selector after 5s. `
                + `Present in the container: ${classCensus(container)}`);
}, 5_000);

// What initialRenderMs would have been if measured from the vendor's own ready signal.
let vendorReadyMs = null;

// The runner takes its CDP baseline here, with the bundle and the dataset already loaded.
if (gated) {
    window.__atGate = true;
    await new Promise(resolve => { window.__openGate = resolve; });
}

const renderStart = performance.now();
try {
    const created = Promise.resolve(adapter.create(container, { columns, data, scenario }));
    created.then(() => { vendorReadyMs = +(performance.now() - renderStart).toFixed(2); });

    // A rejected create must surface; a resolved one must not end the wait.
    render = await Promise.race([
        watchRows({ getRows: () => adapter.getRenderedRows(container), startedAt: renderStart }),
        created.then(() => new Promise(() => {})),
    ]);
    grid = await created;
    // Published on window so scenario operations and devtools can reach the instance.
    window.__gridInstance = grid;
} catch (err) {
    console.error('[host] grid creation failed:', err);
    throw fail('grid_creation_failed', err.message);
}

// ── 5. Render invariants ───────────────────────────────────────────────────
// A violation is recorded as a failed cell, not as a number. Both describe a grid that is
// not measuring the same thing as the other four, and both otherwise look plausible.

if (Math.abs(render.rowHeightPx - ROW_HEIGHT) > ROW_HEIGHT_TOLERANCE_PX) {
    throw fail('row_height_mismatch',
        `${gridId} renders rows at ${render.rowHeightPx}px instead of ${ROW_HEIGHT}px, so its `
        + 'viewport holds a different number of rows than the other grids');
}

// How many rows the viewport holds. Recorded beside renderedRows: a grid that keeps four
// times that in the DOM is doing four times the work per frame, and the figures cannot be
// read without knowing it.
const viewportRows = Math.floor(container.clientHeight / ROW_HEIGHT);
if (render.renderedRows >= size && size > viewportRows * 4) {
    throw fail('virtualization_absent',
        `${gridId} put all ${render.renderedRows} rows in the DOM at once — nothing was `
        + 'virtualized, so the scroll test would measure a different thing than for the others');
}

console.log(`[host] ${render.renderedRows} rows in the DOM of ${viewportRows} visible, `
          + `${render.rowHeightPx}×${render.rowWidthPx}px each, `
          + `first row after ${render.timeToFirstRowMs}ms, viewport filled at ${render.initialRenderMs}ms, `
          + `vendor reported ready at ${vendorReadyMs}ms`);

// ── 6. Let the first paint settle, then run the benchmark ─────────────────
setTimeout(runBenchmark, PAINT_SETTLE_MS);

async function runBenchmark() {
    const scrollNode = adapter.getScrollContainer(container);

    if (!scrollNode) {
        console.error('[host] no scroll container found');
        fail('scroll_container_not_found', 'no scroll container found');
        return;
    }

    const end = scrollNode.scrollHeight - scrollNode.clientHeight;
    if (end <= 0) {
        fail('scroll_end_zero', `scrollHeight=${scrollNode.scrollHeight} clientHeight=${scrollNode.clientHeight}`);
        return;
    }
    runScroll(end, value => { scrollNode.scrollTop = value; }, maxScrollDistance);
}

/**
 * Land deep in the dataset in one step and time the viewport catching up.
 *
 * The position is driven the same way the scroll test drives it, rather than through each
 * vendor's own scroll-to-row call: those differ in whether they animate, page or defer, and
 * timing them would compare the APIs instead of the rendering.
 */
function measureJump(end, scrollFn) {
    const startedAt = performance.now();
    scrollFn(Math.round(end * JUMP_TARGET_FRACTION));

    return watchJump({
        getRows: () => adapter.getRenderedRows(container),
        startedAt,
    });
}

function runScroll(end, scrollFn, maxDistance) {
    const fps = fpsCounter();
    const scrollStart = performance.now();

    const finish = () => {
        const fpsResult = fps();
        const scrollDurationMs = +(performance.now() - scrollStart).toFixed(2);

        // Several grids move work out of the scroll handler into a timeout or an idle
        // callback. Counted separately from the scroll figures.
        const tail = fpsCounter();
        setTimeout(async () => {
            const tailResult = tail();
            const jumpMs     = await measureJump(end, scrollFn);

            window.__benchmarkResult = {
                grid:            gridId,
                scenario:        scenarioId,
                fps:             Math.round(fpsResult.fps),
                avgFrameMs:      +fpsResult.avgFrameMs.toFixed(2),
                maxFrameMs:      +fpsResult.maxFrameMs.toFixed(2),
                frames:           fpsResult.frames,
                // The published percentiles are computed from these pooled across runs.
                frameTimes:       fpsResult.frameTimes,
                tailFrames:       tailResult.frames,
                tailMaxFrameMs:  +tailResult.maxFrameMs.toFixed(2),
                durationMs:      +fpsResult.durationMs.toFixed(2),
                scrollDurationMs,
                jumpMs,
                initialRenderMs:  render.initialRenderMs,
                timeToFirstRowMs: render.timeToFirstRowMs,
                vendorReadyMs,
                renderedRows:     render.renderedRows,
                viewportRows,
                rowHeightPx:      render.rowHeightPx,
                rowWidthPx:       render.rowWidthPx,
                timestamp:        Date.now(),
            };
            window.__benchmarkDone = true;
            console.log(JSON.stringify({ type: 'benchmark', ...window.__benchmarkResult }));
        }, DRAIN_MS);
    };

    scroller({ end, scrollFn, maxDistance, callback: finish });
}
