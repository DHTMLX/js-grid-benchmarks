/**
 * Every filesystem location the suite uses, derived once from this file's own location.
 */
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT         = path.resolve(HERE, '../..');
export const SRC_DIR      = path.join(ROOT, 'src');
export const RESULTS_DIR  = path.join(ROOT, 'results');
export const HISTORY_DIR  = path.join(RESULTS_DIR, 'history');
export const LATEST_FILE  = path.join(RESULTS_DIR, 'latest.json');
export const REPORT_FILE  = path.join(RESULTS_DIR, 'report.html');
export const REPORT_MD_FILE = path.join(RESULTS_DIR, 'report.md');
export const DATASETS_DIR = path.join(SRC_DIR, 'data', 'datasets');
export const VENDOR_DIR   = path.join(ROOT, 'vendor');
export const VERSIONS_FILE = path.join(VENDOR_DIR, '.versions.json');
export const VIEWER_DIR   = path.join(SRC_DIR, 'viewer');

export const DATA_SERVER_SCRIPT = path.join(SRC_DIR, 'data', 'server.js');
export const VITE_BIN           = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

export const datasetFile = (columnSetId, size) =>
    path.join(DATASETS_DIR, columnSetId, `${size}.json`);

export const datasetManifest = (columnSetId, size) =>
    path.join(DATASETS_DIR, columnSetId, `${size}.meta.json`);

export function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

export const relToRoot = (target) => path.relative(ROOT, target).replace(/\\/g, '/');
