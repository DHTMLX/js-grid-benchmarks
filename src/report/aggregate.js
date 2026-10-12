/**
 * results/history/ → everything the report page needs, and nothing about how it looks.
 * Nothing here touches the DOM or produces HTML, so the aggregation can be tested by
 * calling it.
 */
import fs   from 'node:fs';
import path from 'node:path';

import { scenarios }    from '../config/scenarios.js';
import { sessionLabel } from '../bench/session.js';
import { HISTORY_DIR }  from '../core/paths.js';
import {
    gridColors as GRID_COLORS,
    gridLabels as GRID_LABELS,
    reportOrder as GRIDS_ORDER,
} from '../core/registry.js';

/**
 * What the report shows, in the order the picker lists it.
 *
 * `headline` is the comparison: one figure per thing the suite actually measures — putting
 * rows on screen, holding a frame rate while scrolling, the worst frames a reader will feel,
 * landing deep in the dataset, and what the page costs in memory. `secondary` is shown
 * smaller and never ranked on; it holds the second view of a headline figure, memory without
 * the library, and the two figures that only qualify a headline one.
 *
 * Everything else measured — the other percentiles, the frame counts, the CDP counters, the
 * row geometry — stays in results/history/ and is reachable through `npm run inspect`. It
 * needs a paragraph of caveats each: recalcStyleCountDelta is decided by the number of
 * selectors in a theme, and the themes are not aligned between vendors.
 */
const INTERACTIVE_METRICS = [
    {
        key: 'initialRenderMs', label: 'Initial render', unit: 'ms', higherBetter: false,
        max: null, tier: 'headline',
        note: 'From the call to the constructor until the viewport is full and the row count has settled.',
    },
    {
        key: 'fps', label: 'Scroll FPS', unit: 'FPS', higherBetter: true,
        max: 65, tier: 'headline',
        note: 'Every frame of every run pooled into one series.',
    },
    {
        key: 'p95FrameMs', label: 'P95 frame', unit: 'ms', higherBetter: false,
        max: null, tier: 'headline',
        note: 'The frame time one scroll in twenty exceeds. Above 16.7 ms a 60 Hz display drops frames.',
    },
    {
        key: 'jumpMs', label: 'Jump to depth', unit: 'ms', higherBetter: false,
        max: null, tier: 'headline',
        note: 'From a jump to 90 % of the dataset until the viewport has caught up.',
    },
    {
        key: 'jsHeapPageMB', label: 'Memory, page total', unit: 'MB', higherBetter: false,
        max: null, tier: 'headline',
        note: 'The whole JS heap after the run: the vendor library, the dataset and the grid. '
            + 'What the difference from "grid only" costs is the library, so it differs per vendor by design.',
    },
    {
        key: 'jsHeapGridMB', label: 'Memory, grid only', unit: 'MB', higherBetter: false,
        max: null, tier: 'secondary',
        note: 'The same heap counted from the moment before the grid is built, so the library and '
            + 'the dataset are already in it and only the grid\'s own share is left.',
    },
    {
        key: 'maxFrameMs', label: 'Worst frame', unit: 'ms', higherBetter: false,
        max: null, tier: 'secondary',
        note: 'One frame out of thousands. Read it beside P95, never instead of it.',
    },
    {
        key: 'scrollDurationMs', label: 'Scroll duration', unit: 'ms', higherBetter: false,
        max: null, tier: 'secondary',
        note: 'How long the same 50 000 px took. A grid that cannot keep up spends longer here.',
    },
];
const INTERACTIVE_METRIC_KEYS = INTERACTIVE_METRICS.map(metric => metric.key);

// ── Load data ─────────────────────────────────────────────────────────────────

