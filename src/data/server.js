#!/usr/bin/env node
/**
 * Dataset HTTP server.
 *
 * GET /{scenario}/{size}.json returns rows carrying only the fields that scenario reads,
 * generating the file on first request and caching it on disk. Generation itself lives in
 * datasets.js and yields the event loop, so the server stays answerable while it runs.
 */
import http from 'node:http';
import fs   from 'node:fs';

import { ensureDataset } from './datasets.js';
import { scenarios } from '../config/scenarios.js';
import { DATASETS_DIR, ensureDir, relToRoot } from '../core/paths.js';
import { DATA_SERVER_HOST, DATA_SERVER_PORT } from '../core/ports.js';
import { MAX_ROWS, MIN_ROWS } from '../core/options.js';

ensureDir(DATASETS_DIR);

const URL_PATTERN = /^\/([a-zA-Z][a-zA-Z0-9_-]*)\/(\d+)\.json$/;

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const match = URL_PATTERN.exec(req.url);
    if (!match) { res.writeHead(400); res.end('Bad request'); return; }

    const scenarioId = match[1];
    const size = parseInt(match[2], 10);

    if (!scenarios[scenarioId]) {
        res.writeHead(404); res.end(`Unknown scenario: ${scenarioId}`); return;
    }
    if (size < MIN_ROWS || size > MAX_ROWS) {
        res.writeHead(400); res.end(`Size out of range (${MIN_ROWS}–${MAX_ROWS})`); return;
    }

    let file;
    try {
        file = await ensureDataset(scenarioId, size);
    } catch (err) {
        // The response names no local path; the page that receives it ends up in screenshots.
        console.error(`[dataset] ${scenarioId}/${size} failed: ${err.stack ?? err}`);
        res.writeHead(500);
        res.end(`Could not prepare dataset ${scenarioId}/${size} — see the dataset server log.`);
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    fs.createReadStream(file).pipe(res);
});

// Loopback only: there is nothing here for another machine to ask for.
server.listen(DATA_SERVER_PORT, DATA_SERVER_HOST, () => {
    console.log(`Dataset server running at http://${DATA_SERVER_HOST}:${DATA_SERVER_PORT}`);
    console.log(`Serving from ${relToRoot(DATASETS_DIR)}`);
});
