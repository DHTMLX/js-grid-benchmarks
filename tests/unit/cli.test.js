import { test } from 'node:test';
import assert   from 'node:assert/strict';

import { CliError, defaultsFor, parse, renderHelp } from '../../src/core/cli.js';
import { COMMANDS, FLAGS, MAX_ROWS, MIN_ROWS } from '../../src/core/options.js';

const values = (argv, command = 'bench') => parse(argv, command);
const rejects = (argv, command = 'bench') =>
    assert.throws(() => parse(argv, command), CliError, `expected ${argv.join(' ')} to be rejected`);

// ── The values that used to travel on unchecked ───────────────────────────────

test('a non-numeric size is refused instead of becoming NaN', () => {
    rejects(['--sizes=abc']);
    rejects(['--sizes=10k']);
    rejects(['--sizes=']);
    rejects(['--sizes=1e5']);
    // The reading side takes one size rather than a list, and validates it the same way.
    rejects(['--size=abc'], 'inspect');
    rejects(['--size=1e5'], 'inspect');
});

test('runs below one is refused instead of producing an empty results file', () => {
    rejects(['--runs=0']);
    rejects(['--runs=-3']);
    assert.equal(values(['--runs=1']).runs, 1);
});

test('a valueless --machine is refused rather than labelling the run "true"', () => {
    rejects(['--machine']);
});

test('--machine rejects anything that is not a plain name', () => {
    rejects(['--machine=has space']);
    rejects(['--machine=-leading-dash']);
    assert.equal(values(['--machine=cpu-model3-win']).machine, 'cpu-model3-win');
});

test('one bad entry rejects the whole size list', () => {
    rejects(['--sizes=10000,foo']);
    rejects(['--sizes=10k,50000']);
    assert.deepEqual(values(['--sizes=10000,50000']).sizes, [10_000, 50_000]);
});

// One size is a list of one, not a different command.
test('a single size is an ordinary --sizes value', () => {
    assert.deepEqual(values(['--sizes=10000']).sizes, [10_000]);
    assert.deepEqual(values([]).sizes, [10_000]);
});

test('sizes outside the range the dataset server serves are refused', () => {
    rejects([`--sizes=${MIN_ROWS - 1}`]);
    rejects([`--sizes=${MAX_ROWS + 1}`]);
    rejects([`--sizes=10000,${MAX_ROWS + 1}`]);
    rejects([`--size=${MIN_ROWS - 1}`], 'inspect');
});

// ── Structure ─────────────────────────────────────────────────────────────────

test('an unknown option is named rather than ignored', () => {
    rejects(['--nosuchflag=1']);
    rejects(['--siez=10000']);
});

test('an option belonging to another command is refused', () => {
    rejects(['--size=10000'], 'bench');
    rejects(['--sizes=10000'], 'inspect');
    rejects(['--headless'], 'inspect');
    rejects(['--view=summary'], 'bench');
});

test('a repeated option is refused', () => {
    rejects(['--sizes=10000', '--sizes=50000']);
});

test('bare arguments are refused', () => {
    rejects(['size=10000']);
    rejects(['--']);
});

// ── Types ─────────────────────────────────────────────────────────────────────

test('switches accept the bare and the explicit form', () => {
    assert.equal(values(['--headless']).headless, true);
    assert.equal(values(['--headless=true']).headless, true);
    assert.equal(values(['--headless=false']).headless, false);
    assert.equal(values([]).headless, false);
    rejects(['--headless=yes']);
});

test('the scroll distance is a number of pixels and nothing else', () => {
    assert.equal(values(['--maxDistance=25000']).maxDistance, 25_000);
    rejects(['--maxDistance=full']);
    rejects(['--maxDistance=partial']);
});

test('grid, scenario and set are checked against what exists', () => {
    rejects(['--grid=no-such-grid']);
    rejects(['--scenario=tpl4']);
    rejects(['--set=everything']);
    assert.equal(values(['--grid=dhtmlx']).grid, 'dhtmlx');
    assert.equal(values(['--scenario=tpl10']).scenario, 'tpl10');
    assert.equal(values(['--set=smoke']).set, 'smoke');
});

// ── Defaults ──────────────────────────────────────────────────────────────────

test('an unflagged run measures three times with a warmup', () => {
    const options = values([]);
    assert.equal(options.runs, 3);
    assert.equal(options.warmup, 1);
    assert.equal(options.allowSingleRun, false);
});

test('the remaining defaults', () => {
    const options = values([]);
    assert.deepEqual(options.sizes, [10_000]);
    assert.equal(options.maxDistance, 50_000);
    assert.equal(options.order, 'registry');
    assert.equal(options.set, 'full');
    assert.equal(options.grid, null);
    assert.equal(options.scenario, null);
});

test('defaultsFor fills in every flag its command accepts', () => {
    for (const [name, command] of Object.entries(COMMANDS)) {
        const defaults = defaultsFor(name);
        for (const flag of command.flags) {
            assert.ok(flag in defaults, `defaultsFor("${name}") omits --${flag}`);
        }
    }
});

// ── Declaration integrity ─────────────────────────────────────────────────────

test('every command lists only declared flags', () => {
    for (const [name, command] of Object.entries(COMMANDS)) {
        for (const flag of command.flags) {
            assert.ok(FLAGS[flag], `command ${name} lists undeclared --${flag}`);
        }
    }
});

test('every declared flag is reachable from at least one command', () => {
    const reachable = new Set(Object.values(COMMANDS).flatMap(c => c.flags));
    for (const flag of Object.keys(FLAGS)) {
        assert.ok(reachable.has(flag), `--${flag} is declared but no command accepts it`);
    }
});

test('every flag carries help text', () => {
    for (const [name, spec] of Object.entries(FLAGS)) {
        assert.equal(typeof spec.help, 'string', `--${name} has no help text`);
        assert.ok(spec.help.length > 0, `--${name} has empty help text`);
    }
});

test('help renders for every command and names every flag it accepts', () => {
    for (const [name, command] of Object.entries(COMMANDS)) {
        const text = renderHelp(name);
        for (const flag of command.flags) {
            assert.match(text, new RegExp(`--${flag}`), `help for ${name} omits --${flag}`);
        }
    }
});