export function loadHistory(dir = HISTORY_DIR) {
    // A fresh checkout has no history directory. That is its ordinary state, not an error.
    if (!fs.existsSync(dir)) return { records: [], sessions: {} };

    const files = fs.readdirSync(dir)
        .filter(name => name.endsWith('.json'))
        .sort();

    const records = [];
    // One entry per session: which builds were measured and on what machine. A run writes
    // one file per cell under the same session id, so the last one read wins.
    const sessions = {};
    let unreadable = 0;

    for (const name of files) {
        const date = name.slice(0, 10);
        let data;

        try {
            data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        } catch (err) {
            console.warn(`Skipping invalid history file ${name}: ${err.message}`);
            continue;
        }

        // Files written before the runner recorded a session id fall back to their date,
        // which sorts against real session ids so "latest" still means latest.
        const session = typeof data.session === 'string' ? data.session : date;

        if (data.vendor || data.env) {
            sessions[session] = {
                vendor: data.vendor ?? null,
                env:    data.env ?? null,
            };
        }

        for (const summary of (data.summaries || [])) {
            if (!GRIDS_ORDER.includes(summary.grid)) continue;

            // A cell measured before the statistics carried `value` cannot be read here, and
            // its numbers came from a different measurement boundary anyway.
            if (summary.fps?.value === undefined) { unreadable++; continue; }

            records.push({
                grid:              summary.grid,
                scenario:          summary.scenario,
                size:              data.size,
                failed:            false,
                runs:              summary.runs ?? null,
                ...Object.fromEntries(INTERACTIVE_METRICS.map(({ key }) => [
                    key,
                    summary[key]?.value ?? null,
                ])),
                ...Object.fromEntries(INTERACTIVE_METRICS.map(({ key }) => [
                    `${key}Stddev`,
                    summary[key]?.stddev ?? null,
                ])),
                session,
                date,
            });
        }

        // Also load failed runs so a recent failure overrides an older success.
        for (const failure of (data.failed || [])) {
            if (!GRIDS_ORDER.includes(failure.grid)) continue;
            records.push({
                grid:     failure.grid,
                scenario: failure.scenario,
                size:     data.size,
                failed:   true,
                session,
                date,
            });
        }
    }
    if (unreadable) {
        console.warn(`  ! ${unreadable} cells in results/history/ predate the current statistics `
                   + 'and were skipped. Clear the directory to stop seeing this.');
    }

    return { records, sessions };
}

// ── Provenance ────────────────────────────────────────────────────────────────
// Versions travel from `npm run vendor` → vendor/.versions.json → every results file → here.

// Entries written before the manifest named its primary package are `{ pkg: version }`,
// where the first key is the grid.
function readVendorEntry(entry) {
    if (!entry) return null;
    if (typeof entry.version === 'string') {
        return { package: entry.package ?? null, version: entry.version, also: entry.also ?? null };
    }
    const [pkg, version] = Object.entries(entry)[0] ?? [];
    return version ? { package: pkg, version, also: null } : null;
}

export function vendorOf(session, grid) {
    return readVendorEntry(session?.vendor?.packages?.[grid]);
}

// Grid name plus the version the latest session measured, for chart legends and heatmap
// titles. A grid whose version was not recorded keeps its bare name.
export function labelsWithVersions(session) {
    return Object.fromEntries(GRIDS_ORDER.map(grid => {
        const v = vendorOf(session, grid);
        return [grid, v ? `${GRID_LABELS[grid]} ${v.version}` : GRID_LABELS[grid]];
    }));
}

// ── Scenario / size matrix ───────────────────────────────────────────────────
// Derived from the most recent session, so a new scenario appears on its own and one you
// stopped running disappears. Older sessions stay loaded for the "Previous run" bars.
const SCEN_RE       = /^(tpl|pln|frz)(\d+)$/;
const FAMILY_ORDER  = ['tpl', 'pln', 'frz'];
const FAMILY_LABELS = { tpl: 'Template', pln: 'Plain', frz: 'Frozen' };

function parseScenario(id) {
    const m = SCEN_RE.exec(id);
    return m ? { family: m[1], cols: Number(m[2]) } : null;
}

// { scenarios, sizes, families } — families group scenarios by column count so the
// column-scaling chart gets a clean numeric X-axis instead of repeated labels.
export function deriveMatrix(records) {
    // Session ids sort chronologically, and so do the dates standing in for older files.
    const latestSession = records.reduce((latest, record) => (record.session > latest ? record.session : latest), '');

    const scenSet = new Set();
    const sizeSet = new Set();
    for (const record of records) {
        if (record.session !== latestSession) continue;
        if (parseScenario(record.scenario)) scenSet.add(record.scenario);
        if (Number.isFinite(record.size)) sizeSet.add(record.size);
    }

    const scenarioIds = [...scenSet].sort((a, b) => {
        const first = parseScenario(a), second = parseScenario(b);
        return FAMILY_ORDER.indexOf(first.family) - FAMILY_ORDER.indexOf(second.family)
            || first.cols - second.cols;
    });

    const families = FAMILY_ORDER
        .map(id => {
            const scens = scenarioIds.filter(scenario => parseScenario(scenario).family === id);
            return { id, label: FAMILY_LABELS[id], scens, cols: scens.map(scenario => parseScenario(scenario).cols) };
        })
        .filter(family => family.scens.length > 1);   // a single point makes no line

    return {
        latestSession,
        latestLabel: sessionLabel(latestSession),
        scenarios: scenarioIds,
        sizes:     [...sizeSet].sort((a, b) => a - b),
        families,
        labels:    Object.fromEntries(scenarioIds.map(id => [id, scenarios[id]?.name ?? id])),
    };
}

// ── Metrics offered by the page ───────────────────────────────────────────────

