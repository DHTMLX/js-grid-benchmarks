/**
 * Every command-line flag the suite accepts, with its type, default and range. Each command
 * names the flags it takes. `src/core/cli.js` does the parsing; `--help` reads from here.
 */
import { gridIds }   from './registry.js';
import { scenarios, scenarioSets } from '../config/scenarios.js';
import { assertMachineId } from '../bench/environment.js';
import { DEFAULT_SCROLL_DISTANCE } from './measurement.js';

// The dataset server refuses anything outside this range; the CLI refuses it earlier and
// names the flag.
export const MIN_ROWS = 10;
export const MAX_ROWS = 2_000_000;

/** One declaration behind `--sizes`, `--size` and the runner's own fallback. */
export const DEFAULT_SIZE = 10_000;

export const FLAGS = {
    grid: {
        type:    'string',
        choices: () => gridIds,
        help:    'measure one grid instead of all of them',
    },
    scenario: {
        type:    'string',
        choices: () => Object.keys(scenarios),
        help:    'measure one scenario instead of all of them',
    },
    size: {
        type: 'int',
        min:  MIN_ROWS,
        max:  MAX_ROWS,
        default: DEFAULT_SIZE,
        help: 'dataset size in rows',
    },
    sizes: {
        type: 'intList',
        min:  MIN_ROWS,
        max:  MAX_ROWS,
        default: [DEFAULT_SIZE],
        help: 'comma-separated dataset sizes to measure',
    },
    runs: {
        type: 'int',
        min:  1,
        max:  100,
        default: 3,
        help: 'measured runs per grid/scenario pair',
    },
    warmup: {
        type: 'int',
        min:  0,
        max:  100,
        default: 1,
        help: 'warmup runs, discarded from the results',
    },
    allowSingleRun: {
        type: 'switch',
        help: 'measure once anyway, accepting a figure with no spread behind it',
    },
    set: {
        type:    'string',
        choices: () => Object.keys(scenarioSets),
        default: 'full',
        help:    'named scenario set to measure',
    },
    maxDistance: {
        type: 'int',
        min:  1_000,
        max:  1_000_000,
        default: DEFAULT_SCROLL_DISTANCE,
        help: 'how far the scroll test travels, in px',
    },
    order: {
        type:    'string',
        choices: () => ['registry', 'random'],
        default: 'registry',
        help:    'order of the grid × scenario cells; "random" spreads machine drift evenly',
    },
    machine: {
        type:     'string',
        validate: assertMachineId,
        help:     'name this machine in the results instead of guessing from the CPU',
    },
    headless: {
        type: 'switch',
        help: 'hide the browser window — FPS becomes synthetic and is marked as such',
    },
    cleanup: {
        type: 'switch',
        help: 'delete each generated dataset once its scenario finishes',
    },
    view: {
        type:    'string',
        choices: () => ['summary', 'scaling', 'columns', 'metrics'],
        default: 'summary',
        help:    'which diagnostic view to print',
    },
    metric: {
        type:    'string',
        choices: () => ['fps', 'render', 'scroll'],
        default: 'fps',
        help:    'metric for the summary view',
    },
    section: {
        type:    'string',
        choices: () => ['all', 'fails', 'cells', 'corr', 'outliers', 'survivor'],
        default: 'all',
        help:    'section of the metrics view',
    },
    family: {
        type:    'string',
        choices: () => ['tpl', 'pln', 'frz'],
        default: 'tpl',
        help:    'scenario family for the columns view',
    },
};

/**
 * Which flags each entry point accepts. A flag absent from a list is rejected by name.
 *
 * `size` is declared above but taken only by `inspect`, which reads one size out of the
 * history. Measuring takes `--sizes`, however many are listed, so `--size` on a bench command
 * is refused with the accepted list rather than silently ignored.
 */
export const COMMANDS = {
    bench: {
        script: 'npm run bench',
        help:   'Measure grids against scenarios at every given size.',
        flags:  ['grid', 'scenario', 'set', 'sizes', 'runs', 'warmup', 'allowSingleRun',
            'maxDistance', 'order', 'machine', 'headless', 'cleanup'],
    },
    inspect: {
        script: 'npm run inspect',
        help:   'Print a diagnostic view of results/history/ — not the published report.',
        flags:  ['view', 'metric', 'section', 'family', 'size'],
    },
};
