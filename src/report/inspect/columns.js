/**
 * At one dataset size, how each metric moves with column count. Answers whether the
 * column buckets carry distinct information or repeat each other.
 */
import { FIGURE_NOTE, GRIDS, axesOf, indexCells, pad, readSnapshots, rule } from './history.js';

const FIELDS = [
    ['FPS',                cell => cell.fps?.value,               6, 0],
    ['p95 frame ms',       cell => cell.p95FrameMs?.value,        6, 1],
    ['maxFrameMs',         cell => cell.maxFrameMs?.value,        7, 0],
    ['initialRenderMs',    cell => cell.initialRenderMs?.value,   6, 0],
    ['jsHeapPageMB',       cell => cell.jsHeapPageMB?.value,      6, 1],
    ['layoutCountDelta',   cell => cell.layoutCountDelta?.value,  7, 0],
    ['scriptDurationMs',   cell => cell.scriptDurationMs?.value,  7, 0],
];

export function run({ size = 10_000, family = 'tpl' } = {}) {
    const snapshots = readSnapshots();
    const cells     = indexCells(snapshots);
    const { scenarios } = axesOf(snapshots);

    // The column counts this family was actually measured at, in order.
    const familyPattern = new RegExp(`^${family}(\\d+)$`);
    const inFamily = scenarios
        .map(id => ({ id, match: familyPattern.exec(id) }))
        .filter(({ match }) => match)
        .map(({ id, match }) => ({ id, columnCount: Number(match[1]) }))
        .sort((a, b) => a.columnCount - b.columnCount);

    if (!inFamily.length) {
        console.log(`\nNothing measured for family "${family}".\n`);
        return;
    }

    console.log(`\n${FIGURE_NOTE}`);

    for (const [title, read, width, decimals] of FIELDS) {
        rule(`${title}  —  size=${size.toLocaleString()}  family=${family}`);
        console.log('  grid       ' + inFamily.map(({ columnCount }) => `${columnCount}col`.padStart(width)).join(' '));
        console.log('  ───────────' + inFamily.map(() => '─'.repeat(width + 1)).join(''));
        for (const grid of GRIDS) {
            const values = inFamily.map(({ id }) =>
                pad(read(cells.get(`${grid}|${id}|${size}`) ?? {}), width, decimals));
            console.log('  ' + grid.padEnd(11) + values.join(' '));
        }
    }
    console.log('');
}
