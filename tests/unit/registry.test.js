import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { grids, gridIds, gridMap, gridColors, gridLabels, reportOrder } from '../../src/core/registry.js';
import { adapters, adapterFor } from '../../src/adapters/index.js';

test('grid ids are unique', () => {
    assert.equal(new Set(gridIds).size, gridIds.length);
});

test('every grid declares id, name, colour and assets', () => {
    for (const grid of grids) {
        assert.equal(typeof grid.id, 'string', 'id');
        assert.equal(typeof grid.name, 'string', `${grid.id}.name`);
        assert.match(grid.color, /^#[0-9A-Fa-f]{6}$/, `${grid.id}.color`);
        assert.ok(Array.isArray(grid.assets?.scripts), `${grid.id}.assets.scripts`);
        assert.ok(Array.isArray(grid.assets?.styles), `${grid.id}.assets.styles`);
    }
});

// Every grid is loaded the same way — a <script> tag per entry in assets.scripts. A grid
// with none is one whose library never arrives, and the failure surfaces as a constructor
// that is not a function rather than as a missing asset.
test('every grid declares at least one script to load', () => {
    for (const grid of grids) {
        assert.ok(grid.assets.scripts.length > 0, `${grid.id} loads no script`);
    }
});

test('colours are distinct', () => {
    const used = Object.values(gridColors);
    assert.equal(new Set(used).size, used.length, 'two grids share a colour');
});

test('every asset path is served from /vendor/', () => {
    for (const grid of grids) {
        for (const p of [...grid.assets.scripts, ...grid.assets.styles]) {
            assert.ok(p.startsWith('/vendor/'), `${grid.id}: ${p} is not under /vendor/`);
        }
    }
});

test('the adapter map covers exactly the registered grids', () => {
    assert.deepEqual(Object.keys(adapters).sort(), [...gridIds].sort());
});

test('each adapter reports the id it is registered under', () => {
    for (const id of gridIds) {
        assert.equal(adapterFor(id).id, id, `adapter for "${id}" reports a different id`);
    }
});

test('adapterFor returns null for an unknown grid', () => {
    assert.equal(adapterFor('no-such-grid'), null);
});

test('derived maps agree with the declaration', () => {
    assert.deepEqual(Object.keys(gridMap).sort(), [...gridIds].sort());
    assert.deepEqual(Object.keys(gridLabels).sort(), [...gridIds].sort());
    for (const grid of grids) {
        assert.equal(gridMap[grid.id], grid);
        assert.equal(gridLabels[grid.id], grid.name);
        assert.equal(gridColors[grid.id], grid.color);
    }
});

test('reportOrder is alphabetical and holds every grid', () => {
    assert.deepEqual(reportOrder, [...gridIds].sort());
});
