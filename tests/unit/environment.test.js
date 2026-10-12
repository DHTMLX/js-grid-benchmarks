import { test } from 'node:test';
import assert   from 'node:assert/strict';

import {
    FPS_OVER_REFRESH_TOLERANCE, assertMachineId, checkFps, describeMachine, detectMachineId,
} from '../../src/bench/environment.js';

// ── The FPS verdict ───────────────────────────────────────────────────────────

test('FPS at or below the refresh rate is trustworthy', () => {
    const v = checkFps({ refreshHz: 60, maxFps: 60, headless: false });
    assert.equal(v.trustworthy, true);
    assert.equal(v.warning, null);
    assert.equal(v.source, 'display');
});

test('FPS far above the refresh rate is refused, and the warning names both numbers', () => {
    const v = checkFps({ refreshHz: 60, maxFps: 240, headless: false });
    assert.equal(v.trustworthy, false);
    assert.match(v.warning, /240/);
    assert.match(v.warning, /60 Hz/);
});

test('a real display measured a frame over its rate is not called broken', () => {
    assert.equal(checkFps({ refreshHz: 60, maxFps: 61, headless: false }).trustworthy, true);
    assert.equal(checkFps({ refreshHz: 60, maxFps: 60 * FPS_OVER_REFRESH_TOLERANCE, headless: false }).trustworthy, true);
    assert.equal(checkFps({ refreshHz: 60, maxFps: 60 * FPS_OVER_REFRESH_TOLERANCE + 1, headless: false }).trustworthy, false);
});

test('a rate that could not be measured is unverified, not assumed fine', () => {
    const v = checkFps({ refreshHz: null, maxFps: 60, headless: false });
    assert.equal(v.trustworthy, false);
    assert.match(v.warning, /unverified/i);
});

test('headless is recorded as the source on every path', () => {
    for (const args of [
        { refreshHz: 60, maxFps: 60 },
        { refreshHz: 60, maxFps: 240 },
        { refreshHz: null, maxFps: 60 },
    ]) {
        assert.equal(checkFps({ ...args, headless: true }).source, 'headless');
        assert.equal(checkFps({ ...args, headless: false }).source, 'display');
    }
});

// ── The machine id ────────────────────────────────────────────────────────────

test('a bare --machine is refused rather than labelling the run "true"', () => {
    assert.throws(() => assertMachineId(true), /needs a value/);
    assert.throws(() => assertMachineId(undefined), /needs a value/);
});

test('an id that would not survive a filename is refused', () => {
    assert.throws(() => assertMachineId('has space'), /plain name/);
    assert.throws(() => assertMachineId('-leading-dash'), /plain name/);
    assert.throws(() => assertMachineId('slash/es'), /plain name/);
    assert.throws(() => assertMachineId(''), /plain name/);
});

test('a plain name passes through unchanged', () => {
    assert.equal(assertMachineId('cpu-model3-win'), 'cpu-model3-win');
    assert.equal(assertMachineId('cpu_model.3-linux'), 'cpu_model.3-linux');
});

test('the auto-detected id is one the validator accepts', () => {
    assert.doesNotThrow(() => assertMachineId(detectMachineId()));
});

test('the machine description carries the fields the report prints', () => {
    const m = describeMachine();
    assert.equal(typeof m.os, 'string');
    assert.equal(typeof m.cpu, 'string');
    assert.ok(m.cores > 0);
    assert.ok(m.ramGb > 0);
});
