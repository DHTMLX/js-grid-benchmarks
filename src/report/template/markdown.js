/**
 * The same round as a markdown document, for reading where a browser is not the point —
 * a pull request, a terminal, a paste into an article draft.
 *
 * Reads exactly what render.js reads: one `aggregate()` result. Charts do not survive the
 * format, so the interactive picker becomes one table per size and the scaling curves become
 * one table per grid. Every figure is the same one the page draws; nothing is recomputed here.
 */
import { vendorOf } from '../aggregate.js';
import {
    gridLabels as GRID_LABELS,
    reportOrder as GRIDS_ORDER,
} from '../../core/registry.js';

const SUBTITLE = `JS data-grid performance comparison: ${GRIDS_ORDER.map(id => GRID_LABELS[id]).join(', ')}`;

/** A pipe inside a cell would start a new column. */
const esc = (value) => String(value).replace(/\|/g, '\\|');

const sizeLabel = (size) => (size >= 1000 ? `${size / 1000}k` : String(size));

/** `17.2 ±0.3`, or an em dash where the cell produced no figure. */
function figure(record, metric) {
    const value = record?.[metric];
    if (value == null) return '—';

    const stddev = record[`${metric}Stddev`];
    return stddev ? `${value} ±${stddev}` : String(value);
}

function table(headers, rows) {
    const head = `| ${headers.map(esc).join(' | ')} |`;
    const rule = `| ${headers.map(() => '---').join(' | ')} |`;
    const body = rows.map(cells => `| ${cells.map(esc).join(' | ')} |`);
    return [head, rule, ...body].join('\n');
}

// ── Provenance ────────────────────────────────────────────────────────────────

function provenance(session, matrix) {
    const env   = session?.env ?? null;
    const lines = [
        '## What produced these numbers',
        '',
        `Run of ${matrix.latestLabel || 'unknown date'}.`,
        '',
        table(
            ['Grid', 'npm package', 'Version measured'],
            GRIDS_ORDER.map(grid => {
                const vendor = vendorOf(session, grid);
                return [
                    GRID_LABELS[grid],
                    vendor?.package ?? '—',
                    vendor?.version ?? '*not recorded*',
                ];
            }),
        ),
        '',
    ];

    if (env) {
        lines.push(table(['Environment', ''], [
            ['Machine', `${env.machine ?? 'unknown'} — ${env.cpu ?? '?'}, ${env.cores ?? '?'} cores, ${env.ramGb ?? '?'} GB`],
            ['Browser', `${env.browser ?? '?'}${env.headless ? ' — headless' : ''}`],
            ['Display', env.refreshHz ? `${env.refreshHz} Hz measured` : 'refresh rate could not be measured'],
            ['Viewport', env.viewport ? `${env.viewport.width}×${env.viewport.height}` : '—'],
            ['Runs per point', `${env.runs ?? '?'}${env.warmup ? ` (+${env.warmup} warmup, discarded)` : ''}`],
        ]), '');
    } else {
        lines.push('> This run recorded no environment. Re-run `npm run bench` to capture the',
            '> machine and validate the FPS column.', '');
    }

    // Two different failures, and they must not read the same: a run that never recorded a
    // verdict, against one whose FPS column is known to be wrong.
    if (env?.fps && !env.fps.trustworthy) {
        lines.push(`> **FPS not validated** — ${env.fps.warning}`, '');
    } else if (env?.fps?.source === 'headless') {
        lines.push('> Measured in headless Chromium, where frames follow a synthetic cadence rather',
            '> than this machine\'s display. The grids stay comparable with each other; these FPS',
            '> figures are not comparable with a run on a real display.', '');
    }

    const missing = GRIDS_ORDER.filter(grid => !vendorOf(session, grid));
    if (missing.length) {
        lines.push(`> No version recorded for ${missing.map(g => GRID_LABELS[g]).join(', ')} — run`,
            '> `npm run vendor` so the next run can name what it measured.', '');
    }

    return lines.join('\n');
}

// ── Scroll FPS across the whole matrix ────────────────────────────────────────

/**
 * One table per grid, sizes down and scenarios across — the shape the page draws as a
 * heatmap. It carries FPS on its own, so the per-size sections below leave FPS out.
 */
function fpsSection({ sizes, scenarios, lookup, gridLabels }) {
    const tables = GRIDS_ORDER.map(grid => [
        `### ${gridLabels[grid] ?? GRID_LABELS[grid]}`,
        '',
        table(
            ['Rows', ...scenarios],
            sizes.map(size => [
                sizeLabel(size),
                ...scenarios.map(scenario => figure(lookup[`${grid}|${scenario}|${size}`], 'fps')),
            ]),
        ),
        '',
    ].join('\n'));

    return [
        '## Scroll FPS',
        '',
        'Frames per second during the scroll, from every frame of every run pooled. Higher is better,',
        'and no figure can exceed the display refresh rate recorded above.',
        '',
        ...tables,
    ].join('\n');
}

// ── Everything else, one section per size ─────────────────────────────────────

function metricTable({ metric, size, scenarios, grids, lookup, gridLabels }) {
    const direction = metric.higherBetter ? 'higher is better' : 'lower is better';

    return [
        `### ${metric.label} (${metric.unit}, ${direction})`,
        '',
        table(
            ['Grid', ...scenarios],
            grids.map(grid => [
                gridLabels[grid] ?? GRID_LABELS[grid],
                ...scenarios.map(scenario => figure(lookup[`${grid}|${scenario}|${size}`], metric.key)),
            ]),
        ),
        '',
        `*${metric.note}*`,
        '',
    ].join('\n');
}

function sizeSection(interactive, size) {
    const { scenarios, grids, lookup, gridLabels, metrics } = interactive;
    const shown = metrics.filter(metric => metric.key !== 'fps');
    const of    = (tier) => shown.filter(metric => metric.tier === tier);

    const build = (metric) => metricTable({ metric, size, scenarios, grids, lookup, gridLabels });

    return [
        `## Results at ${size.toLocaleString()} rows`,
        '',
        'Each figure is the published value with the spread across runs beside it.',
        '',
        ...of('headline').map(build),
        '**Read alongside.** Not ranked on: a second view of a headline figure, memory without',
        'the library, and the two figures that only qualify a headline one.',
        '',
        ...of('secondary').map(build),
    ].join('\n');
}

// ── The document ──────────────────────────────────────────────────────────────

const EMPTY = `# Grid Performance Benchmark

${SUBTITLE}

## No results yet

Nothing has been measured on this machine.

Run \`npm run bench\`, then generate this report again.
`;

export function renderMarkdown(data) {
    if (data.empty) return EMPTY;

    const { matrix, session, interactive } = data;

    return [
        '# Grid Performance Benchmark',
        '',
        SUBTITLE,
        '',
        provenance(session, matrix),
        fpsSection(interactive),
        ...interactive.sizes.map(size => sizeSection(interactive, size)),
        '---',
        '',
        'Generated by `npm run bench` and `npm run report`. The interactive version of this round',
        'is `results/report.html`; the metrics left out of both are reachable through `npm run inspect`.',
        '',
    ].join('\n');
}
