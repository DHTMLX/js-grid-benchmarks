/**
 * The benchmark itself: start the servers, drive Chromium through every
 * grid × scenario cell, and return what was measured.
 *
 * Nothing here reads argv, writes a file or exits. `bin/bench.js` does that, and `matrix.js`
 * calls `runBenchmark()` directly instead of spawning a process to reach it.
 */

import { chromium } from 'playwright';
import fs   from 'fs';
import path from 'path';

import {
    checkFps, describeMachine, detectMachineId, measureRefreshHz,
} from './environment.js';
import { resolveSessionId } from './session.js';
import { summarize } from './stats.js';
import { grids }     from '../core/registry.js';
import { scenarios, scenarioSets } from '../config/scenarios.js';
import {
    DATA_SERVER_SCRIPT, HISTORY_DIR, LATEST_FILE, RESULTS_DIR, ROOT, VERSIONS_FILE, VITE_BIN,
    ensureDir,
} from '../core/paths.js';
import { DATA_SERVER_PORT, VIEWER_PORT, VIEWER_URL } from '../core/ports.js';
import { SCROLL_PX_PER_MS } from '../core/measurement.js';
import { DEFAULT_SIZE } from '../core/options.js';
import { defaultsFor } from '../core/cli.js';
import { createCleanup, ensureServer, spawnNode, waitForPort } from '../core/process.js';

/** Requested viewport. What the page actually came up at is measured and recorded beside it. */
const BENCH_VIEWPORT = { width: 1920, height: 1080 };

export class BenchmarkError extends Error {}

/** Fisher-Yates, in place. */
function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

// Warming is a property of the disk and Vite's cache, not of a browser context, so it
// outlives both and does not repeat between the cells of a run.
const warmedGrids = new Set();

/**
 * Fetch every grid's bundle before the matrix starts, so the first grid measured does not
 * pay alone for reading files off a cold disk. Also fails fast when vendor/ is empty.
 */
async function warmAssets(gridList) {
    const pending = gridList.filter(grid => !warmedGrids.has(grid.id));
    if (!pending.length) return;

    for (const grid of pending) {
        for (const asset of [...(grid.assets.scripts ?? []), ...(grid.assets.styles ?? [])]) {
            const response = await fetch(`${VIEWER_URL}${asset}`);
            if (!response.ok) {
                throw new BenchmarkError(
                    `${grid.id}: ${asset} is not being served (HTTP ${response.status}). Run \`npm run vendor\`.`,
                );
            }
            await response.arrayBuffer();
        }
        warmedGrids.add(grid.id);
    }
    console.log(`   Warmed:    ${pending.map(grid => grid.id).join(', ')}`);
}

function selectGrids(filter) {
    const selected = filter ? grids.filter(grid => grid.id === filter) : grids;
    if (!selected.length) throw new BenchmarkError(`No grid matching "${filter}"`);
    return selected;
}

function selectScenarios(filter, setName) {
    const ids = filter ? [filter] : scenarioSets[setName];
    if (!ids?.length) throw new BenchmarkError(`No scenario matching "${filter ?? setName}"`);
    return ids.map(id => [id, scenarios[id]]);
}

/** How long one cell may take: loading and rendering the dataset, then scrolling it. */
function timeoutFor(size, maxDistance) {
    const load = Math.max(30_000, Math.round(30_000 + (size - 10_000) * 0.1));
    return load + Math.round(maxDistance / SCROLL_PX_PER_MS);
}

const metricsToMap = (metrics) => Object.fromEntries(metrics.map(metric => [metric.name, metric.value]));

/**
 * Collect garbage, then read the performance counters. Taken on both sides of the run,
 * so the heap figures are what is still held and not uncollected litter.
 */
async function snapshot(client) {
    await client.send('HeapProfiler.collectGarbage');
    return metricsToMap((await client.send('Performance.getMetrics')).metrics);
}

