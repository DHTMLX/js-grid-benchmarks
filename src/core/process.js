/**
 * Starting the local servers, waiting for them, and making sure they are gone afterwards.
 */
import net from 'node:net';
import { spawn } from 'node:child_process';

/** One connect attempt to one address. Resolves true if something accepted. */
function tryConnect(port, host, timeoutMs) {
    return new Promise(resolve => {
        const socket = net.connect({ port, host });
        const settle = (result) => { socket.destroy(); resolve(result); };
        socket.once('connect', () => settle(true));
        socket.once('error',   () => settle(false));
        socket.setTimeout(timeoutMs, () => settle(false));
    });
}

/**
 * Wait until something is listening on `port`, returning whether it ever did.
 *
 * A TCP connect, not an HTTP request: the two servers answer different shapes. Both
 * addresses are tried because localhost resolves to ::1 before 127.0.0.1 on Windows while
 * a server may be bound to only one.
 */
export async function waitForPort(port, { timeoutMs = 15_000, intervalMs = 300 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await tryConnect(port, '::1', 500))       return true;
        if (await tryConnect(port, '127.0.0.1', 500)) return true;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return false;
}

/**
 * Spawn a Node script with the interpreter running this process. `spawn('node', …)` would
 * take whatever is first on PATH, and the Node version is recorded in every results file.
 */
export function spawnNode(scriptPath, args = [], options = {}) {
    return spawn(process.execPath, [scriptPath, ...args], {
        stdio: ['ignore', 'inherit', 'inherit'],
        ...options,
    });
}

// The matrix holds one cleanup for its servers and another per benchmark inside it. Signal
// handlers are installed once per process and dispatch to all of them, innermost first.
const liveCleanups = new Set();
let signalsInstalled = false;

function installSignalHandlers() {
    if (signalsInstalled) return;
    signalsInstalled = true;

    const onSignal = (signal) => {
        for (const cleanup of [...liveCleanups].reverse()) cleanup.run();
        // 128 + signal number, the convention for "killed by this signal".
        process.exit(signal === 'SIGINT' ? 130 : 143);
    };

    process.once('SIGINT',  () => onSignal('SIGINT'));
    process.once('SIGTERM', () => onSignal('SIGTERM'));
}

/**
 * Collects teardown callbacks and guarantees they run once — on normal completion, on an
 * exception, or on Ctrl-C.
 */
export function createCleanup() {
    const tasks = [];
    let finished = false;

    const run = () => {
        if (finished) return;
        finished = true;
        liveCleanups.delete(handle);
        for (const task of tasks.reverse()) {
            try {
                task();
            } catch (err) {
                console.warn(`  ! cleanup failed: ${err.message}`);
            }
        }
    };

    const handle = {
        add: (task) => { tasks.push(task); return task; },
        /** Kill a child process on the way out, ignoring one that already exited. */
        addChild(child) {
            if (child) tasks.push(() => { if (!child.killed) child.kill(); });
            return child;
        },
        run,
    };

    installSignalHandlers();
    liveCleanups.add(handle);
    return handle;
}

/**
 * Start `script` unless something is already listening on `port`. Returns the child, or
 * null when an existing server was reused. Throws if it never came up.
 */
export async function ensureServer({ port, script, label, cleanup, startTimeoutMs = 20_000 }) {
    if (await waitForPort(port, { timeoutMs: 2_000 })) return null;

    console.log(`Starting ${label}…`);
    const child = spawnNode(script);
    cleanup?.addChild(child);

    if (!await waitForPort(port, { timeoutMs: startTimeoutMs })) {
        throw new Error(
            `${label} did not start on port ${port} within ${startTimeoutMs / 1000}s. ` +
            'Nothing was measured.',
        );
    }
    return child;
}
