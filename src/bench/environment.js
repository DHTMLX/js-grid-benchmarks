/**
 * What machine produced a run, and whether its FPS column means anything.
 *
 * The browser cannot paint faster than the display refreshes, so requestAnimationFrame is
 * capped at the refresh rate. Over remote desktop, in a VM or on a virtual display it is
 * not, and the FPS column is then meaningless. The rate is measured, not assumed: a fixed
 * ceiling would misjudge both a 120 Hz display and a broken run.
 */

import os from 'os';

const PLATFORM_NAMES = { win32: 'win', darwin: 'mac', linux: 'linux' };

const slug = text => text
    .replace(/\(R\)|\(TM\)|\(tm\)/g, '')
    .replace(/@.*$/, '')
    .replace(/\swith\s.*$/i, '')
    .replace(/\b(Processor|CPU)\b/gi, '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A CPU marketing string reduced to its model number. */
function cpuToken(model) {
    const parts = slug(model).split('-');
    for (let i = parts.length - 1; i >= 1; i--) {
        if (!/\d/.test(parts[i]) || !/[A-Za-z]/.test(parts[i - 1] + parts[i])) continue;

        const start = /^\d+$/.test(parts[i - 1]) && i >= 2 ? i - 2 : i - 1;
        return parts.slice(start, i + 1).join('-');
    }
    return slug(model);
}

/**
 * Identifies the machine in the results file. Derived from the CPU so an unattended run
 * lands on something sensible; a publication run should pass `--machine` instead.
 */
export function detectMachineId() {
    const platform = PLATFORM_NAMES[os.platform()] ?? os.platform();
    const model    = os.cpus()[0]?.model?.trim();
    return `${model ? cpuToken(model) : 'unknown-cpu'}-${platform}`;
}

export function assertMachineId(id) {
    if (typeof id !== 'string') {
        throw new Error('--machine needs a value, e.g. --machine=<cpu>-<os>');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
        throw new Error(
            `--machine must be a plain name (letters, digits, dot, dash, underscore), got "${id}"`,
        );
    }
    return id;
}

export function describeMachine() {
    const cpus = os.cpus();
    return {
        os:    `${os.platform()} ${os.release()}`,
        cpu:   cpus[0]?.model?.trim() ?? 'unknown',
        cores: cpus.length,
        ramGb: Math.round(os.totalmem() / 1024 ** 3),
    };
}

const WARMUP_FRAMES = 5;
const SAMPLE_FRAMES = 40;

/**
 * How fast requestAnimationFrame actually runs here, in Hz, measured on a blank page.
 * Null when it could not be read, which is reported as unverified.
 */
export async function measureRefreshHz(browser) {
    const context = await browser.newContext();
    try {
        const page = await context.newPage();
        await page.goto('about:blank');
        return await page.evaluate(({ warmup, samples }) => new Promise(resolve => {
            const stamps = [];
            const total  = warmup + samples;
            const tick = now => {
                stamps.push(now);
                if (stamps.length <= total) { requestAnimationFrame(tick); return; }
                // Median, so one long frame from a background task cannot drag it down.
                const deltas = stamps.slice(warmup + 1)
                    .map((t, i) => t - stamps[warmup + i])
                    .sort((a, b) => a - b);
                const middle = deltas[Math.floor(deltas.length / 2)];
                resolve(middle > 0 ? Math.round(1000 / middle) : null);
            };
            requestAnimationFrame(tick);
        }), { warmup: WARMUP_FRAMES, samples: SAMPLE_FRAMES });
    } finally {
        await context.close();
    }
}

// A measured rate lands a frame or two either side of nominal, so it is compared with a
// margin.
export const FPS_OVER_REFRESH_TOLERANCE = 1.15;

/**
 * Verdict on the FPS column of a finished run: `{ trustworthy, source, warning }`.
 *
 * Headless is not an error: every grid in the run is capped by the same synthetic cadence.
 * It is not comparable with a headed run, so the source is recorded.
 */
export function checkFps({ refreshHz, maxFps, headless }) {
    if (refreshHz && maxFps > refreshHz * FPS_OVER_REFRESH_TOLERANCE) {
        return {
            trustworthy: false,
            source:      headless ? 'headless' : 'display',
            warning:
                `measured FPS reached ${maxFps}, above this machine's ${refreshHz} Hz refresh rate — ` +
                'requestAnimationFrame is not vsync-locked here (remote desktop, VM or virtual ' +
                'display), so every FPS figure in this run is meaningless. Re-run on a machine ' +
                'with a real attached display.',
        };
    }
    if (!refreshHz) {
        return {
            trustworthy: false,
            source:      headless ? 'headless' : 'display',
            warning:
                'could not measure this machine\'s refresh rate, so the FPS column cannot be ' +
                'validated. Treat it as unverified.',
        };
    }
    return {
        trustworthy: true,
        source:      headless ? 'headless' : 'display',
        warning:     null,
    };
}
