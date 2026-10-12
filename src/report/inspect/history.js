/**
 * Reading results/history/ for the diagnostic views.
 *
 * Separate from ../aggregate.js, which flattens each cell to the means the report plots.
 * These views show the spread, the percentiles and the failure reasons, so they read the
 * files as written.
 */
import fs   from 'node:fs';
import path from 'node:path';

import { HISTORY_DIR } from '../../core/paths.js';
import { scenarios }   from '../../config/scenarios.js';
import { reportOrder } from '../../core/registry.js';

export const GRIDS = reportOrder;

/** Every snapshot on disk, oldest first. The size comes from the filename. */
export function readSnapshots(dir = HISTORY_DIR) {
    if (!fs.existsSync(dir)) return [];

    const out = [];
    for (const file of fs.readdirSync(dir).sort()) {
        const m = file.match(/_(\d+)\.json$/);
        if (!m) continue;
        try {
            const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            out.push({
                file,
                size:      parseInt(m[1], 10),
                summaries: data.summaries ?? [],
                failed:    data.failed ?? [],
            });
        } catch (err) {
            console.warn(`Skipping invalid history file ${file}: ${err.message}`);
        }
    }
    return out;
}

/** `grid|scenario|size` → the summary, last write winning. */
export function indexCells(snapshots) {
    const cells = new Map();
    for (const snap of snapshots) {
        for (const s of snap.summaries) {
            cells.set(`${s.grid}|${s.scenario}|${snap.size}`, { ...s, size: snap.size });
        }
    }
    return cells;
}

export function collectFailures(snapshots) {
    return snapshots.flatMap(snap => snap.failed.map(f => ({
        grid: f.grid, scenario: f.scenario, size: snap.size, error: f.error, reason: f.reason,
    })));
}

/** The sizes and scenarios actually present in the files. */
export function axesOf(snapshots) {
    const declared = Object.keys(scenarios);
    const sizes = new Set();
    const scens = new Set();

    for (const snap of snapshots) {
        sizes.add(snap.size);
        for (const s of snap.summaries) scens.add(s.scenario);
        for (const f of snap.failed)    scens.add(f.scenario);
    }

    return {
        sizes: [...sizes].sort((a, b) => a - b),
        // Declaration order first, then anything a history file carries that the registry
        // no longer declares.
        scenarios: [
            ...declared.filter(id => scens.has(id)),
            ...[...scens].filter(id => !declared.includes(id)).sort(),
        ],
    };
}

/**
 * What every table below prints. `value` is defined two ways in src/bench/stats.js, so the
 * distinction is stated once per view instead of being suffixed onto each column label.
 */
export const FIGURE_NOTE =
    'Figures are the published value: the median across runs, except FPS and the frame-time\n'
    + 'figures, which come from every frame of every run pooled into one series.';

export const pad = (v, w, decimals = 0) =>
    v === null || v === undefined
        ? '—'.padStart(w)
        : (typeof v === 'number' ? v.toFixed(decimals) : String(v)).padStart(w);

export const rule = (title) => {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log('━'.repeat(60));
};
