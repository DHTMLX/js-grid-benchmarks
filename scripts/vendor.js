/**
 * Populates vendor/ from the pinned npm packages. Run with `npm run vendor`.
 *
 * The viewer loads each grid from a fixed path under vendor/ — src/core/registry.js
 * declares the layout this script has to produce. Everything comes from `dependencies` in
 * package.json, pinned exactly and resolved by the lockfile, because a .js file carries no
 * reliable version marker: a published number could otherwise not name the build it measured.
 *
 * DevExtreme is the one that needs more than a copy: it publishes modules to npm but not
 * the single-file dx.all.js the viewer loads with a <script> tag. That one is built with
 * DevExpress's own bundler, shipped in the package — see bundleDevExtreme below.
 *
 * Writes vendor/.versions.json recording what it laid down, so a stale or hand-placed
 * file is visible rather than silently measured. The runner copies that into every
 * results file and the report prints it beside the charts, so a published number always
 * names the build it measured.
 */

import { execFile }                    from 'node:child_process';
import { createRequire }               from 'node:module';
import fs                              from 'node:fs';
import os                              from 'node:os';
import path                            from 'node:path';
import { fileURLToPath }               from 'node:url';
import { promisify }                   from 'node:util';
import { ROOT, VENDOR_DIR, relToRoot } from '../src/core/paths.js';

const execFileAsync = promisify(execFile);