/** Fit the OS window to the screen. Playwright emulates the viewport separately. */
async function fitWindowToScreen(page) {
    try {
        const screen = await page.evaluate(() => ({ width: screen.availWidth, height: screen.availHeight }));
        const session = await page.context().newCDPSession(page);
        const { windowId } = await session.send('Browser.getWindowForTarget');
        await session.send('Browser.setWindowBounds', {
            windowId,
            bounds: {
                left: 0, top: 0, windowState: 'normal',
                width:  Math.min(BENCH_VIEWPORT.width,  screen.width),
                height: Math.min(BENCH_VIEWPORT.height, screen.height),
            },
        });
        // setWindowBounds positions but does not raise z-order.
        await page.bringToFront();
    } catch (err) {
        console.warn(`   (window positioning failed: ${err.message})`);
    }
}

/** The CDP counters as deltas across the run, in the units the results file publishes. */
function countersBetween(pre, post) {
    return {
        jsHeapPageMB:          +(post.JSHeapUsedSize / 1024 / 1024).toFixed(2),
        jsHeapGridMB:          +((post.JSHeapUsedSize - pre.JSHeapUsedSize) / 1024 / 1024).toFixed(2),
        layoutCountDelta:      post.LayoutCount      - pre.LayoutCount,
        layoutDurationDelta:   +((post.LayoutDuration - pre.LayoutDuration) * 1000).toFixed(3),
        recalcStyleCountDelta: post.RecalcStyleCount  - pre.RecalcStyleCount,
        recalcStyleDeltaMs:    +((post.RecalcStyleDuration - pre.RecalcStyleDuration) * 1000).toFixed(3),
        scriptDurationMs:      +((post.ScriptDuration - pre.ScriptDuration) * 1000).toFixed(3),
        taskDurationMs:        +((post.TaskDuration   - pre.TaskDuration)   * 1000).toFixed(3),
    };
}

/** What the page came up at, warning when it is not what was asked for. */
async function readViewport(page) {
    const seen = await page.evaluate(() => ({
        width:  window.innerWidth,
        height: window.innerHeight,
        dpr:    +window.devicePixelRatio.toFixed(3),
    }));

    if (seen.width !== BENCH_VIEWPORT.width || seen.height !== BENCH_VIEWPORT.height) {
        console.warn(`\n  ! viewport came up ${seen.width}×${seen.height}, not the `
                   + `requested ${BENCH_VIEWPORT.width}×${BENCH_VIEWPORT.height} — `
                   + 'a different number of rows is on screen than in a published run');
    }
    return { ...seen, requested: BENCH_VIEWPORT, measured: true };
}

/**
 * One pass over one cell: open the host page, take the baseline at the gate, let the page
 * run itself, and read the counters back.
 *
 * Returns `{ run }` with the metrics, or `{ error, reason }` naming why there is no figure.
 * A grid that fails is not an exception — the matrix has to carry on to the next one.
 */
async function measureRun({ context, url, timeoutMs, headless, measureViewport }) {
    const page = await context.newPage();

    try {
        // A 1920×1080 viewport plus OS window chrome overflows an FHD screen.
        if (!headless) await fitWindowToScreen(page);

        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));
        page.on('console',   msg => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

        const client = await page.context().newCDPSession(page);
        await client.send('Performance.enable');
        await client.send('HeapProfiler.enable');

        await page.goto(url, { waitUntil: 'domcontentloaded' });

        const viewport = measureViewport ? await readViewport(page) : null;

        let pre = null;
        let result;
        try {
            // The page stops itself just short of create(); the baseline is taken there,
            // with the bundle and the dataset already loaded. A page that failed while
            // loading never reaches the gate, hence __benchmarkDone.
            await page.waitForFunction(
                () => window.__atGate === true || window.__benchmarkDone === true,
                null, { timeout: timeoutMs },
            );
            if (!await page.evaluate(() => window.__benchmarkDone === true)) {
                pre = await snapshot(client);
                await page.evaluate(() => window.__openGate());
            }

            await page.waitForFunction(() => window.__benchmarkDone === true, null, { timeout: timeoutMs });
            result = await page.evaluate(() => window.__benchmarkResult);
        } catch (err) {
            // What the page was waiting for when the clock ran out. Separates a grid that
            // never rendered from one whose selector matched nothing.
            const watch = await page.evaluate(() => window.__renderWatch).catch(() => null);
            const stalled = watch
                ? ` (still waiting for rows after ${Math.round(watch.waitedMs)}ms, ${watch.rows} matched the adapter's selector)`
                : '';
            return { viewport, error: 'timeout', reason: (pageErrors[0] || err.message) + stalled };
        }

        // The grid finished but reported an error of its own.
        if (!result || result.error) {
            return {
                viewport,
                error:  result?.error || 'no_result',
                reason: result?.message || result?.error || pageErrors[0] || 'unknown',
            };
        }

        // No baseline means the page ran past the gate without stopping at it, and every
        // delta below would be counted from nothing.
        if (!pre) {
            return { viewport, error: 'no_baseline', reason: 'the page passed the gate without stopping at it' };
        }

        return { viewport, run: { ...result, ...countersBetween(pre, await snapshot(client)) } };
    } finally {
        await page.close();
    }
}

