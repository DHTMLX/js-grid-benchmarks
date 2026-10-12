/**
 * In-browser measurement utilities. Everything here runs inside the page.
 */

/**
 * Drives the scroll: a position accumulated per timer tick, accelerating to a cap.
 *
 * A grid that blocks the main thread gets fewer ticks, so it covers the same distance later.
 * That cost lands in `scrollDurationMs`.
 */
export function scroller({ end, speed = 5, maxSpeed = 1000, acceleration = 1, maxDistance, scrollFn, callback }) {
    let scrollTop = 0;
    const limit = Math.min(end, maxDistance);

    const intervalId = setInterval(() => {
        scrollTop += speed;
        scrollFn(scrollTop);
        if (speed < maxSpeed) speed += acceleration;

        if (scrollTop >= limit) {
            clearInterval(intervalId);
            callback();
        }
    }, 1);
}

/**
 * When the grid put rows on screen, decided by the DOM and not by a vendor event.
 *
 * Resolves on the second consecutive frame with the same row count, since a grid can paint a
 * partial viewport and fill the rest on the next frame. The first frame carrying any row is
 * reported as `timeToFirstRowMs`. The timeout belongs to the runner; this reports progress
 * through `window.__renderWatch`.
 */
export function watchRows({ getRows, startedAt }) {
    return new Promise(resolve => {
        let firstRowAt = null;
        let lastCount  = 0;
        let repeats    = 0;

        const tick = () => {
            // Not the timestamp requestAnimationFrame passes in: that is when the frame
            // began, which precedes the script that registered the callback.
            const now   = performance.now();
            const rows  = getRows();
            const count = rows.length;

            if (count > 0 && firstRowAt === null) firstRowAt = now;

            if (count > 0 && count === lastCount) repeats++;
            else { lastCount = count; repeats = count > 0 ? 1 : 0; }

            window.__renderWatch = { rows: count, waitedMs: +(now - startedAt).toFixed(1) };

            if (repeats >= 2) {
                const box = rows[0].getBoundingClientRect();
                resolve({
                    timeToFirstRowMs: +(firstRowAt - startedAt).toFixed(2),
                    initialRenderMs:  +(now - startedAt).toFixed(2),
                    renderedRows:     count,
                    rowHeightPx:      +box.height.toFixed(2),
                    rowWidthPx:       +box.width.toFixed(2),
                });
                return;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

/**
 * What is on screen right now, as a value that changes when the rows do. The row count alone
 * would not: a jump replaces the rows without changing how many there are.
 */
const viewportSignature = (rows) => `${rows.length}|${rows[0]?.textContent ?? ''}`;

/**
 * How long the viewport takes to show the rows at a new scroll position.
 *
 * Resolves once the rows have changed from what was on screen when the jump was issued and
 * have then held still for a frame. A grid that repaints synchronously bottoms out at two
 * frames; that floor is the same for all five, so the differences between them stand.
 */
export function watchJump({ getRows, startedAt }) {
    return new Promise(resolve => {
        const before = viewportSignature(getRows());
        let last     = before;
        let held     = 0;

        const tick = () => {
            const now     = performance.now();
            const current = viewportSignature(getRows());

            if (current === last) held++;
            else { last = current; held = 0; }

            if (last !== before && held >= 1) {
                resolve(+(now - startedAt).toFixed(2));
                return;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

/** The class names under `node`, most common first. Printed when a row selector matches nothing. */
export function classCensus(node, limit = 12) {
    const counts = new Map();
    for (const element of node.querySelectorAll('*')) {
        for (const className of element.classList) {
            counts.set(className, (counts.get(className) ?? 0) + 1);
        }
    }
    return [...counts.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([className, count]) => `${className}×${count}`)
        .join('  ') || '(nothing rendered at all)';
}

// Sized well past what one scroll produces — around 80 frames at 60 Hz, plus the drain —
// so the array does not have to grow inside the measured window.
const EXPECTED_FRAMES = 500;

/**
 * Counts frames until the returned function is called, which stops it and reports.
 *
 * `frameTimes` is the whole series. The percentiles a run is published by are computed from
 * every run's frames pooled together, in src/bench/stats.js; the figures returned here
 * describe this run alone and go to the console and to `raw`.
 */
export function fpsCounter() {
    const frameTimes = new Array(EXPECTED_FRAMES);
    let counting = true;
    let frames   = 0;
    let lastFrameTime = null;

    const tick = () => {
        if (!counting) return;
        const now = performance.now();

        if (lastFrameTime !== null) frameTimes[frames++] = now - lastFrameTime;

        lastFrameTime = now;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    return () => {
        counting = false;

        // slice, not filter: a frame measured at 0 ms is a frame.
        const recorded = frameTimes.slice(0, frames).map(ms => +ms.toFixed(3));
        const totalMs  = recorded.reduce((total, ms) => total + ms, 0);

        return {
            frameTimes: recorded,
            frames,
            fps:        frames > 0 ? frames / (totalMs / 1000) : 0,
            durationMs: totalMs,
            avgFrameMs: frames > 0 ? totalMs / frames : 0,
            maxFrameMs: frames > 0 ? Math.max(...recorded) : 0,
        };
    };
}