/** This file, named the way an error message should name it. */
const SELF    = relToRoot(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * One entry per vendor/ folder. `pkg` is the npm package the version is read from;
 * `files` are plain copies, `dirs` are recursive copies, `bundle` is built from source.
 *
 * Destination names are the ones src/core/registry.js already expects — where a package
 * names a file differently (DHTMLX ships grid.min.js, the viewer asks for grid.js) the
 * copy renames it rather than the config being edited, so this script stays the only
 * thing that has to know about the difference.
 */
const VENDORS = [
    {
        id:    'ag-grid',
        pkg:   'ag-grid-community',
        files: [
            ['dist/ag-grid-community.min.js', 'ag-grid-community.min.js'],
            // The adapter renders into .ag-theme-alpine with `theme: 'legacy'`, so it
            // needs the pre-Theming-API stylesheets rather than the v33+ default.
            ['styles/ag-grid.css',            'ag-grid.css'],
            ['styles/ag-theme-alpine.css',    'ag-theme-alpine.css'],
        ],
    },
    {
        id:    'bryntum',
        pkg:   '@bryntum/grid-trial',
        files: [
            ['grid.umd.js',        'grid.umd.js'],
            // Bryntum 7 splits its styles three ways and, finding any part missing, fetches
            // the rest from its CDN at run time — during the measurement, over the network.
            // All three are vendored: structural, the default theme, and the icon font.
            ['grid.css',           'grid.css'],
            ['svalbard-light.css', 'svalbard-light.css'],
        ],
        // fontawesome.css and solid.css reference ../webfonts relatively, so the whole
        // folder is copied rather than the two stylesheets.
        dirs:  [['fontawesome', 'fontawesome']],
    },
    {
        id:    'dhtmlx',
        pkg:   '@dhx/trial-grid',
        files: [
            ['codebase/grid.min.js',  'grid.js'],
            ['codebase/grid.min.css', 'grid.css'],
        ],
        // grid.css references ./fonts/ relatively, so the fonts have to sit beside it.
        dirs:  [['codebase/fonts', 'fonts']],
    },
    {
        id:    'jquery',
        pkg:   'jquery',
        files: [['dist/jquery.min.js', 'jquery.min.js']],
    },
    {
        id:    'kendo',
        pkg:   '@progress/kendo-ui',
        files: [['umd/kendo.all.min.js', 'kendo.all.min.js']],
        // The stylesheet is a separate package from the widgets.
        also:  [{ pkg: '@progress/kendo-theme-default', files: [['dist/default-main.css', 'default-main.css']] }],
    },
    {
        id:     'devextreme',
        pkg:    'devextreme',
        files:  [['dist/css/dx.light.css', 'dx.light.css']],
        bundle: { config: 'bundles/dx.custom.config.js', out: 'dx.all.js' },
    },
];

/**
 * Directory a package was installed into, or null when it is not installed.
 *
 * node_modules is checked before require.resolve because several of these packages
 * declare an `exports` map that does not expose ./package.json — AG Grid and Kendo UI
 * both do — and resolve then throws for a package that is installed and perfectly fine.
 */
function packageDir(pkg) {
    const direct = path.join(ROOT, 'node_modules', ...pkg.split('/'));
    if (fs.existsSync(path.join(direct, 'package.json'))) {
        return direct;
    }
    try {
        return path.dirname(require.resolve(`${pkg}/package.json`, { paths: [ROOT] }));
    } catch {
        return null;
    }
}

const readVersion = dir => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;

/**
 * Builds the single DevExtreme script the viewer loads, using DevExpress's own bundler.
 *
 * The package ships `bin/bundler.js` (the `devextreme-bundler` binary), its own webpack
 * config, and `bundles/dx.custom.config.js` — the widget list dx.all.js is built from.
 * We run that config *unmodified*, so what lands in vendor/ is the same set of widgets
 * as the dx.all.js from the manual download, built the way DevExpress builds it. This
 * is deliberate and it is the whole point: the viewer loads it with a plain <script>
 * tag, so the numbers have to describe what a `<script src="dx.all.js">` user gets, not
 * a leaner tree-shaken build we chose ourselves. A hand-rolled bundle would be a fair
 * thing to measure but not a fair thing to publish under DevExtreme's name.
 *
 * Nothing here needs a jQuery shim: their webpack config already declares
 * `externals: { jquery: 'window.jQuery' }`, so the plugin registers on the page's copy.
 *
 * The bundler takes its input config from the working directory and writes its output
 * there too, so it runs in a temp directory rather than the repo root. It always emits
 * a development build alongside the production one; only the latter is kept.
 */
async function bundleDevExtreme(pkgDir, configRel, outfile) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-bundle-'));
    try {
        const config = path.join(pkgDir, configRel);
        if (!fs.existsSync(config)) {
            throw new Error(
                `devextreme has no ${configRel} — the package layout changed. ` +
                `Update the mapping in ${SELF}.`,
            );
        }
        fs.copyFileSync(config, path.join(work, 'dx.custom.config.js'));

        // Their bundler resolves `webpack` from its own location, so cwd only decides
        // where the config is read from and where the output is written.
        const { stdout } = await execFileAsync(
            process.execPath,
            [path.join(pkgDir, 'bin/bundler.js')],
            { cwd: work, maxBuffer: 32 * 1024 * 1024 },
        );

        // The bundler reports a failed build on stdout and still exits 0, so the exit
        // code alone would let a broken bundle through.
        if (/failed/i.test(stdout)) {
            throw new Error(`devextreme-bundler did not complete:\n${stdout.trim()}`);
        }

        const built = path.join(work, 'dx.custom.js');
        if (!fs.existsSync(built)) {
            throw new Error(`devextreme-bundler produced no dx.custom.js:\n${stdout.trim()}`);
        }
        fs.copyFileSync(built, outfile);
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

async function main() {
    const missing  = [];
    const manifest = {};
    let   written  = 0;

    for (const entry of VENDORS) {
        const dir = packageDir(entry.pkg);
        if (!dir) {
            missing.push(entry.pkg);
            continue;
        }

        const destDir = path.join(VENDOR_DIR, entry.id);
        fs.mkdirSync(destDir, { recursive: true });

        const sources = [{ pkg: entry.pkg, dir, files: entry.files ?? [] }];
        for (const extra of entry.also ?? []) {
            const extraDir = packageDir(extra.pkg);
            if (!extraDir) {
                missing.push(extra.pkg);
                continue;
            }
            sources.push({ ...extra, dir: extraDir });
        }

        const versions = {};
        for (const source of sources) {
            versions[source.pkg] = readVersion(source.dir);
            for (const [from, to] of source.files) {
                const src = path.join(source.dir, from);
                if (!fs.existsSync(src)) {
                    throw new Error(
                        `${source.pkg} has no ${from} — the package layout changed. ` +
                        `Update the mapping in ${SELF}.`,
                    );
                }
                fs.copyFileSync(src, path.join(destDir, to));
                written++;
            }
        }

        for (const [from, to] of entry.dirs ?? []) {
            fs.cpSync(path.join(dir, from), path.join(destDir, to), { recursive: true });
        }

        if (entry.bundle) {
            await bundleDevExtreme(dir, entry.bundle.config, path.join(destDir, entry.bundle.out));
            written++;
        }

        const extras = Object.fromEntries(
            Object.entries(versions).filter(([pkg]) => pkg !== entry.pkg),
        );
        manifest[entry.id] = {
            package: entry.pkg,
            version: versions[entry.pkg],
            ...(Object.keys(extras).length ? { also: extras } : {}),
        };

        const label = Object.entries(versions).map(([p, v]) => `${p}@${v}`).join(', ');
        console.log(`  ${entry.id.padEnd(11)} ${label}`);
    }

    if (missing.length) {
        throw new Error(
            `not installed: ${missing.join(', ')}\n` +
            '  Run `npm install` first — vendor/ is populated from the pinned packages.',
        );
    }

    fs.writeFileSync(
        path.join(VENDOR_DIR, '.versions.json'),
        `${JSON.stringify({ generated: new Date().toISOString(), packages: manifest }, null, 4)}\n`,
        'utf8',
    );

    console.log(`\n${written} files into ${relToRoot(VENDOR_DIR)}/  (see vendor/.versions.json)`);
}

main().catch(err => {
    console.error(`\nvendor: ${err.message}`);
    process.exitCode = 1;
});
