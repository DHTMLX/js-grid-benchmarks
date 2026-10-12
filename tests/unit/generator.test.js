import { test }  from 'node:test';
import assert    from 'node:assert/strict';
import crypto    from 'node:crypto';

import { DataGenerator } from '../../src/data/generator.js';

// Every field is a fixed position in one seeded sequence, so adding, removing or reordering
// a field shifts every value after it and invalidates the datasets already on disk along
// with any measurement taken on them. If a change to the generator is intended, update this
// constant and treat every cached dataset and published figure as stale.
const GOLDEN_SHA256_100_ROWS_SEED_42 =
    '1e2b02c285571b991da4339d4c53d0e2c4fc6cdc2908ee59bfd6847ccd6dca21';

const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('the seeded sequence has not shifted', () => {
    const rows = new DataGenerator(42).generateData(100);
    assert.equal(sha256(rows), GOLDEN_SHA256_100_ROWS_SEED_42);
});

test('the same seed produces byte-identical rows', () => {
    assert.deepEqual(
        new DataGenerator(42).generateData(50),
        new DataGenerator(42).generateData(50),
    );
});

test('a different seed produces different rows', () => {
    assert.notDeepEqual(
        new DataGenerator(42).generateData(50),
        new DataGenerator(43).generateData(50),
    );
});

test('a prefix of a longer generation matches a shorter one', () => {
    // Dataset caching is keyed by row count, which is only sound if this holds.
    assert.deepEqual(
        new DataGenerator(42).generateData(20),
        new DataGenerator(42).generateData(100).slice(0, 20),
    );
});

test('ids are 1-based and contiguous', () => {
    const rows = new DataGenerator(42).generateData(25);
    rows.forEach((row, i) => assert.equal(row.id, i + 1));
});

test('every row carries col01…col90 as uniform 6-digit numbers', () => {
    const [row] = new DataGenerator(42).generateData(1);
    for (let i = 1; i <= 90; i++) {
        const key = `col${String(i).padStart(2, '0')}`;
        assert.equal(typeof row[key], 'number', `missing or non-numeric ${key}`);
        assert.ok(row[key] >= 100000 && row[key] <= 999999, `${key} outside 6-digit range`);
    }
});

test('the base fields the column sets read are all present', () => {
    const [row] = new DataGenerator(42).generateData(1);
    const base = ['id', 'team', 'firstName', 'surname', 'status', 'score', 'change', 'priority', 'rating', 'city'];
    for (const field of base) {
        assert.ok(field in row, `generator does not emit "${field}"`);
    }
});
