import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { adapters } from '../../src/adapters/index.js';
import { assertAdapter } from '../../src/adapters/contract.js';
import { rowElements } from '../../src/adapters/_shared.js';
import { getColumns } from '../../src/utils/columns.js';
import { scenarios } from '../../src/config/scenarios.js';

const entries = Object.entries(adapters);

const RENDERER_KEYS = ['template', 'cellTemplate', 'cellRenderer', 'renderer'];
const PIN_KEYS      = ['pinned', 'locked', 'fixed'];

const has = (col, keys) => keys.some(k => col[k] !== undefined);

const mapped = (adapter, scenarioId) => {
    const scenario = scenarios[scenarioId];
    return adapter.mapColumns(getColumns(scenario), scenario);
};

// ── The contract ──────────────────────────────────────────────────────────────

test('every adapter satisfies the contract under its registered id', () => {
    for (const [id, adapter] of entries) {
        assert.doesNotThrow(() => assertAdapter(adapter, id), `adapter "${id}"`);
    }
});

test('the contract check rejects a missing method and a wrong id', () => {
    const good = adapters.dhtmlx;
    assert.throws(() => assertAdapter({ ...good, getScrollContainer: undefined }, 'dhtmlx'), TypeError);
    assert.throws(() => assertAdapter({ ...good, id: 'other' }, 'dhtmlx'), TypeError);
    assert.throws(() => assertAdapter({ ...good, mapColumns: (a) => [a] }, 'dhtmlx'), TypeError);
});

// ── Column mapping ────────────────────────────────────────────────────────────

test('mapColumns returns exactly the columns it was given, in order', () => {
    for (const scenarioId of ['pln10', 'tpl10', 'tpl40', 'frz40']) {
        const expected = getColumns(scenarios[scenarioId]).length;
        for (const [id, adapter] of entries) {
            assert.equal(mapped(adapter, scenarioId).length, expected,
                `${id} / ${scenarioId}: column count changed`);
        }
    }
});

test('a plain scenario attaches no renderer anywhere', () => {
    for (const scenarioId of ['pln10', 'pln20', 'pln40']) {
        for (const [id, adapter] of entries) {
            for (const col of mapped(adapter, scenarioId)) {
                assert.ok(!has(col, RENDERER_KEYS),
                    `${id} / ${scenarioId}: a column carries a renderer in a plain scenario`);
            }
        }
    }
});

test('every grid renders the same columns as every other', () => {
    for (const scenarioId of ['tpl10', 'tpl40', 'frz40']) {
        const shapes = entries.map(([id, adapter]) =>
            [id, mapped(adapter, scenarioId).map(col => has(col, RENDERER_KEYS))]);

        const [firstId, firstShape] = shapes[0];
        assert.ok(firstShape.some(Boolean), `${scenarioId}: no column is rendered at all`);

        for (const [id, shape] of shapes.slice(1)) {
            assert.deepEqual(shape, firstShape,
                `${scenarioId}: ${id} renders different columns than ${firstId}`);
        }
    }
});

// ── Counting rendered rows ────────────────────────────────────────────────────

const fakeRow  = (attrs) => ({ getAttribute: (key) => attrs[key] ?? null });
const fakeHost = (rows) => ({ querySelectorAll: () => rows });

test('a row repeated across frozen sub-tables is counted once', () => {
    const host = fakeHost([
        fakeRow({ i: '0' }), fakeRow({ i: '1' }),   // locked sub-table
        fakeRow({ i: '0' }), fakeRow({ i: '1' }),   // scrolling sub-table
    ]);
    assert.equal(rowElements(host, '.row', 'i').length, 2);
});

test('the first element of each row is the one kept, so its height is a row height', () => {
    const first = fakeRow({ i: '7' });
    const rows  = rowElements(fakeHost([first, fakeRow({ i: '7' })]), '.row', 'i');
    assert.equal(rows[0], first);
});

test('an element without the index attribute is not a row', () => {
    const host = fakeHost([fakeRow({}), fakeRow({ i: '3' })]);
    assert.equal(rowElements(host, '.row', 'i').length, 1);
});

test('every adapter reports no rows for an empty container instead of failing', () => {
    for (const [id, adapter] of entries) {
        assert.deepEqual(adapter.getRenderedRows(fakeHost([])), [], `${id}`);
    }
});

// ── Escaping parity ───────────────────────────────────────────────────────────

const ESCAPING_FLAG = { kendo: 'encoded', bryntum: 'htmlEncode' };
const ANY_ESCAPING_KEY = ['encoded', 'htmlEncode', 'encodeHtml'];

test('a plain scenario leaves escaping at the vendor default', () => {
    for (const [id, key] of Object.entries(ESCAPING_FLAG)) {
        for (const col of mapped(adapters[id], 'pln40')) {
            assert.equal(col[key], true,
                `${id}: ${key} is not the vendor default in a plain scenario`);
        }
    }
});

test('a template scenario turns escaping off, because the templates emit markup', () => {
    for (const [id, key] of Object.entries(ESCAPING_FLAG)) {
        for (const col of mapped(adapters[id], 'tpl40')) {
            assert.equal(col[key], false, `${id}: ${key} would escape its own template`);
        }
    }
});

test('no other grid declares a per-column escaping flag at all', () => {
    for (const [id, adapter] of entries) {
        if (ESCAPING_FLAG[id]) continue;
        for (const col of mapped(adapter, 'pln40')) {
            for (const key of ANY_ESCAPING_KEY) {
                assert.equal(col[key], undefined, `${id}: sets ${key}, which nothing else does`);
            }
        }
    }
});

// ── Freezing ──────────────────────────────────────────────────────────────────

test('a frozen scenario pins exactly the leading columns it asks for', () => {
    const scenarioId = 'frz40';
    const frozen = scenarios[scenarioId].frozenColumns;

    for (const [id, adapter] of entries) {
        const cols   = mapped(adapter, scenarioId);
        const pinned = cols.map(c => has(c, PIN_KEYS));

        // DHTMLX freezes by count in create() through leftSplit, so it marks no column.
        if (id === 'dhtmlx') {
            assert.ok(!pinned.some(Boolean), 'dhtmlx marks a column pinned but freezes by count');
            continue;
        }

        assert.deepEqual(
            pinned,
            cols.map((_, i) => i < frozen),
            `${id}: pinned columns are not the first ${frozen}`,
        );
    }
});

test('an unfrozen scenario pins nothing', () => {
    for (const [id, adapter] of entries) {
        for (const col of mapped(adapter, 'tpl40')) {
            assert.ok(!has(col, PIN_KEYS), `${id}: a column is pinned in an unfrozen scenario`);
        }
    }
});

// ── Column widths ─────────────────────────────────────────────────────────────

test('every grid gets the same column widths, in the same order', () => {
    for (const scenarioId of Object.keys(scenarios)) {
        const expected = getColumns(scenarios[scenarioId]).map(col => col.width);

        for (const [id, adapter] of entries) {
            assert.deepEqual(
                mapped(adapter, scenarioId).map(col => col.width),
                expected,
                `${id}: column widths differ from the canonical set in ${scenarioId}`,
            );
        }
    }
});

test('no adapter substitutes a width of its own', () => {
    const scenario = { complexCells: false, frozenColumns: 0 };
    const columns  = [{ id: 'a', label: 'A', width: 0 }];

    for (const [id, adapter] of entries) {
        assert.equal(adapter.mapColumns(columns, scenario)[0].width, 0,
            `${id}: substituted its own width`);
    }
});
