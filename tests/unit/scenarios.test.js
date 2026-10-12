import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { scenarios, scenarioList, scenarioSets } from '../../src/config/scenarios.js';

const KNOWN_COLUMN_SETS = ['mix20', 'mix40', 'mix100'];

test('scenario ids follow the family+width convention', () => {
    for (const id of Object.keys(scenarios)) {
        assert.match(id, /^(tpl|pln|frz)\d+$/, `scenario id "${id}" is off-convention`);
    }
});

test('every declared columnSet is one getColumns knows about', () => {
    for (const [id, scenario] of Object.entries(scenarios)) {
        if (scenario.columnSet === undefined) continue;
        assert.ok(
            KNOWN_COLUMN_SETS.includes(scenario.columnSet),
            `scenario ${id} declares unknown columnSet "${scenario.columnSet}"`,
        );
    }
});

test('a scenario without columnSet is a 10-column scenario', () => {
    for (const [id, scenario] of Object.entries(scenarios)) {
        if (scenario.columnSet !== undefined) continue;
        assert.ok(id.endsWith('10'), `scenario ${id} has no columnSet but is not 10 columns wide`);
    }
});

test('every scenario declares name, complexCells and frozenColumns', () => {
    for (const [id, scenario] of Object.entries(scenarios)) {
        assert.equal(typeof scenario.name, 'string', `${id}.name`);
        assert.equal(typeof scenario.complexCells, 'boolean', `${id}.complexCells`);
        assert.equal(typeof scenario.frozenColumns, 'number', `${id}.frozenColumns`);
    }
});

test('the frz family is the only one with frozen columns', () => {
    for (const [id, scenario] of Object.entries(scenarios)) {
        const frozen = scenario.frozenColumns > 0;
        assert.equal(frozen, id.startsWith('frz'), `${id} frozen=${scenario.frozenColumns}`);
    }
});

test('the pln family is the only one without complex cells', () => {
    for (const [id, scenario] of Object.entries(scenarios)) {
        assert.equal(scenario.complexCells, !id.startsWith('pln'), `${id}.complexCells`);
    }
});

test('scenarioList mirrors the scenarios map', () => {
    assert.equal(scenarioList.length, Object.keys(scenarios).length);
    for (const entry of scenarioList) {
        assert.ok(scenarios[entry.id], `scenarioList has an id absent from scenarios: ${entry.id}`);
        assert.equal(entry.name, scenarios[entry.id].name);
    }
});

// ── Named sets ────────────────────────────────────────────────────────────────

test('every named set lists scenarios that exist', () => {
    for (const [name, ids] of Object.entries(scenarioSets)) {
        assert.ok(ids.length, `set "${name}" is empty`);
        for (const id of ids) {
            assert.ok(scenarios[id], `set "${name}" names a scenario that does not exist: ${id}`);
        }
    }
});

test('a named set names each scenario once', () => {
    for (const [name, ids] of Object.entries(scenarioSets)) {
        assert.equal(new Set(ids).size, ids.length, `set "${name}" repeats a scenario`);
    }
});

test('full is every scenario', () => {
    assert.deepEqual([...scenarioSets.full].sort(), Object.keys(scenarios).sort());
});

// A smoke run that never touches a family would pass while that family is broken.
test('smoke covers every family', () => {
    const families = new Set(scenarioSets.smoke.map(id => id.replace(/\d+$/, '')));
    for (const id of Object.keys(scenarios)) {
        assert.ok(families.has(id.replace(/\d+$/, '')), `smoke never runs the ${id.replace(/\d+$/, '')} family`);
    }
});
