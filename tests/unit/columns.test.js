import { test } from 'node:test';
import assert   from 'node:assert/strict';

import {
    baseColumns, columnSetOf, columns10WithStatus, columnsMix20, columnsMix40,
    columnsMix100, getColumns, statusColumn,
} from '../../src/utils/columns.js';
import { scenarios } from '../../src/config/scenarios.js';

const SETS = {
    columns10WithStatus, columnsMix20, columnsMix40,
    columnsMix100,
};

const EXPECTED_WIDTH = {
    columns10WithStatus: 10,
    columnsMix20:        20,
    columnsMix40:        40,
    columnsMix100:       100,
};

test('column sets have the width their name claims', () => {
    for (const [name, expected] of Object.entries(EXPECTED_WIDTH)) {
        assert.equal(SETS[name].length, expected, `${name} should hold ${expected} columns`);
    }
});

test('the status column sits fifth, between the base fields', () => {
    assert.equal(baseColumns.length, 9);
    assert.equal(columns10WithStatus.length, baseColumns.length + 1);
    assert.equal(columns10WithStatus[4], statusColumn);
});

test('every column id is unique within its set', () => {
    for (const [name, set] of Object.entries(SETS)) {
        const ids = set.map(c => c.id);
        assert.equal(new Set(ids).size, ids.length, `${name} has duplicate column ids`);
    }
});

test('numeric filler ids match the generator field names col01…col90', () => {
    const filler = columnsMix100.slice(10);
    assert.equal(filler.length, 90);
    filler.forEach((col, i) => {
        assert.equal(col.id, `col${String(i + 1).padStart(2, '0')}`);
        assert.equal(typeof col.templateSlot, 'number');
    });
});

test('an unknown columnSet is refused instead of silently becoming ten columns', () => {
    assert.throws(() => getColumns({ columnSet: 'mix41' }), /Unknown columnSet "mix41"/);
    assert.throws(() => getColumns({ columnSet: '' }), /Unknown columnSet/);
    assert.equal(getColumns({}).length, 10);
});

test('columnSetOf names the set a scenario reads', () => {
    assert.equal(columnSetOf({}), 'base');
    assert.equal(columnSetOf({ columnSet: 'mix40' }), 'mix40');
    assert.equal(getColumns({ columnSet: 'base' }), columns10WithStatus);
});

test('every scenario resolves to a column set of the width its id encodes', () => {
    for (const [id, scenario] of Object.entries(scenarios)) {
        const declared = Number(id.replace(/^[a-z]+/, ''));
        const resolved = getColumns(scenario);
        assert.equal(
            resolved.length, declared,
            `scenario ${id} resolved to ${resolved.length} columns, expected ${declared}`,
        );
    }
});
