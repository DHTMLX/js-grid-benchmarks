import { test } from 'node:test';
import assert   from 'node:assert/strict';
import fs       from 'node:fs';
import os       from 'node:os';
import path     from 'node:path';

import { aggregate, deriveMatrix, labelsWithVersions, loadHistory, vendorOf } from '../../src/report/aggregate.js';
import { renderPage } from '../../src/report/template/render.js';
import { renderMarkdown } from '../../src/report/template/markdown.js';
import { gridLabels, reportOrder } from '../../src/core/registry.js';

/** A history directory holding the given files, removed when the test process exits. */
function fixture(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gridbench-history-'));
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), JSON.stringify(content));
    }
    return dir;
}

const cell = (grid, scenario, fps) => ({
    grid, scenario,
    runs:            3,
    fps:             { value: fps, mean: fps, stddev: 0, min: fps, max: fps, pooled: true },
    initialRenderMs: { value: 100, mean: 100, stddev: 0, min: 100, max: 100 },
    p95FrameMs:      { value: 17,  mean: 17,  stddev: 0, min: 17,  max: 17, pooled: true },
});

const snapshot = (session, size, cells) => ({
    session,
    size,
    env:     { machine: 'test-machine', browser: 'Chromium 1', runs: 3 },
    vendor:  { packages: { dhtmlx: { package: '@dhx/trial-grid', version: '9.3.8' } } },
    summaries: cells,
    failed:  [],
});

// ── An empty history is a state, not a failure ────────────────────────────────

test('a missing history directory reads as empty rather than throwing', () => {
    const { records, sessions } = loadHistory(path.join(os.tmpdir(), 'gridbench-does-not-exist'));
    assert.deepEqual(records, []);
    assert.deepEqual(sessions, {});
});

test('an empty history still produces a page that says so', () => {
    const data = aggregate(fixture({}));
    assert.equal(data.empty, true);
    assert.equal(data.interactive, null);

    const html = renderPage(data);
    assert.match(html, /No results yet/);
    assert.match(html, /<\/html>$/);

    const markdown = renderMarkdown(data);
    assert.match(markdown, /No results yet/);
    assert.doesNotMatch(markdown, /undefined|NaN/);
});

// ── Aggregation ───────────────────────────────────────────────────────────────

test('the matrix describes the latest session only', () => {
    const dir = fixture({
        '2026-01-01T00-00-00_10000.json': snapshot('2026-01-01T00-00-00', 10_000, [
            cell('dhtmlx', 'tpl10', 60), cell('dhtmlx', 'tpl40', 58),
        ]),
        '2026-02-02T00-00-00_50000.json': snapshot('2026-02-02T00-00-00', 50_000, [
            cell('dhtmlx', 'pln10', 55),
        ]),
    });

    const data = aggregate(dir);
    assert.equal(data.empty, false);
    assert.equal(data.matrix.latestSession, '2026-02-02T00-00-00');
    assert.deepEqual(data.matrix.scenarios, ['pln10']);
    assert.deepEqual(data.matrix.sizes, [50_000]);

    assert.equal(data.records.length, 3);
});

test('a grid absent from the registry is ignored rather than plotted', () => {
    const dir = fixture({
        '2026-03-03T00-00-00_10000.json': snapshot('2026-03-03T00-00-00', 10_000, [
            cell('dhtmlx', 'pln10', 60), cell('some-other-grid', 'pln10', 61),
        ]),
    });
    const grids = new Set(aggregate(dir).records.map(r => r.grid));
    assert.deepEqual([...grids], ['dhtmlx']);
});

test('an unreadable history file is skipped, not fatal', () => {
    const dir = fixture({
        '2026-04-04T00-00-00_10000.json': snapshot('2026-04-04T00-00-00', 10_000, [cell('dhtmlx', 'pln10', 60)]),
    });
    fs.writeFileSync(path.join(dir, '2026-04-05T00-00-00_10000.json'), '{ not json');

    assert.equal(aggregate(dir).records.length, 1);
});

