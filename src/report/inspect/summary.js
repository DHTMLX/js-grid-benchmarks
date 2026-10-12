/**
 * Every snapshot reduced to one table per size. Plain text, no winners highlighted.
 */
import { FIGURE_NOTE, GRIDS, axesOf, collectFailures, indexCells, readSnapshots } from './history.js';

const METRIC = {
    fps:    { label: 'FPS',              read: cell => cell.fps?.value ?? null,              width: 4, decimals: 0 },
    render: { label: 'initialRenderMs',  read: cell => cell.initialRenderMs?.value ?? null,  width: 5, decimals: 0 },
    scroll: { label: 'scrollDurationMs', read: cell => cell.scrollDurationMs?.value ?? null, width: 5, decimals: 0 },
};

export function run({ metric = 'fps' } = {}) {
    const spec = METRIC[metric];
    if (!spec) throw new Error(`Unknown metric "${metric}" — one of: ${Object.keys(METRIC).join(', ')}`);

    const snapshots = readSnapshots();
    const cells     = indexCells(snapshots);
    const failures  = collectFailures(snapshots);
    const { sizes, scenarios } = axesOf(snapshots);

    const failedAt = new Set(failures.map(failure => `${failure.grid}|${failure.scenario}|${failure.size}`));

    console.log(`\n${FIGURE_NOTE}`);

    const cellText = (grid, scenario, size) => {
        const key  = `${grid}|${scenario}|${size}`;
        const cell = cells.get(key);
        if (!cell) return failedAt.has(key) ? 'FAIL' : '—';
        const value = spec.read(cell);
        return value === null ? '—' : value.toFixed(spec.decimals);
    };

    for (const size of sizes) {
        const present = scenarios.some(scenario => GRIDS.some(grid => cells.get(`${grid}|${scenario}|${size}`)));
        if (!present) continue;

        console.log(`\n${'━'.repeat(60)}`);
        console.log(`  Size: ${size.toLocaleString()} rows    Metric: ${spec.label}`);
        console.log('━'.repeat(60));

        const header = 'scenario'.padEnd(10) + GRIDS.map(grid => grid.padStart(11)).join(' ');
        console.log(header);
        console.log('─'.repeat(header.length));
        for (const scenario of scenarios) {
            console.log(scenario.padEnd(10) + GRIDS.map(grid => cellText(grid, scenario, size).padStart(11)).join(' '));
        }
    }
    console.log('');
}
