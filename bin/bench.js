#!/usr/bin/env node
import { parseOrExit } from '../src/core/cli.js';
import { BenchmarkError } from '../src/bench/runner.js';
import { printMatrixSummary, runMatrix } from '../src/bench/matrix.js';

const options = parseOrExit(process.argv.slice(2), 'bench');

let result;
try {
    result = await runMatrix(options);
} catch (err) {
    if (!(err instanceof BenchmarkError)) throw err;
    console.error(`\n${err.message}\n`);
    process.exit(1);
}

printMatrixSummary(result);

if (!result.measured) {
    console.error(`All ${result.cells} cells failed. Nothing was measured.`);
    process.exit(1);
}
