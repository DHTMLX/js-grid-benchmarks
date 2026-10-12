/**
 * Argument parsing and validation for every entry point, driven by src/core/options.js.
 *
 * Nothing here interprets a flag's meaning: argv becomes a validated object, or a CliError
 * naming the flag and what was wrong with it. An invalid value stops the process before a
 * browser starts, so it cannot reach a URL, a filename or a results file as NaN.
 */
import { COMMANDS, FLAGS } from './options.js';

export class CliError extends Error {}

const fail = (message) => { throw new CliError(message); };

const quote = (values) => values.map(v => `"${v}"`).join(', ');

/** `--k=v` and `--k` into `[name, rawValue]`; a bare switch carries `true`. */
function tokenize(argv) {
    const tokens = [];
    for (const arg of argv) {
        if (!arg.startsWith('--')) {
            fail(`unexpected argument "${arg}" — every option starts with --`);
        }
        const body = arg.slice(2);
        if (body === '') fail('"--" on its own is not an option');
        const eq = body.indexOf('=');
        tokens.push(eq === -1 ? [body, true] : [body.slice(0, eq), body.slice(eq + 1)]);
    }
    return tokens;
}

function toInt(name, raw, spec) {
    if (raw === true) fail(`--${name} needs a value, e.g. --${name}=${spec.default ?? 1}`);
    if (!/^-?\d+$/.test(raw.trim())) {
        fail(`--${name} must be a whole number, got "${raw}"`);
    }
    const value = Number(raw);
    const { min, max } = spec;
    if (min !== undefined && value < min) fail(`--${name} must be at least ${min}, got ${value}`);
    if (max !== undefined && value > max) fail(`--${name} must be at most ${max}, got ${value}`);
    return value;
}

function toSwitch(name, raw) {
    if (raw === true || raw === 'true')  return true;
    if (raw === 'false') return false;
    fail(`--${name} is a switch — pass --${name} or --${name}=true|false, got "${raw}"`);
}

function toString_(name, raw, spec) {
    if (raw === true) fail(`--${name} needs a value`);
    if (spec.choices) {
        const allowed = spec.choices();
        if (!allowed.includes(raw)) {
            fail(`--${name}="${raw}" is not one of: ${quote(allowed)}`);
        }
    }
    if (spec.validate) {
        // Validators live with the code owning the format and throw plain Errors.
        try {
            spec.validate(raw);
        } catch (err) {
            fail(err.message);
        }
    }
    return raw;
}

function toIntList(name, raw, spec) {
    if (raw === true) fail(`--${name} needs a value, e.g. --${name}=10000,50000`);
    const parts = raw.split(',').map(p => p.trim()).filter(p => p !== '');
    if (!parts.length) fail(`--${name} is empty`);
    return parts.map(part => toInt(name, part, spec));
}

const COERCE = {
    string:  toString_,
    int:     toInt,
    intList: toIntList,
    switch:  (name, raw) => toSwitch(name, raw),
};

/** Parse argv for one command into a complete option object, defaults filled in. */
export function parse(argv, commandName) {
    const command = COMMANDS[commandName];
    if (!command) fail(`unknown command "${commandName}"`);

    const values   = {};
    const provided = new Set();

    for (const [name, raw] of tokenize(argv)) {
        if (name === 'help') { provided.add('help'); values.help = true; continue; }

        const spec = FLAGS[name];
        if (!spec) fail(`unknown option --${name}\n${knownFlags(command)}`);
        if (!command.flags.includes(name)) {
            fail(`--${name} is not accepted by ${command.script}\n${knownFlags(command)}`);
        }
        if (provided.has(name)) fail(`--${name} given more than once`);

        values[name] = COERCE[spec.type](name, raw, spec);
        provided.add(name);
    }

    for (const name of command.flags) {
        if (provided.has(name)) continue;
        const spec = FLAGS[name];
        if (spec.default !== undefined)   values[name] = spec.default;
        else if (spec.type === 'switch')  values[name] = false;
        else                              values[name] = null;
    }

    return values;
}

const knownFlags = (command) => `accepted here: ${command.flags.map(f => '--' + f).join(' ')}`;

/** Every option a command accepts, at its declared default. */
export function defaultsFor(commandName) {
    return parse([], commandName);
}

export function renderHelp(commandName) {
    const command = COMMANDS[commandName];
    const width   = Math.max(...command.flags.map(f => f.length)) + 2;

    const lines = [`${command.script} — ${command.help}`, ''];
    for (const name of command.flags) {
        const spec = FLAGS[name];
        const shown = spec.type === 'switch' ? `--${name}` : `--${name}=`;
        const tail  = spec.default !== undefined ? `  (default ${formatDefault(spec.default)})` : '';
        lines.push(`  ${shown.padEnd(width + 2)}${spec.help}${tail}`);
    }
    return lines.join('\n');
}

const formatDefault = (value) => Array.isArray(value) ? value.join(',') : String(value);

/** Wrapper for entry points: prints help or a parse error, then exits. */
export function parseOrExit(argv, commandName) {
    let values;
    try {
        values = parse(argv, commandName);
    } catch (err) {
        if (!(err instanceof CliError)) throw err;
        console.error(`\n${err.message}\n`);
        process.exit(1);
    }
    if (values.help) {
        console.log(renderHelp(commandName));
        process.exit(0);
    }
    return values;
}
