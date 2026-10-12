/**
 * Preparing a dataset on disk: deciding whether the cached file is the one being asked for,
 * and writing it when it is not.
 *
 * Separate from server.js so this can be called and tested without opening a port. Nothing
 * here knows about HTTP.
 */
import fs   from 'node:fs';
import path from 'node:path';

import { DataGenerator, GENERATOR_VERSION } from './generator.js';
import { scenarios }  from '../config/scenarios.js';
import { columnSetOf, getColumns } from '../utils/columns.js';
import { datasetFile, datasetManifest, ensureDir, relToRoot } from '../core/paths.js';

// Rows per write: few enough syscalls, often enough that the server stays answerable.
const ROWS_PER_CHUNK = 2_000;

/**
 * Whether the file on disk is the dataset being asked for. The manifest beside it records
 * the generator that wrote it and the fields it holds, so a scenario that gained a column
 * is not served the old file.
 */
export function isUsable(file, manifest, fields) {
    if (!fs.existsSync(file)) return false;

    let recorded;
    try {
        recorded = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    } catch {
        console.log(`[dataset] ${relToRoot(file)} has no manifest — regenerating`);
        return false;
    }

    if (recorded.generator !== GENERATOR_VERSION) {
        console.log(`[dataset] ${relToRoot(file)} came from generator v${recorded.generator}, this is v${GENERATOR_VERSION} — regenerating`);
        return false;
    }
    if (String(recorded.fields) !== String(fields)) {
        console.log(`[dataset] ${relToRoot(file)} holds different fields than the scenario now reads — regenerating`);
        return false;
    }
    return true;
}

/** Resolves once the chunk is on disk, then yields the event loop before the next one. */
const write = (stream, chunk) => new Promise((resolve, reject) => {
    stream.write(chunk, err => (err ? reject(err) : setImmediate(resolve)));
});

async function writeRows(target, fields, size) {
    const stream    = fs.createWriteStream(target);
    const generator = new DataGenerator();

    await write(stream, '[');

    let buffer = '';
    for (let i = 0; i < size; i++) {
        const row       = generator.getItem(i + 1);
        const projected = {};
        for (const field of fields) projected[field] = row[field];
        buffer += (i > 0 ? ',' : '') + JSON.stringify(projected);

        if ((i + 1) % ROWS_PER_CHUNK === 0) {
            await write(stream, buffer);
            buffer = '';
        }
    }
    if (buffer) await write(stream, buffer);
    await write(stream, ']');

    await new Promise((resolve, reject) => stream.end(err => (err ? reject(err) : resolve())));
}

async function generate(file, manifest, fields, columnSetId, size) {
    ensureDir(path.dirname(file));

    // Renamed onto the real path only on success, so an interrupted generation leaves no
    // truncated file behind.
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    console.log(`[dataset] generating ${columnSetId}/${size} (${fields.length} fields)…`);

    try {
        await writeRows(tmp, fields, size);
    } catch (err) {
        try { fs.unlinkSync(tmp); } catch {}
        throw err;
    }

    fs.renameSync(tmp, file);
    // After the data, so a manifest never describes a file that does not exist yet.
    fs.writeFileSync(manifest, JSON.stringify({ generator: GENERATOR_VERSION, fields }));
    console.log(`[dataset] saved ${relToRoot(file)}`);
    return file;
}

// One generation per dataset, however many requests arrive for it. The grids of a scenario
// start together, and so do the scenarios that share a column set.
const inFlight = new Map();

/** The path of a dataset that is on disk and current, generating it first if it is not. */
export function ensureDataset(scenarioId, size) {
    const scenario = scenarios[scenarioId];
    if (!scenario) return Promise.reject(new Error(`Unknown scenario: ${scenarioId}`));

    // The file belongs to the column set, not to the scenario asking for it.
    const columnSetId = columnSetOf(scenario);
    const file        = datasetFile(columnSetId, size);
    const manifest    = datasetManifest(columnSetId, size);
    const fields      = getColumns(scenario).map(column => column.id);

    if (isUsable(file, manifest, fields)) return Promise.resolve(file);

    const running = inFlight.get(file);
    if (running) return running;

    const started = generate(file, manifest, fields, columnSetId, size)
        .finally(() => inFlight.delete(file));
    inFlight.set(file, started);
    return started;
}
