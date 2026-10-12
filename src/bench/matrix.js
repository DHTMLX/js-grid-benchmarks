/**
 * The whole matrix — every scenario at every requested size — in one process.
 *
 * This is what `npm run bench` runs, whether one size was asked for or five: a single size is
 * a matrix of one row, not a separate command. The dataset server and the Vite viewer start
 * once here and stay up throughout; each `runBenchmark` inside finds them listening and
 * leaves them alone.
 */
import fs from 'node:fs';

import { scenarioSets, scenarios } from '../config/scenarios.js';
import { datasetFile, datasetManifest, relToRoot } from '../core/paths.js';
import { columnSetOf } from '../utils/columns.js';
import { defaultsFor } from '../core/cli.js';
import { createCleanup } from '../core/process.js';
import { resolveSessionId } from './session.js';
import { printSummary, runBenchmark, saveResults, startServers } from './runner.js';

const RULE = '═'.repeat(62);

/** Free a dataset once nothing left in the matrix reads it; at 800k rows a run outgrows the disk. */
function discardDataset(columnSetId, size) {
    const file = datasetFile(columnSetId, size);
    try {
        const bytes = fs.statSync(file).size;
        fs.unlinkSync(file);
        // The manifest would otherwise describe a file that is gone.
        fs.rmSync(datasetManifest(columnSetId, size), { force: true });
        console.log(`[cleanup] removed ${relToRoot(file)} (${(bytes / 1024 / 1024).toFixed(0)} MB freed)`);
    } catch {
        // Never created, because every grid failed before fetching it.
    }
}

/**
 * Position of the last scenario reading each column set.
 *
 * A dataset belongs to its column set, so three scenarios can share one file. Freeing it after
 * the first of them would leave the other two to generate it again.
 */
function lastReaderOfEachColumnSet(scenarioIds) {
    const lastReader = new Map();
    scenarioIds.forEach((id, index) => lastReader.set(columnSetOf(scenarios[id]), index));
    return lastReader;
}

/**
 * Measure the selected grids against every scenario at every size. Each cell is written to
 * results/ as it completes, so an interrupted matrix keeps what it measured.
 */
export async function runMatrix(options = {}) {
    const opts = { ...defaultsFor('bench'), ...options };

    const scenarioIds = opts.scenario ? [opts.scenario] : scenarioSets[opts.set];
    const sizes       = opts.sizes;
    // One invocation is one session, however many hours and midnights it crosses.
    const sessionId   = resolveSessionId();
    const startedAt   = Date.now();

    console.log(`\n${RULE}`);
    console.log(`  Matrix of ${sizes.length * scenarioIds.length} cells`);
    console.log(`  Session:   ${sessionId}`);
    console.log(`  Sizes:     ${sizes.join(', ')}`);
    console.log(`  Scenarios: ${scenarioIds.join(', ')}${opts.scenario ? '' : ` (set: ${opts.set})`}`);
    console.log(`  Grids:     ${opts.grid ?? 'all'}`);
    console.log(`  Runs:      ${opts.runs} (+${opts.warmup} warmup)`);
    console.log(`  Window:    ${opts.headless ? 'hidden (headless — FPS is synthetic)' : 'visible'}`);
    console.log(`${RULE}\n`);

    const cleanup    = createCleanup();
    const lastReader = lastReaderOfEachColumnSet(scenarioIds);
    let measured     = 0;
    let failed       = 0;

    try {
        await startServers(cleanup);

        for (const size of sizes) {
            for (const [index, scenarioId] of scenarioIds.entries()) {
                console.log(`\n${RULE}`);
                console.log(`  ${scenarioId} — ${size.toLocaleString()} rows`);
                console.log(`${RULE}`);

                const output = await runBenchmark({ ...opts, size, scenario: scenarioId });
                saveResults(output);
                printSummary(output);

                measured += output.summaries.length;
                failed   += output.failed.length;

                const columnSetId = columnSetOf(scenarios[scenarioId]);
                if (opts.cleanup && lastReader.get(columnSetId) === index) {
                    discardDataset(columnSetId, size);
                }
            }
        }
    } finally {
        cleanup.run();
    }

    return { session: sessionId, cells: sizes.length * scenarioIds.length, measured, failed,
        durationMs: Date.now() - startedAt };
}

export function printMatrixSummary({ session, cells, measured, failed, durationMs }) {
    console.log(`\n${RULE}`);
    console.log(`  Complete: ${cells} cells, ${measured} measured, ${failed} failed`);
    console.log(`  Session:  ${session}`);
    console.log(`  Duration: ${(durationMs / 60000).toFixed(1)} min`);
    console.log(`${RULE}\n`);
}
