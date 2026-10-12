/**
 * How each metric moves across dataset sizes. Answers which sizes are redundant.
 */
import { FIGURE_NOTE, GRIDS, axesOf, indexCells, pad, readSnapshots, rule } from './history.js';

// Two scenarios stand in for the rest: the cheapest and a heavy templated one.
const SAMPLE_SCENARIOS = ['pln10', 'tpl40'];

const read = (cell) => cell && ({
    fps:    cell.fps?.value ?? null,
    p95:    cell.p95FrameMs?.value ?? null,
    max:    cell.maxFrameMs?.value ?? null,
    render: cell.initialRenderMs?.value ?? null,
    heap:   cell.jsHeapPageMB?.value ?? null,
    layout: cell.layoutCountDelta?.value ?? null,
    script: cell.scriptDurationMs?.value ?? null,
});

export function run() {
    const snapshots = readSnapshots();
    const cells     = indexCells(snapshots);
    const { sizes, scenarios } = axesOf(snapshots);

    const sampled = SAMPLE_SCENARIOS.filter(scenario => scenarios.includes(scenario));

    console.log(`\n${FIGURE_NOTE}`);

    for (const grid of GRIDS) {
        for (const scenario of sampled) {
            rule(`${grid} / ${scenario}`);
            console.log('  size       FPS    p95ms   maxMs   render  heapMB  layouts  scriptMs');
            console.log('  ─────────  ────   ─────   ─────   ──────  ──────  ───────  ────────');
            for (const size of sizes) {
                const metrics = read(cells.get(`${grid}|${scenario}|${size}`));
                const label   = `  ${size.toLocaleString().padStart(9)}  `;
                if (!metrics) { console.log(label + '   —'.repeat(7)); continue; }
                console.log(
                    label +
                    `${pad(metrics.fps, 4)}   ` +
                    `${pad(metrics.p95, 5, 1)}   ` +
                    `${pad(metrics.max, 5, 1)}   ` +
                    `${pad(metrics.render, 6, 0)}  ` +
                    `${pad(metrics.heap, 6, 1)}  ` +
                    `${pad(metrics.layout, 7, 0)}  ` +
                    `${pad(metrics.script, 8, 0)}`,
                );
            }
        }
    }

    crossGrid(cells, sizes, 'pln10', 'p95', 'p95 frame time (ms) — pln10 — lower is better, >16.7 = stutter', 1);
    crossGrid(cells, sizes, 'tpl40', 'heap', 'jsHeapPageMB — tpl40 — JS heap the page holds after the run', 1);

    console.log('');
}

function crossGrid(cells, sizes, scenario, metric, title, decimals) {
    rule(title);
    console.log('  size       ' + GRIDS.map(grid => grid.padStart(11)).join(' '));
    console.log('  ─────────  ' + GRIDS.map(() => '───────────').join(' '));
    for (const size of sizes) {
        const values = GRIDS.map(grid =>
            pad(read(cells.get(`${grid}|${scenario}|${size}`))?.[metric], 11, decimals));
        console.log('  ' + size.toLocaleString().padStart(9) + '  ' + values.join(' '));
    }
}
