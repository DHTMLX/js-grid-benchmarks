import { test } from 'node:test';
import assert    from 'node:assert/strict';

import { percentile, poolFrames, summarize } from '../../src/bench/stats.js';

// ── Percentiles ───────────────────────────────────────────────────────────────

test('a percentile between two samples is interpolated, not snapped to one of them', () => {
    assert.equal(percentile([10, 20], 0.5), 15);
    assert.equal(percentile([0, 10, 20, 30], 0.5), 15);
    assert.equal(percentile([0, 100], 0.95), 95);
});

test('the ends of the range are the ends of the data', () => {
    assert.equal(percentile([1, 2, 3], 0), 1);
    assert.equal(percentile([1, 2, 3], 1), 3);
});

test('p95 and p99 separate at the frame counts a scroll produces', () => {
    const frames = Array.from({ length: 60 }, (_, i) => i);
    assert.notEqual(percentile(frames, 0.95), percentile(frames, 0.99));
});

test('an empty series has no percentile to give', () => {
    assert.equal(percentile([], 0.5), 0);
});

// ── Pooling ───────────────────────────────────────────────────────────────────

test('frames from every run are pooled into one series', () => {
    const pooled = poolFrames([
        { frameTimes: [10, 10] },
        { frameTimes: [20, 20, 20] },
    ]);
    assert.equal(pooled.frames, 5);
    assert.equal(pooled.maxFrameMs, 20);
});

test('the pooled percentile is not the mean of the per-run percentiles', () => {
    const runs = [
        { frameTimes: [1, 1, 1, 1, 100] },
        { frameTimes: [1, 1, 1, 1, 1] },
        { frameTimes: [1, 1, 1, 1, 1] },
    ];
    const meanOfPerRunP95 = (percentile([1, 1, 1, 1, 100], 0.95)
                           + percentile([1, 1, 1, 1, 1], 0.95)
                           + percentile([1, 1, 1, 1, 1], 0.95)) / 3;
    assert.notEqual(poolFrames(runs).p95FrameMs, meanOfPerRunP95);
});

test('FPS is the pooled frame count over the pooled duration, reported whole', () => {
    assert.equal(poolFrames([{ frameTimes: [10, 10] }, { frameTimes: [10, 10] }]).fps, 100);
    assert.equal(poolFrames([{ frameTimes: [16, 17, 16] }]).fps, 61);
});

test('runs without frame times pool to nothing', () => {
    assert.equal(poolFrames([{ fps: 60 }]), null);
});

// ── The summary ───────────────────────────────────────────────────────────────

test('no runs summarize to nothing at all', () => {
    assert.equal(summarize([]), null);
});

test('the summary counts the runs it was given', () => {
    assert.equal(summarize([{ fps: 60 }, { fps: 58 }, { fps: 59 }]).runs, 3);
});

test('the published value is the median across runs', () => {
    assert.equal(summarize([{ ms: 10 }, { ms: 11 }, { ms: 40 }]).ms.value, 11);
});

test('the median at an even run count falls between the two middle runs', () => {
    assert.equal(summarize([{ ms: 10 }, { ms: 20 }]).ms.value, 15);
    assert.equal(summarize([{ ms: 1 }, { ms: 2 }, { ms: 3 }, { ms: 4 }]).ms.value, 2.5);
});

test('the mean is kept beside the median, not instead of it', () => {
    const summary = summarize([{ ms: 10 }, { ms: 11 }, { ms: 40 }]).ms;
    assert.equal(summary.value, 11);
    assert.equal(summary.mean, 20.33);
});

test('the spread is reported with the figure', () => {
    const summary = summarize([{ ms: 10 }, { ms: 20 }, { ms: 30 }]).ms;
    assert.equal(summary.min, 10);
    assert.equal(summary.max, 30);
    assert.equal(summary.stddev, 8.16);
});

test('a single run has no spread', () => {
    const summary = summarize([{ fps: 60 }]);
    assert.equal(summary.fps.value, 60);
    assert.equal(summary.fps.stddev, 0);
    assert.equal(summary.runs, 1);
});

test('a metric missing from the first run is still summarized', () => {
    const summary = summarize([
        { fps: 60 },
        { fps: 58, jsHeapPageMB: 12 },
        { fps: 59, jsHeapPageMB: 14 },
    ]);
    assert.equal(summary.jsHeapPageMB.value, 13);
    assert.equal(summary.fps.value, 59);
});

test('a gap in one run does not drag the figure of the others', () => {
    assert.equal(summarize([{ ms: 10 }, { ms: null }, { ms: 20 }]).ms.value, 15);
});

test('non-numeric fields are not summarized', () => {
    const summary = summarize([
        { grid: 'dhtmlx', scenario: 'pln10', fps: 60 },
        { grid: 'dhtmlx', scenario: 'pln10', fps: 58 },
    ]);
    assert.equal(summary.grid, undefined);
    assert.equal(summary.scenario, undefined);
    assert.ok(summary.fps);
});

test('bookkeeping fields are not summarized as if they were measurements', () => {
    const summary = summarize([
        { fps: 60, frames: 80, timestamp: 1_000 },
        { fps: 58, frames: 82, timestamp: 2_000 },
    ]);
    assert.equal(summary.timestamp, undefined);
    assert.equal(typeof summary.frames, 'object', 'frames is the pooled count, not a summary');
});

test('summarizing does not disturb the runs it was given', () => {
    const runs = [{ fps: 58, frameTimes: [20, 10] }, { fps: 60, frameTimes: [10] }];
    const before = JSON.stringify(runs);
    summarize(runs);
    assert.equal(JSON.stringify(runs), before, 'the runs were reordered in place');
});

// ── Pooled figures override the per-run ones ─────────────────────────────────

test('frame figures come from the pooled series, the rest from across the runs', () => {
    const summary = summarize([
        { p95FrameMs: 99, initialRenderMs: 40, frameTimes: [10, 10, 10, 10] },
        { p95FrameMs: 99, initialRenderMs: 50, frameTimes: [10, 10, 10, 50] },
    ]);

    assert.equal(summary.frames, 8);
    assert.equal(summary.p95FrameMs.pooled, true);
    assert.notEqual(summary.p95FrameMs.value, 99, 'the per-run p95 was published as-is');
    assert.equal(summary.maxFrameMs.value, 50);

    assert.equal(summary.initialRenderMs.value, 45);
    assert.equal(summary.initialRenderMs.pooled, undefined);
});

test('a pooled figure the page never sent still reports its spread', () => {
    const summary = summarize([
        { frameTimes: [16, 16, 16, 16] },
        { frameTimes: [20, 20, 20, 20] },
    ]).p95FrameMs;

    assert.equal(summary.min, 16);
    assert.equal(summary.max, 20);
    assert.equal(summary.mean, 18);
    assert.ok(summary.stddev > 0);
});

test('every pooled figure carries a spread', () => {
    const summary = summarize([{ frameTimes: [16, 20] }, { frameTimes: [17, 30] }]);
    for (const metric of ['fps', 'avgFrameMs', 'medianFrameMs', 'p95FrameMs', 'p99FrameMs', 'maxFrameMs']) {
        assert.equal(typeof summary[metric].stddev, 'number', `${metric} has no stddev`);
        assert.equal(typeof summary[metric].min, 'number', `${metric} has no min`);
    }
});

test('a cell measured without frame times still summarizes', () => {
    const summary = summarize([{ fps: 60 }, { fps: 58 }]);
    assert.equal(summary.frames, null);
    assert.equal(summary.fps.value, 59);
    assert.equal(summary.fps.pooled, undefined);
});
