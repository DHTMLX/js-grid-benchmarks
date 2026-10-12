#!/usr/bin/env node
/**
 * `npm run report` — reads results/history/ and writes results/report.html and report.md.
 *
 * The reading and aggregation live in aggregate.js, the two renderings in template/. Both
 * draw the same `aggregate()` result, so they cannot disagree. This file is the command: it
 * prints what it found and writes the files.
 */
import fs from 'node:fs';

import { REPORT_FILE, REPORT_MD_FILE, RESULTS_DIR, ensureDir, relToRoot } from '../core/paths.js';
import { reportOrder as GRIDS_ORDER } from '../core/registry.js';
import { aggregate, vendorOf } from './aggregate.js';
import { renderPage } from './template/render.js';
import { renderMarkdown } from './template/markdown.js';

const data = aggregate();

console.log(`Loaded ${data.records.length} records from history`);
console.log(`Latest run: ${data.matrix.latestLabel || '(none)'}`);
console.log(`  scenarios: ${data.matrix.scenarios.join(', ') || '(none)'}`);
console.log(`  sizes:     ${data.matrix.sizes.join(', ') || '(none)'}`);

if (data.empty) {
    console.log('  no usable history — writing an empty report');
} else {
    const measured = GRIDS_ORDER
        .map(g => [g, vendorOf(data.session, g)])
        .filter(([, v]) => v);
    console.log(measured.length
        ? `  versions:  ${measured.map(([g, v]) => `${g}@${v.version}`).join(', ')}`
        : '  versions:  none recorded — run `npm run vendor`, then re-run the benchmark');

    const env = data.session?.env;
    if (env) {
        console.log(`  machine:   ${env.machine} (${env.browser}${env.headless ? ', headless' : ''})`);
        if (env.fps && !env.fps.trustworthy) {
            console.warn(`  ! FPS in this run was not validated: ${env.fps.warning}`);
        }
    } else {
        console.log('  machine:   not recorded for this run');
    }
}

ensureDir(RESULTS_DIR);
fs.writeFileSync(REPORT_FILE, renderPage(data), 'utf8');
fs.writeFileSync(REPORT_MD_FILE, renderMarkdown(data), 'utf8');

console.log(`✓ Report written to ${relToRoot(REPORT_FILE)} and ${relToRoot(REPORT_MD_FILE)}`);
console.log(`  Open in browser: file://${REPORT_FILE.replace(/\\/g, '/')}`);