/**
 * One grid × scenario cell: its own browser context, the warmups, then the measured runs.
 *
 * The context is per cell so nothing a grid leaves behind reaches the next one, and the
 * warmups live inside it, so they prime exactly what is measured afterwards.
 */
async function measureCell({ browser, cell, plan, measureViewport }) {
    const { grid, scenarioId, scenario } = cell;
    const { size, runs: wanted, warmup, timeoutMs, headless, maxDistance } = plan;

    console.log(`\n► ${grid.name} / ${scenario.name}`);

    const url = `${VIEWER_URL}/host.html?grid=${grid.id}&scenario=${scenarioId}`
              + `&size=${size}&maxScrollDistance=${maxDistance}&gate=1`;

    const context = await browser.newContext({ viewport: BENCH_VIEWPORT });
    const runs    = [];
    const failed  = [];
    let viewport  = null;

    try {
        for (let i = 0; i < warmup + wanted; i++) {
            const isWarmup = i < warmup;
            if (isWarmup) process.stdout.write(`  warmup ${i + 1}… `);
            else          process.stdout.write(`  run ${i - warmup + 1}/${wanted}… `);

            const outcome = await measureRun({
                context, url, timeoutMs, headless,
                measureViewport: measureViewport && !viewport,
            });
            if (outcome.viewport) viewport = outcome.viewport;

            if (outcome.error) {
                process.stdout.write(`\n  ✗ ${outcome.error === 'timeout' ? 'timeout' : 'failed'}: ${outcome.reason}\n`);
                failed.push({
                    grid: grid.id, gridName: grid.name, scenario: scenarioId,
                    error: outcome.error, reason: outcome.reason,
                });
                continue;
            }

            if (!isWarmup) runs.push(outcome.run);
            console.log(`fps=${outcome.run.fps ?? '?'} renderMs=${outcome.run.initialRenderMs ?? '?'}${isWarmup ? ' (warmup)' : ''}`);
        }
    } finally {
        await context.close();
    }

    return { runs, failed, viewport };
}

/**
 * Bring up the dataset server and the Vite viewer, unless they are already listening. A
 * matrix driver calls this once for the whole run; the benchmarks inside it find the ports taken.
 */
export async function startServers(cleanup) {
    await ensureServer({
        port:   DATA_SERVER_PORT,
        script: DATA_SERVER_SCRIPT,
        label:  'dataset server',
        cleanup,
    });

    // Vite is not one of our scripts, so it does not go through ensureServer.
    if (await waitForPort(VIEWER_PORT, { timeoutMs: 2_000 })) return;

    console.log('Starting Vite viewer…');
    cleanup.addChild(spawnNode(VITE_BIN, ['src/viewer', '--port', String(VIEWER_PORT)], { cwd: ROOT }));
    if (!await waitForPort(VIEWER_PORT, { timeoutMs: 20_000 })) {
        throw new BenchmarkError(
            `Vite viewer did not start on port ${VIEWER_PORT}. Nothing was measured.`,
        );
    }
}

