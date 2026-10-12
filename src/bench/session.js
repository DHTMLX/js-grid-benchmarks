export const SESSION_ENV = 'BENCH_SESSION_ID';

/** '2026-08-03T21-45-07' — UTC, second precision, safe in a filename, sorts chronologically. */
const SESSION_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;

export function newSessionId(date = new Date()) {
    return date.toISOString().slice(0, 19).replace(/:/g, '-');
}

/** The session this process belongs to: the one it inherited, or a new one. */
export function resolveSessionId() {
    const inherited = process.env[SESSION_ENV];
    if (inherited && SESSION_ID_PATTERN.test(inherited)) return inherited;
    if (inherited) {
        console.warn(`  ! ${SESSION_ENV}="${inherited}" is not a session id — starting a new session.`);
    }
    const id = newSessionId();
    process.env[SESSION_ENV] = id;
    return id;
}

/** '2026-08-03 21:45 UTC' for report headings. Ids of another shape are shown as they are. */
export function sessionLabel(id) {
    if (!id) return null;
    if (!SESSION_ID_PATTERN.test(id)) return id;
    return `${id.slice(0, 10)} ${id.slice(11, 13)}:${id.slice(14, 16)} UTC`;
}
