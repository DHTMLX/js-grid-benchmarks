/**
 * Reducing the runs of one grid × scenario cell to the figures the report publishes.
 *
 * Two different reductions live here. Frame-derived figures come from every frame of every
 * run pooled into one series: a percentile is a property of a distribution, and averaging
 * each run's own p95 gives a number that is not the p95 of anything. Everything else is
 * summarized across runs, where the published figure is the median.
 *
 * Each entry carries `value` — the published figure — beside the spread it came from.
 */

/** Recorded per run, but not measurements of the grid. */
const NOT_A_METRIC = new Set(['frames', 'timestamp']);

/** Figures the pooled frame series defines, overriding any per-run value of the same name. */
const POOLED_FROM_FRAMES = ['fps', 'avgFrameMs', 'medianFrameMs', 'p95FrameMs', 'p99FrameMs', 'maxFrameMs'];

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Linear-interpolated percentile over an ascending array.
 *
 * Picking the nearest recorded frame instead would make p95 and p99 the same element at the
 * frame counts a scroll produces, and would move the figure in steps as the count changes.
 */
export function percentile(ascending, fraction) {
    if (!ascending.length) return 0;

    const position = (ascending.length - 1) * fraction;
    const lower    = Math.floor(position);
    const upper    = Math.ceil(position);
    if (lower === upper) return ascending[lower];

    return ascending[lower] + (position - lower) * (ascending[upper] - ascending[lower]);
}

/** Every run's frames as one series. Null when the runs carry no frame times. */
export function poolFrames(runs) {
    const frameTimes = runs.flatMap(run => run.frameTimes ?? []);
    if (!frameTimes.length) return null;

    const ascending = [...frameTimes].sort((a, b) => a - b);
    const totalMs   = frameTimes.reduce((total, ms) => total + ms, 0);

    // FPS is reported whole. Below one frame per second the difference is noise, and the
    // sub-integer detail is in avgFrameMs and medianFrameMs at full precision.
    return {
        frames:        frameTimes.length,
        fps:           totalMs > 0 ? Math.round(frameTimes.length / (totalMs / 1000)) : 0,
        avgFrameMs:    totalMs / frameTimes.length,
        medianFrameMs: percentile(ascending, 0.5),
        p95FrameMs:    percentile(ascending, 0.95),
        p99FrameMs:    percentile(ascending, 0.99),
        maxFrameMs:    ascending[ascending.length - 1],
    };
}

/**
 * How far apart the runs were. Takes the values ascending, as `percentile` does.
 *
 * The variance divides by n, not n−1: these are all the runs there are, not a sample drawn
 * from more of them, so the figure describes the set rather than estimating a population.
 */
function spread(ascending) {
    const total    = ascending.reduce((sum, value) => sum + value, 0);
    const mean     = total / ascending.length;
    const variance = ascending.reduce((sum, value) => sum + (value - mean) ** 2, 0) / ascending.length;

    return {
        mean:   round2(mean),
        stddev: round2(Math.sqrt(variance)),
        min:    round2(ascending[0]),
        max:    round2(ascending[ascending.length - 1]),
    };
}

const ascending = (values) => [...values].sort((a, b) => a - b);

export function summarize(runs) {
    if (!runs.length) return null;

    // Every key any run carries, not only the first one's: a metric may fail to read once.
    const metrics = [...new Set(runs.flatMap(run => Object.keys(run)))]
        .filter(metric => !NOT_A_METRIC.has(metric))
        .filter(metric => runs.some(run => typeof run[metric] === 'number'));

    const summary = {};
    for (const metric of metrics) {
        const values = ascending(runs.map(run => run[metric]).filter(value => typeof value === 'number'));
        summary[metric] = { value: round2(percentile(values, 0.5)), ...spread(values) };
    }

    // Pooled figures publish the whole series, and take their spread from each run's own
    // frames — a percentile the page never sent still has to say how far the runs differed.
    const pooled = poolFrames(runs);
    if (pooled) {
        const perRun = runs.map(run => poolFrames([run])).filter(Boolean);
        for (const metric of POOLED_FROM_FRAMES) {
            summary[metric] = {
                value: round2(pooled[metric]),
                ...spread(ascending(perRun.map(run => run[metric]))),
                pooled: true,
            };
        }
    }

    return { runs: runs.length, frames: pooled?.frames ?? null, ...summary };
}