/**
 * Measure every selected grid × scenario cell at one dataset size.
 *
 * Returns the results document. Writing it is `saveResults`'s job, so a caller can
 * measure without touching the filesystem. `matrix.js` calls this once per size.
 */
export async function runBenchmark(options = {}) {
    const opts = { ...defaultsFor('bench'), ...options };

    const {
        runs: RUNS, warmup: WARMUP,
        maxDistance: MAX_DISTANCE, order: ORDER, set: SET,
    } = opts;

    // The CLI measures by `--sizes`, so the size arrives from the caller rather than from
    // the flag defaults.
    const SIZE = opts.size ?? DEFAULT_SIZE;

    // In headless Chromium frames follow a synthetic cadence, so FPS then describes the
    // compositor's timer and not the display. Recorded either way.
    const HEADLESS   = opts.headless;
    const MACHINE_ID = opts.machine ?? detectMachineId();
    // Inherited from the matrix driver that started us.
    const SESSION_ID = resolveSessionId();
    const TIMEOUT_MS = timeoutFor(SIZE, MAX_DISTANCE);

    if (RUNS < 2 && !opts.allowSingleRun) {
        throw new BenchmarkError(
            'One run produces a figure with no spread behind it, and the report has nowhere '
            + 'to take a stddev from. Use --runs=3 or more, or --allowSingleRun to measure once.',
        );
    }

    const gridList     = selectGrids(opts.grid);
    const scenarioList = selectScenarios(opts.scenario, SET);

    // A flat list, so --order=random can interleave the grids. The order used is recorded
    // in env.cellOrder.
    const cells = [];
    for (const grid of gridList) {
        for (const [scenarioId, scenario] of scenarioList) cells.push({ grid, scenarioId, scenario });
    }
    if (ORDER === 'random') shuffle(cells);
    const cellOrder = cells.map(cell => `${cell.grid.id}/${cell.scenarioId}`);

    console.log(`\n⚡ Grid Benchmark`);
    console.log(`   Grids:     ${gridList.map(grid => grid.id).join(', ')}`);
    console.log(`   Scenarios: ${scenarioList.map(([id]) => id).join(', ')}`);
    console.log(`   Size:      ${SIZE.toLocaleString()} rows`);
    console.log(`   Session:   ${SESSION_ID}`);
    console.log(`   Runs:      ${RUNS} (+${WARMUP} warmup)`);
    console.log(`   MaxDist:   ${MAX_DISTANCE.toLocaleString()}px`);
    console.log(`   Window:    ${HEADLESS ? 'hidden (headless — FPS is synthetic)' : 'visible'}`);
    console.log(`   Order:     ${ORDER}`);
    console.log('');

    const cleanup = createCleanup();
    let browser   = null;

    const allResults = [];
    const failedRuns = [];
    let env, refreshHz;

    // Overwritten by the first page that loads.
    let viewport = { ...BENCH_VIEWPORT, requested: BENCH_VIEWPORT, measured: false };

    try {
        await startServers(cleanup);
        await warmAssets(gridList);

        browser = await chromium.launch({ headless: HEADLESS });
        cleanup.add(() => browser.close());

        // Before the matrix: a refresh rate that invalidates the FPS column should stop
        // the run early.
        refreshHz = await measureRefreshHz(browser);
        env = {
            machine:  MACHINE_ID,
            ...describeMachine(),
            browser:  `Chromium ${browser.version()}`,
            node:     process.version,
            headless: HEADLESS,
            viewport,
            refreshHz,
            runs:     RUNS,
            warmup:   WARMUP,
            maxDistance: MAX_DISTANCE,
            order:    ORDER,
            cellOrder,
        };

        console.log(`   Machine:   ${env.machine} — ${env.cpu}, ${env.cores} cores, ${env.ramGb} GB`);
        console.log(`   Browser:   ${env.browser}${HEADLESS ? ' (headless)' : ''}`);
        console.log(`   Refresh:   ${refreshHz ? `${refreshHz} Hz measured` : 'could not measure'}`);
        console.log('');

        const plan = {
            size: SIZE, runs: RUNS, warmup: WARMUP,
            maxDistance: MAX_DISTANCE, headless: HEADLESS, timeoutMs: TIMEOUT_MS,
        };

        for (const cell of cells) {
            const measured = await measureCell({
                browser, cell, plan,
                measureViewport: !viewport.measured,
            });

            if (measured.viewport) {
                viewport     = measured.viewport;
                env.viewport = viewport;
            }
            failedRuns.push(...measured.failed);

            if (measured.runs.length) {
                allResults.push({
                    grid: cell.grid.id, gridName: cell.grid.name,
                    scenario: cell.scenarioId, scenarioName: cell.scenario.name,
                    size: SIZE, runs: measured.runs,
                });
            }
        }
    } finally {
        // An exception mid-matrix must not leave Chromium, Vite and the dataset server up.
        cleanup.run();
    }

    const summaries = allResults.map(cell => ({
        grid:         cell.grid,
        gridName:     cell.gridName,
        scenario:     cell.scenario,
        scenarioName: cell.scenarioName,
        size:         cell.size,
        ...summarize(cell.runs),
        raw:          cell.runs,
    }));

    // rAF cannot outrun the display, so FPS above the measured refresh rate means the browser
    // is not vsync-locked. The verdict is stored in the results file, not only printed.
    const measuredFps = summaries.map(summary => summary.fps?.value).filter(fps => typeof fps === 'number');
    const fpsCheck = checkFps({ refreshHz, maxFps: Math.max(0, ...measuredFps), headless: HEADLESS });
    if (fpsCheck.warning) console.warn(`\n  ! FPS: ${fpsCheck.warning}`);

    return {
        generatedAt: new Date().toISOString(),
        session:     SESSION_ID,
        size:        SIZE,
        maxDistance: MAX_DISTANCE,
        viewport,
        machine:     MACHINE_ID,
        // Which stylesheets each grid was measured under. Themes are not aligned between
        // vendors, and the results file has to say which ones produced these numbers.
        grids:       Object.fromEntries(gridList.map(grid => [grid.id, {
            name:   grid.name,
            assets: grid.assets,
        }])),
        env:         { ...env, fps: fpsCheck },
        vendor:      readVendorVersions(),
        summaries,
        failed:      failedRuns,
    };
}

