#!/usr/bin/env node
/**
 * `npm run inspect` — diagnostic views over results/history/, with the axes taken from the
 * files themselves. For looking at a run; the published report is `npm run report`.
 */
import { parseOrExit } from '../core/cli.js';
import { run as columns } from './inspect/columns.js';
import { run as metrics } from './inspect/metrics.js';
import { run as scaling } from './inspect/scaling.js';
import { run as summary } from './inspect/summary.js';

const VIEWS = {
    summary,
    scaling,
    columns,
    metrics,
};

const options = parseOrExit(process.argv.slice(2), 'inspect');

VIEWS[options.view](options);