const SCALING_METRICS = [
    { key: 'fps',              label: 'Scroll FPS',       unit: 'fps',     higherBetter: true                            },
    { key: 'renderSpeed',      label: 'Render speed',     unit: 'rows/ms', higherBetter: true,  base: 'initialRenderMs'  },
    { key: 'scrollSpeed',      label: 'Scroll speed',     unit: 'rows/ms', higherBetter: true,  base: 'scrollDurationMs' },
    { key: 'initialRenderMs',  label: 'Initial render',   unit: 'ms',      higherBetter: false                           },
    { key: 'scrollDurationMs', label: 'Scroll duration',  unit: 'ms',      higherBetter: false                           },
];

function buildInteractiveLookup(records) {
    // Last record per cell wins — no accumulation of old non-null values.
    const latest = {};
    for (const record of records) {
        latest[`${record.grid}|${record.scenario}|${record.size}`] = record;
    }

    const lookup = {};
    for (const [cell, record] of Object.entries(latest)) {
        lookup[cell] = { runs: record.runs };
        for (const metric of INTERACTIVE_METRIC_KEYS) {
            if (record[metric] == null) continue;
            lookup[cell][metric] = record[metric];
            lookup[cell][`${metric}Stddev`] = record[`${metric}Stddev`] ?? null;
        }
    }
    return lookup;
}

// The last record per (grid, scenario, size) from a session other than the current one.
// The chart says "Previous run", so the bar behind it has to come from a different run.
function buildPrevLookup(records) {
    const pairs = {};
    for (const record of records) {
        const cell = `${record.grid}|${record.scenario}|${record.size}`;
        const seen = pairs[cell];
        pairs[cell] = seen && seen.current.session === record.session
            ? { previous: seen.previous, current: record }
            : { previous: seen?.current ?? null, current: record };
    }

    const lookup = {};
    for (const [cell, { previous }] of Object.entries(pairs)) {
        if (!previous) continue;
        lookup[cell] = {};
        for (const metric of INTERACTIVE_METRIC_KEYS) {
            if (previous[metric] != null) lookup[cell][metric] = previous[metric];
        }
    }
    return lookup;
}

// Precompute Y-axis max per (metric, size) across all grids × scenarios
// so the scale stays fixed when switching scenarios.
function buildInteractiveScales(records, matrix) {
    const scales = {};   // 'metric|size' → max
    for (const record of records) {
        if (!matrix.scenarios.includes(record.scenario) || !matrix.sizes.includes(record.size)) continue;
        for (const metric of INTERACTIVE_METRIC_KEYS) {
            if (record[metric] == null) continue;
            const axis = `${metric}|${record.size}`;
            if (scales[axis] == null || record[metric] > scales[axis]) scales[axis] = record[metric];
        }
    }

    // Round up to a nice ceiling: ×1.15, then to two significant figures.
    for (const axis of Object.keys(scales)) {
        const headroom  = scales[axis] * 1.15;
        const magnitude = Math.pow(10, Math.floor(Math.log10(headroom)) - 1);
        scales[axis] = Math.ceil(headroom / magnitude) * magnitude;
    }
    return scales;
}

// Defaults must exist in the derived matrix, or the report opens on a blank selection.
const pick = (preferred, available) => available.includes(preferred) ? preferred : available[0];

/** Read the history and reduce it to what the page draws. `empty` when nothing was found. */
export function aggregate(dir = HISTORY_DIR) {
    const { records, sessions } = loadHistory(dir);
    const matrix  = deriveMatrix(records);
    const session = sessions[matrix.latestSession] ?? null;
    const empty   = !matrix.scenarios.length || !matrix.sizes.length;

    const gridLabels = labelsWithVersions(session);

    return {
        records,
        matrix,
        session,
        gridLabels,
        empty,
        interactive: empty ? null : {
            sizes:       matrix.sizes,
            scenarios:   matrix.scenarios,
            metrics:     INTERACTIVE_METRICS,
            grids:       GRIDS_ORDER,
            gridLabels,
            scenarioLabels: matrix.labels,
            gridColors:  GRID_COLORS,
            lookup:      buildInteractiveLookup(records),
            prevLookup:  buildPrevLookup(records),
            scales:      buildInteractiveScales(records, matrix),
            // The FPS ceiling belongs beside the bars, not only in the header: a reader
            // comparing two grids at the ceiling is comparing the display, not the grids.
            display:     session?.env
                ? { refreshHz: session.env.refreshHz ?? null, ...session.env.fps }
                : null,
        },
        scaling: empty ? null : {
            sizes:        matrix.sizes,
            rowsScens:    matrix.scenarios,
            families:     matrix.families,
            metrics:      SCALING_METRICS,
            grids:        GRIDS_ORDER,
            gridLabels,
            gridColors:   GRID_COLORS,
            scenarioLabels: matrix.labels,
            defaults:     {
                rowsScenario: pick('tpl10', matrix.scenarios),
                colsSize:     pick(200000, matrix.sizes),
                colsFamily:   matrix.families[0]?.id ?? null,
                metric:       'fps',
            },
        },
    };
}