// ── Provenance ────────────────────────────────────────────────────────────────

test('a version travels from the results file into the label', () => {
    const session = { vendor: { packages: { dhtmlx: { package: '@dhx/trial-grid', version: '9.3.8' } } }, env: null };
    assert.equal(vendorOf(session, 'dhtmlx').version, '9.3.8');
    assert.match(labelsWithVersions(session).dhtmlx, /9\.3\.8$/);
});

test('a grid with no recorded version keeps its bare name', () => {
    const labels = labelsWithVersions(null);
    for (const grid of reportOrder) {
        assert.doesNotMatch(labels[grid], /\d+\.\d+\.\d+/, `${grid} claims a version nothing recorded`);
    }
});

// ── The page carries no grid-specific branch ──────────────────────────────────

test('no grid is singled out in the rendered page', () => {
    const dir = fixture({
        '2026-05-05T00-00-00_10000.json': snapshot('2026-05-05T00-00-00', 10_000,
            reportOrder.map(g => cell(g, 'pln10', 60))),
    });
    const html = renderPage(aggregate(dir));

    for (const grid of reportOrder) {
        assert.doesNotMatch(html, new RegExp(`===\\s*['"]${grid}['"]`),
            `the page branches on "${grid}"`);
    }
});

// ── The markdown rendering draws the same round ───────────────────────────────

test('markdown lists every grid, in the report order, once per table', () => {
    const dir = fixture({
        '2026-05-05T00-00-00_10000.json': snapshot('2026-05-05T00-00-00', 10_000,
            reportOrder.map(g => cell(g, 'pln10', 60))),
    });

    const markdown = renderMarkdown(aggregate(dir));
    const positions = reportOrder.map(grid => markdown.indexOf(gridLabels[grid]));

    assert.ok(positions.every(at => at >= 0), 'a grid is missing from the document');
    assert.deepEqual([...positions].sort((a, b) => a - b), positions,
        'grids are not listed in reportOrder');
});

test('markdown carries the version each grid was measured at', () => {
    const dir = fixture({
        '2026-05-05T00-00-00_10000.json': snapshot('2026-05-05T00-00-00', 10_000,
            [cell('dhtmlx', 'pln10', 60)]),
    });
    const markdown = renderMarkdown(aggregate(dir));

    assert.match(markdown, /@dhx\/trial-grid/, 'the package is not named');
    assert.match(markdown, /9\.8\.3|9\.3\.8/, 'the measured version is not named');
    assert.match(markdown, /not recorded/, 'a grid without a recorded version should say so');
});

test('markdown reports a cell that produced no figure as a dash, not as zero', () => {
    const dir = fixture({
        '2026-07-07T00-00-00_10000.json': snapshot('2026-07-07T00-00-00', 10_000,
            [cell('dhtmlx', 'pln10', 60)]),
    });
    const markdown = renderMarkdown(aggregate(dir));

    assert.match(markdown, /—/, 'the four unmeasured grids should read as dashes');
    assert.doesNotMatch(markdown, /\bundefined\b|\bNaN\b/);
});

test('a cell from before the current statistics is skipped, not plotted as zero', () => {
    const dir = fixture({
        '2026-06-06T00-00-00_10000.json': {
            session: '2026-06-06T00-00-00',
            size:    10_000,
            summaries: [{ grid: 'dhtmlx', scenario: 'pln10', fps: { mean: 60 } }],
            failed:  [],
        },
    });
    assert.equal(aggregate(dir).records.length, 0);
});

test('deriveMatrix on no records yields an empty matrix rather than undefined fields', () => {
    const matrix = deriveMatrix([]);
    assert.deepEqual(matrix.scenarios, []);
    assert.deepEqual(matrix.sizes, []);
    assert.deepEqual(matrix.families, []);
});