/** Which build of each grid produced these numbers. Null if vendor/ carries no manifest. */
function readVendorVersions() {
    try {
        return JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf8'));
    } catch {
        console.warn('  ! vendor/.versions.json missing — results will not record grid versions.'
                   + ' Run `npm run vendor`.');
        return null;
    }
}

export function saveResults(output) {
    ensureDir(RESULTS_DIR);
    fs.writeFileSync(LATEST_FILE, JSON.stringify(output, null, 2));
    console.log(`\n✓ Results saved to results/latest.json`);

    ensureDir(HISTORY_DIR);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(HISTORY_DIR, `${stamp}_${output.size}.json`), JSON.stringify(output, null, 2));
}

export function printSummary({ summaries, failed }) {
    console.log('\n── Results ───────────────────────────────────');
    console.log('Grid'.padEnd(20) + 'Scenario'.padEnd(14) + 'FPS'.padEnd(8) + 'RenderMs'.padEnd(12) + 'ScrollMs');
    console.log('─'.repeat(68));
    for (const summary of summaries) {
        const fps    = summary.fps?.value             ?? '—';
        const render = summary.initialRenderMs?.value ?? '—';
        const scroll = summary.scrollDurationMs?.value != null ? Math.round(summary.scrollDurationMs.value) : '—';
        console.log(summary.grid.padEnd(20) + summary.scenario.padEnd(14) + String(fps).padEnd(8) + String(render).padEnd(12) + scroll);
    }
    for (const failure of failed) {
        console.log(failure.grid.padEnd(20) + failure.scenario.padEnd(14) + '✗'.padEnd(8) + ''.padEnd(12) + failure.reason);
    }
    console.log('');
}
