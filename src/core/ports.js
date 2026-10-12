/**
 * Ports for the two local servers, overridable so a busy machine can run the suite
 * without editing source.
 *
 *   GRIDBENCH_DATA_PORT     dataset server   (default 8081)
 *   GRIDBENCH_VIEWER_PORT   Vite viewer      (default 5173)
 */

function readPort(envName, fallback) {
    const raw = process.env[envName];
    if (raw === undefined || raw === '') return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`${envName}="${raw}" is not a valid port number`);
    }
    return value;
}

export const DATA_SERVER_PORT = readPort('GRIDBENCH_DATA_PORT', 8081);
export const VIEWER_PORT      = readPort('GRIDBENCH_VIEWER_PORT', 5173);

// Not `localhost`: on Windows that resolves to ::1 before 127.0.0.1, and a server bound to
// one with a client asking for the other fails as though it never started.
export const DATA_SERVER_HOST = '127.0.0.1';

export const DATA_SERVER_URL = `http://${DATA_SERVER_HOST}:${DATA_SERVER_PORT}`;
export const VIEWER_URL      = `http://localhost:${VIEWER_PORT}`;
