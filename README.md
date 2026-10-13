# Grid Performance Benchmark

Performance figures for five JavaScript data grids — AG Grid, Bryntum Grid, DevExtreme DataGrid,
DHTMLX Grid and Kendo UI Grid — measured on the same data, the same row height and the same scroll.

![](https://raw.githubusercontent.com/DHTMLX/public-files/refs/heads/main/article/js-grid-benchmark.png)


**100 000 rows, 20 columns with HTML in cells:**

| Grid | Median frame, ms | P95 frame, ms | Worst frame, ms | FPS |
| --- | --- | --- | --- | --- |
| AG Grid | 16.7 | 26.19 | 69 | 57 |
| Bryntum | 16.6 | 23.1 | 38.5 | 60 |
| DevExtreme | 18.7 | 32.65 | 72.8 | 51 |
| DHTMLX | 16.6 | 21.23 | 41.6 | 60 |
| Kendo | 16.9 | 95.26 | 111.5 | 35 |

Every median frame sits within 16.6–18.7 ms, close to the display's floor. The P95 column is where the
grids separate: 21 ms to 95 ms here, and 13× across the full matrix. [More below](#results).

## Why another grid benchmark

Most grid comparisons publish one number per grid — an FPS figure, or a mean frame time, at one
dataset size. One number can't tell two very different problems apart.

Here are two of them from this round. The first grid has a typical frame of 16.9 ms, the floor a 60 Hz
display allows, and one frame in twenty at 95 ms. It scrolls smoothly, then stalls at a page boundary.
The second has a *median* of 95.5 ms, so every frame is late. Average either one into FPS and they land
in roughly the same place.

So this suite publishes the distribution instead: median, 95th percentile and worst frame, pooled over
every frame of every run, with the run-to-run spread next to each figure. It covers three behaviors —
building the grid, scrolling it, and jumping to a row deep in the dataset. Each one runs across 10 000
to 800 000 rows and 10 to 40 columns, with and without HTML in cells, with and without frozen columns.

Everything needed to re-run it is in this repository.

## Who publishes this

**DHTMLX publishes this suite, and DHTMLX Grid is one of the five grids in it.**

Here's what that means in practice:

- The method is written out in [METHODOLOGY.md](METHODOLOGY.md), including every setting applied
  beyond a vendor default — a closed list, in §2.
- Datasets are deterministic and seeded.
- Every results file records the exact package version of each grid and the machine that ran it.
- The harness that did the measuring is the code in this repository.

AG Grid is measured as `ag-grid-community`, alongside four commercial trials. Every grid runs on its
vendor's defaults apart from that closed list. These are untuned numbers, which is what an
application gets before anyone tunes it.

## How it measures

Three behaviors, per grid, per scenario, per dataset size:

| | What is timed |
| --- | --- |
| **Initial render** | from the call to the grid's constructor until the viewport holds the expected number of rows, stable across two consecutive frames |
| **Scroll** | a frame-time series collected with `requestAnimationFrame` while the grid's own scroll container is driven programmatically over 50 000 px |
| **Jump to depth** | from a programmatic jump to 90 % of the dataset until the viewport catches up |

Library download, library parse, `fetch` and `JSON.parse` all finish before the first clock starts.
That holds for all five grids.

Every grid runs 40 px rows, so pixels convert to rows and the scroll is the same amount of work for
each. 50 000 px at that height is 1250 rows, at every dataset size, and the jump is what reaches a
high index.

Run counts, how percentiles come off the pooled frame series, and the refresh-rate check that decides
whether an FPS figure describes the machine are in [METHODOLOGY.md](METHODOLOGY.md) §4–6, along with
the boundary of every metric.

## Results

What produced these numbers:

| | |
| --- | --- |
| Machine | AMD Ryzen 7 4700U, 8 cores, 15 GB, Windows 10 |
| Browser | Chromium 145.0.7632.6, headed, 1920×1080 |
| Display | 60 Hz, measured and validated |
| Runs per point | 5, plus one discarded warmup |
| Matrix | 5 grids × 8 scenarios × 5 sizes = 200 cells, no failures |

| Grid | npm package | Version measured |
| --- | --- | --- |
| AG Grid | `ag-grid-community` | 36.0.2 |
| Bryntum Grid | `@bryntum/grid-trial` | 7.3.4 |
| DevExtreme DataGrid | `devextreme` | 26.1.3 |
| DHTMLX Grid | `@dhx/trial-grid` | 9.3.8 |
| Kendo UI Grid | `@progress/kendo-ui` | 2026.2.520 |

### Reading the 100 000-row table

That's the table at the top of this file. Every grid built itself, scrolled 50 000 px, then jumped to
row 90 000.

The median frame sits within 16.6–18.7 ms for all five, and two grids report 60 FPS. Stop the
comparison at those two columns and there's little left to tell them apart.

Kendo shows why the percentile matters. Its typical frame is 16.9 ms, and one frame in twenty takes
95.26 ms. The cost doesn't spread evenly across frames, so its FPS figure of 35 averages the smooth
stretches together with the slow ones.

The worst frame is the largest single spike across every run of the cell. It's one frame, so it
doesn't describe typical scrolling. Read it beside P95, never instead of it.

### From 10 000 to 800 000 rows

Build time in milliseconds, ten template columns, at every size.

| Grid | 10k | 50k | 100k | 200k | 800k |
| --- | --- | --- | --- | --- | --- |
| AG Grid | 148.6 | 199.4 | 255.8 | 386.1 | 1149.4 |
| Bryntum | 268.6 | 532.3 | 838.8 | 1503.1 | 5330.2 |
| DevExtreme | 180.5 | 182.8 | 178.1 | 179.6 | 186.1 |
| DHTMLX | 55 | 65.5 | 73.8 | 93.3 | 242.8 |
| Kendo | 93.1 | 93.5 | 91.1 | 96.5 | 115.2 |

From 10 000 rows to 800 000, build time grows 1.03× for DevExtreme, 1.2× for Kendo, 4.4× for DHTMLX,
7.7× for AG Grid and 19.8× for Bryntum. DevExtreme's render time moves by 6 ms across the whole axis,
Kendo's by 22 ms. Their grid-side heap at the largest size is 11.6 MB and 11.3 MB.

AG Grid's P95 is 17.8 ms at 10 000 rows and 2.6× that at 800 000. Its *median* frame
moves too, to 31.9 ms, so at that size the frames are late consistently rather than occasionally. With
40 columns and three of them frozen, the median reaches 95.5 ms and the same 50 000 px take 30.8 s.
Frozen columns add nothing measurable up to 200 000 rows and +172.56 ms of P95 at 800 000. It's the
only grid here whose frozen-column cost depends on dataset size.

Bryntum sits at the other end of the render column. It spends 5.3 s building itself at 800 000 rows and
12.3 s with 40 columns, the longest in the set, and its grid-side heap at that point is 761.66 MB. Its
scroll figures don't follow: P95 is 19.5 ms at 10 000 rows and 19.2 ms at 800 000. DHTMLX holds that
same shape at a lower level, 17.3 ms and 17.2 ms, and builds itself in 242.8 ms.

## What the round shows

Five grids, five approaches, and five different points where the numbers change character.

| Grid | What the figures describe | Where they change |
| --- | --- | --- |
| **DHTMLX** | flat across every axis: median 16.6–16.7 ms in all 40 cells, P95 17.1–23.05 ms, fastest render through 200 000 rows | no point in this matrix |
| **Bryntum** | scroll figures independent of dataset size, P95 18.4–33.32 ms | construction and memory: 12.3 s to build and 761.66 MB at 800k with 40 columns |
| **AG Grid** | P95 17.4–29.2 ms through 200 000 rows | 800 000 rows, where the median frame moves, most of all with frozen columns |
| **DevExtreme** | render time and heap flat across the size axis | a per-frame cost throughout: P95 26–40 ms in every cell, and 1.5–2.2× DHTMLX's time over the same distance |
| **Kendo** | frame distribution scaling with column count | 20 columns and up; P95 173.69 ms at 40 |

Which column to read depends on the application. A grid that has to appear with a large dataset already
loaded is reading the render column; one that has to stay smooth under continuous scrolling is reading
P95. The full matrix behind both is eight scenarios across five sizes, and the command below produces
it.

---

## Running the suite

Node.js >= 20 (see `.nvmrc`), then:

```bash
npm ci
npm run vendor
npx playwright install chromium
```

Use `npm ci`, not `npm install`. It installs exactly what the committed lockfile says, where
`npm install` re-resolves transitive dependencies on every run and would measure slightly different
libraries with nothing to say so.

The run these figures come from, on one line so it pastes into PowerShell and cmd as well as a POSIX
shell:

```
npm run bench -- --set=article --sizes=10000,50000,100000,200000,800000 --runs=5 --warmup=1 --order=random --cleanup
```

| Flag | Why |
| --- | --- |
| `--set=article` | The eight scenarios the comparison is published on: both cell families at 10, 20 and 40 columns, plus both frozen ones. `--set=full` also measures the hundred-column pair, which answers a different question. |
| `--sizes=…` | All five row counts, so the scaling curves have every point. |
| `--runs=5` | Five measured runs per cell instead of the default three. |
| `--warmup=1` | One unmeasured pass first, to prime caches and the JIT. |
| `--order=random` | Interleaves the grids. The machine warms and throttles over a run this long, and random order spreads that drift across all five instead of handing it to whichever grid the registry lists last. |
| `--cleanup` | Frees each dataset once nothing left in the run reads it. Without it, the 800 000-row datasets alone need about 800 MB. |

Plan for a machine given over to it for hours. Keep the window visible and the screen awake — headless
frames follow a synthetic cadence, and a screensaver mid-run corrupts the FPS column of everything
after it. Anything else competing for the CPU lands in the numbers.

Interrupt a run part-way and it keeps every cell it finished. Re-running the rest adds to the same
archive.

### Commands

| Command | What it does |
| --- | --- |
| `npm run bench` | Runs the matrix in a visible Chromium window, writing one file per cell to `results/history/` as it finishes. `npm run bench -- --help` lists every flag. |
| `npm run report` | Reads that history and writes `results/report.html` and `results/report.md` from one aggregate, so the two can't disagree. |
| `npm run inspect` | Diagnostic views over the same history, as plain text: the full metric set, failure reasons, outliers. The run-to-run spread is in the report and the history files, see [METHODOLOGY.md](METHODOLOGY.md#spread-and-where-to-find-it). |
| `npm run dev` | Dataset server on `127.0.0.1:8081` and the Vite viewer on `localhost:5173`, for watching a grid run a scenario without measuring it. `npm run data-server` and `npm run viewer` start the halves separately. |
| `npm run lint` | ESLint. `npm run lint:fix` applies what it can. |
| `npm test` | `node:test` over `tests/unit/`. Needs no browser and no `vendor/`. |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the last two and never runs the
benchmark. CI machines are shared and virtualized, so `requestAnimationFrame` isn't locked to a real
display and an FPS figure measured there describes a timer. The job installs only the harness's own
dev dependencies, so it stays runnable without vendor credentials.

---

## Scenarios and sizes

A scenario fixes column count, cell complexity and frozen-column count. Dataset size is a runtime
flag, not part of the scenario identity.

| ID | Columns | Cells | Frozen |
| --- | --- | --- | --- |
| `tpl10` | 10 | HTML templates | 0 |
| `tpl20` | 20 | HTML templates | 0 |
| `tpl40` | 40 | HTML templates | 0 |
| `tpl100` | 100 | HTML templates | 0 |
| `pln10` | 10 | plain text | 0 |
| `pln20` | 20 | plain text | 0 |
| `pln40` | 40 | plain text | 0 |
| `pln100` | 100 | plain text | 0 |
| `frz10` | 10 | HTML templates | 3 |
| `frz40` | 40 | HTML templates | 3 |

`--set=article` is the eight that leave out the hundred-column pair.

Every scenario uses the same 10 base fields (id, team, first name, surname, status, score, change,
priority, rating, city) plus numeric `col01…col90` filler to reach the target count. The base fields
carry the rich renderers. Both families call the same HTML builders from
[src/utils/renderers.js](src/utils/renderers.js), so every grid gets identical markup.

Dataset sizes are 10 000, 50 000, 100 000, 200 000 and 800 000 rows. Generation is deterministic and
seeded, so the same (scenario, size) pair always produces byte-identical rows, and two people
measuring the same combination measure the same data. The scroll covers 50 000 px, with position
accumulated per tick, so each grid sets its own pace.

What each axis isolates, what every metric means and which figures are read together:
[METHODOLOGY.md](METHODOLOGY.md) §5 and §7.

---

## Architecture

Five layers, one responsibility each:

- **Adapters** ([src/adapters/](src/adapters/)) — one module per grid, implementing `mapColumns`,
  `create`, `getRenderedRows` and `getScrollContainer`. The only place you touch to add a grid.
- **Registries** ([src/core/registry.js](src/core/registry.js),
  [src/config/scenarios.js](src/config/scenarios.js)) — two lists declaring *what* the suite tests:
  which grids exist with their asset paths, and which scenarios exist.
- **Core** ([src/](src/)) — *how* tests run. `src/core/` holds paths, ports, flags and process
  handling, each declared once. `src/bench/` is the Playwright orchestrator and the in-page
  measurement. `src/data/` generates and serves datasets. `src/report/` reduces the history to numbers
  and renders them.
- **Viewer** ([src/viewer/](src/viewer/)) — `index.html` is the manual exploration UI. `host.html` is
  the minimal page the runner loads in an iframe to measure one grid, one scenario, one dataset.
- **Results** ([results/](results/)) — `latest.json` plus the `history/` archive the report reads.

### Two-process dev model

Port 8081 serves datasets. Port 5173 serves the viewer and the benchmark host. Keeping them separate
is why there are three commands instead of one: the UI can restart without discarding the dataset
cache, and a long benchmark can run against a persistent dataset server.

## Adding a grid

1. Create `src/adapters/<id>.js` and default-export an object satisfying the contract in
   [src/adapters/contract.js](src/adapters/contract.js):
   - `id`, `name`
   - `mapColumns(columns, scenario)` — your grid's column format. Build it with `buildColumns()` from
     [src/adapters/_shared.js](src/adapters/_shared.js), so renderer and pinning decisions stay
     identical to the other adapters'.
   - `create(container, { columns, data, scenario })` — instantiate the grid. May return a Promise.
   - `getRenderedRows(container)` — the data rows currently in the DOM, one element per row. This
     defines the render timing, so it has to deduplicate the copies a grid makes for frozen columns.
     Use `rowElements()` from `_shared.js`.
   - `getScrollContainer(container)` — the scrollable DOM node.

   [src/adapters/index.js](src/adapters/index.js) checks the contract on load, so a missing or
   mis-shaped method fails immediately and by name.
   [src/adapters/dhtmlx.js](src/adapters/dhtmlx.js) is the smallest reference implementation.

2. Register it in [src/core/registry.js](src/core/registry.js) with its JS and CSS assets.

3. Open `http://localhost:5173/?grid=<id>&scenario=tpl10` and check it renders, then run
   `npm run bench -- --grid=<id>`.

## Adding a scenario

Add an entry to [src/config/scenarios.js](src/config/scenarios.js). The viewer and the runner pick it
up automatically. No adapter changes unless the scenario needs a new flag.

---

## Vendor setup

```bash
npm ci && npm run vendor
```

That's the whole setup; nothing is downloaded by hand. All grids are served from the same `vendor/`
directory, so the harness has no CDN variance.

`vendor/` is **not committed**. These are commercial trial builds, and redistributing them isn't ours
to do. Installing them from npm isn't redistribution: every package below is published to a public
registry by its own vendor, anonymously installable, and `npm run vendor` only copies what `npm ci`
already put in `node_modules`.

Versions are pinned exactly in `dependencies`, never with a `^` range. A published number has to name
the build it measured, and a range re-resolves on every install, so two people running this would
quietly measure different libraries. Bumping one is an explicit commit.

| Folder | Grid | Package |
| --- | --- | --- |
| `ag-grid/` | AG Grid Community | `ag-grid-community` |
| `bryntum/` | Bryntum Grid | `@bryntum/grid-trial` |
| `devextreme/` | DevExtreme DataGrid | `devextreme` — built by the vendor's own bundler, see [METHODOLOGY.md](METHODOLOGY.md) §2 |
| `dhtmlx/` | DHTMLX Grid Pro | `@dhx/trial-grid`, from DHTMLX's own registry (see `.npmrc`; anonymously readable, no account or token) |
| `jquery/` | jQuery | `jquery` — shared dependency of Kendo UI and DevExtreme |
| `kendo/` | Kendo UI Grid | `@progress/kendo-ui` for the widgets, `@progress/kendo-theme-default` for the stylesheet |

`npm run vendor` writes `vendor/.versions.json` with the version of every package it laid down, and
the runner copies that into every results file. A result that can't name its versions records `null`
there instead of looking complete, which is what happens if `vendor/` was populated by hand. Grids
whose assets are missing fail to load with a readable error in the viewer; the others keep working.

`npm run vendor --only=<ids>` populates a subset. The manifest is merged instead of overwritten, so a
partial run doesn't erase the versions of folders it didn't touch, and it records which ones were
refreshed. A result from a partial run can't be mistaken for a full one.

---

## License

[MIT](LICENSE)
