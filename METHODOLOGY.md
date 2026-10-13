# Methodology

How this suite measures, and why each choice was made. Read it alongside the figures in
[README.md](README.md).

DHTMLX publishes this suite, and DHTMLX Grid is one of the five grids in it. So we write the method out
here, and every figure traces back to the conditions that produced it:

- §2 lists everything we configure beyond a vendor default.
- Datasets are deterministic and seeded.
- Every results file records the exact build of every grid and the machine it ran on.
- The harness that did the measuring is the code in this repository.

---

## 1. Principles

**Out-of-the-box behavior is the subject.** What matters is how a component behaves on its vendor's
defaults. We don't tune competitors' grids, and we don't tune ours. We configure something only when
comparison is impossible without it, and §2 lists every such setting. If a vendor ships a slow
default, that default is what shows up in the figures.

**The configuration is a closed list.** Everything set beyond a vendor default is in §2. If a setting
isn't there, we didn't apply it.

**Where a vendor offers a choice of mechanism, we use the documented one.** When a vendor's API
requires work on every row, that cost is part of how the component behaves, and it shows up in the
figures. When a vendor offers two ways to do the same thing, we take the one its own documentation
recommends.

Two DevExtreme cases show the difference:

- *Row height.* DevExtreme has no row-height option. It offers CSS or a per-row callback. The callback
  costs a framework call and an inline style write on every rendered row, inside the scroll path, so we
  use CSS. That's also what DevExpress recommends.
- *Cell templates.* DevExtreme's template API is imperative and returns nothing, where the other four
  accept a returned HTML string. There's no second mechanism, so that cost shows up in the figures.

**The stimulus is identical.** Every grid gets the same data, the same 40 px row height, the same
viewport and the same programmatic scroll. What each grid does with that load is what the figures
describe.

**No grid is visually privileged in the report.** A neutral palette of equally saturated colors, order
taken from configuration, no emphasis flag, no grid-specific branch in the report generator.

**Every number carries its conditions.** Each results file records:

- the package and exact version of every grid;
- the machine — CPU, cores, RAM, OS;
- the Chromium version and the viewport;
- the measured display refresh rate;
- run count, warmup count and scroll distance;
- the cell order used.

---

## 2. Configuration applied to each grid

The closed list.

| Setting | Applied to | Why |
| --- | --- | --- |
| Row height 40 px | all five | With a shared row height, pixels convert to rows and the scroll is the same amount of work for every grid. AG Grid, Bryntum and DHTMLX take it as an option. Kendo and DevExtreme have no such option and take it from CSS, from the same constant. |
| Cell HTML mode | all five | The `tpl*` scenarios need markup inside cells. Applied per scenario family: enabled for `tpl*`, left at the vendor default for `pln*`, so the plain family runs each grid's own text path. See §3. |
| Row virtualization | Kendo, DevExtreme | Both vendors document it as required for large datasets, and neither grid handles 100 000+ rows without it. The vendor links are in the adapter source. |
| `pageSize` = 3 × visible rows + 1 | Kendo | Kendo's virtual scrolling needs a page of at least three times the visible rows, and doesn't virtualize below that. The value is computed from the measured viewport, so the page size matches the viewport the grid is given. |
| `columnRenderingMode: 'virtual'`, `columnAutoWidth: false` | DevExtreme | Both from the same vendor large-dataset guide. Column virtualization therefore differs between the five; §7 covers what that means for the column axis. |
| `fixedRowHeight: true` | Bryntum | Every grid runs fixed 40 px rows, so the flag matches the actual layout. It's the equivalent of the row-height option the other grids take. |
| `theme: 'legacy'` + `ag-theme-alpine` | AG Grid | The adapter renders into `.ag-theme-alpine`, which needs the pre-Theming-API stylesheets. |

We configure nothing else. Sorting, filtering, resizing, selection, editing, grouping, animation and
hover behavior all run at each library's own default. §7 covers what that means for the comparison.

### The DevExtreme bundle

DevExtreme publishes modules to npm but not the single-file `dx.all.js` the viewer loads with a
`<script>` tag; that file ships only in the manual download. It does ship the tooling that builds it —
`bin/bundler.js`, its own webpack config, and `bundles/dx.custom.config.js`, the widget list `dx.all.js`
is built from. `npm run vendor` runs that bundler against that config unmodified, so
`vendor/devextreme/dx.all.js` holds the same widget set as the downloadable file and reports the pinned
version at runtime.

That is the full widget set, which is what a `<script src="dx.all.js">` page gets. A DataGrid-only
build came out within run-to-run noise of it, since script parsing finishes before the render clock
starts at mark C.

---

## 3. Cell rendering, and the template-vs-plain comparison

There are two families of scenarios. `tpl*` puts real HTML in cells — status pills, star ratings,
progress bars, colored badges. `pln*` renders the same fields as plain text. Comparing them at equal
column count isolates the cost of template rendering.

Both families call the same HTML builders from [src/utils/renderers.js](src/utils/renderers.js), so
every grid gets identical markup.

The comparison also needs each grid's escaping mode to follow the scenario family, and it does. DHTMLX
takes `htmlEnable`, Kendo takes `columns[].encoded` and Bryntum takes `columns[].htmlEncode` from the
scenario's cell complexity. AG Grid and DevExtreme attach a cell renderer only for `tpl*`. So the plain
family runs every grid on its own plain-text path, which is also its default.

---

## 4. Timeline of one measurement

Every metric boundary is one of these marks.

```
  ├─ page navigation
  │
  ├─ A  inject the grid's script and stylesheet assets, await load
  ├─ B  fetch the dataset, JSON.parse
  │
  ├─ C  ── t0 ─────────────────  adapter.create(container, {columns, data, scenario})
  ├─ D  first row present in the DOM
  ├─ E  viewport filled with the expected row count      ← end of the render measurement
  │
  ├─ F  settle window, 1000 ms
  ├─ G  ── scroll starts ──────  frame counter on
  ├─ H  scroll reaches the target distance
  ├─ I  drain window, 500 ms: frames still landing after H
  └─ J  ── scroll ends ───────── frame counter off
```

**A and B happen before any clock starts.** Library download, library parse, dataset `fetch` and
dataset `JSON.parse` all sit outside the render figure, for all five grids.

**C → E is the render measurement**, and what's on screen defines its end. Each vendor's notion of
"ready" fires at a different moment:

- AG Grid — at initialization, before rows are painted.
- DevExtreme — after content render.
- Bryntum, Kendo, DHTMLX — no completion signal at all.

A metric built on those events would measure a different lifecycle point per grid.

So the harness counts rows instead. On each frame after `t0` it asks the adapter how many rows are in
the DOM, and stops when that count reaches the expected number and holds for one more frame. If the
count never gets there within the timeout, the cell records an error and no figure.

**F, the settle window, is 1000 ms for all five.** A grid still finishing work off the render path
would otherwise be measured mid-task.

**I, the drain window, is 500 ms**, and its frames are reported separately from the scroll figures.
Several grids defer row rendering out of the scroll handler, so the tick that reaches the target
distance queues work that lands after it. Keeping that window separate shows how much each grid defers.

The same shape, from the harness side:

```
matrix.js
  ─▶ starts the dataset server and the viewer, once for the whole run
  ─▶ for each size, for each scenario:
       ─▶ runner.js, for each grid:
            ─▶ a fresh browser context, then one page per run
            ─▶ opens host.html?grid=…&scenario=…&size=…&gate=1 in Chromium
            ─▶ host.js loads the adapter, fetches the dataset, stops at the gate   ← A, B
            ─▶ runner.js takes the CDP baseline and opens the gate
            ─▶ adapter.create(...), then measure.js scrolls and counts frames      ← C … J
            ─▶ window.__benchmarkResult is read back, counters read again
       ─▶ writes results/history/<timestamp>_<size>.json for that cell
```

---

## 5. Metrics

### Headline figures

| Metric | Boundary | Direction |
| --- | --- | --- |
| `fps` | G → J. `frameCount / (sum of inter-frame deltas / 1000)` from a `requestAnimationFrame` loop | higher is better |
| `initialRenderMs` | C → E | lower is better |
| `p95FrameMs` | G → J, over the pooled frame series | lower is better |
| `jumpMs` | programmatic jump to 90 % of the scrollable range → viewport caught up | lower is better |
| `jsHeapPageMB` | absolute `JSHeapUsedSize` after the run: library, dataset and grid | lower is better |

On a 60 Hz display FPS saturates. Every grid that keeps pace with the display reports 60, and what
separates those grids shows up in the frame-time percentiles.

### Figures read together with the headline ones

| Metric | Boundary | How to read it |
| --- | --- | --- |
| `jsHeapGridMB` | the same heap counted from the moment before the grid is built, so the library and dataset are already in it | the grid's own share of the page total |
| `maxFrameMs` | worst single frame, G → J | one frame out of thousands; p95 says how often a frame is slow, this says how slow the extreme got |
| `scrollDurationMs` | wall-clock G → J | how long the grid needed for the distance |

Scroll position accumulates per tick, so each grid sets its own pace and `scrollDurationMs` reflects
how long it took. Read it with FPS. Under load a grid can lengthen its frames, lengthen the scroll, or
both, and each of those shows up in a different one of the two figures.

### Two memory boundaries

The two boundaries answer different questions, and a grid's position can differ between them.

- `jsHeapPageMB` — what the component costs a page: library, dataset and grid together.
- `jsHeapGridMB` — how much of that total is the grid, rather than the bundle it arrived in.

Both are absolute readings of `JSHeapUsedSize` at their boundary. A baseline taken before page
navigation lives in a different renderer process, so a difference measured from there would include the
process change too. Each reading follows a forced garbage collection, so the figures describe what's
still held.

The published data shows the boundary sitting where it's described. `jsHeapPageMB − jsHeapGridMB` is
the library plus the dataset. Move from 10 columns to 40 and that difference grows by 1.14–1.15 MB at
10 000 rows, and by 11.44–11.46 MB at 100 000 rows — the same for all five grids. So the dataset part
is common to all of them, and what differs between vendors in that figure is the library.

### Also recorded

- Frame stats: `medianFrameMs`, `p99FrameMs`, `avgFrameMs`.
- Render marks: `timeToFirstRowMs` (C → D) and `vendorReadyMs`, which records what the vendor's own
  ready signal would have reported, for comparison against C → E.
- Drain window: `tailFrames`, `tailMaxFrameMs`.
- CDP counters: `layoutCountDelta`, `recalcStyleCountDelta`, `scriptDurationMs`, `taskDurationMs`.

The counters are diagnostic. They help explain where a grid spends time, and they don't compare as
headline figures. `recalcStyleCountDelta` is dominated by each theme's selector count (§7), and in this
data layout counts don't track frame time.

### Invariants recorded before measurement

The harness checks and records four things: the rendered row count against the expected visible rows,
the actual row height within 2 px of 40, the pixels-per-row ratio of the scroll node being driven, and
the viewport's row capacity. A failed check records an error and no figure for that cell.

Without them, a grid whose virtualization didn't engage, whose container collapsed, or which rendered a
different number of rows could report a clean 60 FPS.

---

## 6. Statistics

| Aspect | Rule |
| --- | --- |
| Default repetitions | `--runs=3 --warmup=1` |
| For published figures | `--runs=5` |
| `n = 1` | refused unless `--allowSingleRun` is passed explicitly |
| Published central value | the median across runs |
| Percentiles | linearly interpolated, over the pooled frame series from all runs |
| Spread | mean, standard deviation, min and max across runs, stored for every figure; the report prints the standard deviation beside it. See [below](#spread-and-where-to-find-it) |
| Warmup | a full unmeasured pass before measurement, so the first grid measured isn't the only cold one |
| Order | randomizable with `--order=random`; the order used is recorded |
| Isolation | a fresh browser context per grid, forced GC before measurement |
| Aggregation | runs grouped by grid × scenario × size × session; the HTML and markdown renderings come from one aggregate |

A percentile describes a distribution, so the frames from every run form one series before p95 and p99
come off it. Interpolation keeps the two distinct at the frame counts a single scroll produces.

Isolation and order matter over a long matrix. One shared browser context would carry JIT state and
heap fragmentation from the first grid into the fifth. A fixed order would map machine warm-up and
thermal drift onto grid identity.

### Spread, and where to find it

Every figure in a results file carries the spread it came from. Each metric of a cell is stored as an
object with these fields:

| Field | What it holds |
| --- | --- |
| `value` | the published figure: the median across runs, or for a frame-time figure the value over the pooled series |
| `mean` | the mean across runs |
| `stddev` | the standard deviation across runs. It divides by n, not n−1: these are all the runs there are, not a sample drawn from more of them |
| `min`, `max` | the lowest and the highest run |
| `pooled` | `true` on the figures that come from the pooled frame series: `fps`, `avgFrameMs`, `medianFrameMs`, `p95FrameMs`, `p99FrameMs`, `maxFrameMs` |

For a pooled figure, `value` and the spread come from different series. `value` is computed over every
frame of every run together. `mean`, `stddev`, `min` and `max` come from the same figure computed for
each run on that run's frames alone. So `min` and `max` of `p95FrameMs` are the lowest and the highest
per-run P95, and `value` doesn't have to equal their median. A per-run P95 rests on one scroll's
frames, so it moves more from run to run than the pooled figure does.

Where each part shows up:

| Where | What it shows |
| --- | --- |
| `results/report.md` | `value ±stddev` beside every figure. The `±` is left out when the runs agree exactly |
| `results/report.html` | a whisker of ±1 standard deviation on every bar, the standard deviation in the tooltip of the value label, and the run count under the chart |
| `results/history/<timestamp>_<size>.json` | everything: `value`, `mean`, `stddev`, `min` and `max` for every metric under `summaries[]`, and each run as measured, every frame time included, under `summaries[].raw` |
| `npm run inspect` | the published `value` only, no spread |

`min` and `max` are in the history files only. One file holds one scenario at one size, for every grid.

### Refresh-rate validation

`requestAnimationFrame` can't outrun the display. If a measured FPS lands well above the machine's own
refresh rate, rAF isn't vsync-locked — remote desktop, a VM, a virtual display — and that run's FPS
figures don't describe the machine.

The harness measures the real rAF cadence on a blank page before the matrix starts and stores the
verdict in the results file. The report prints it beside the charts, and a run that couldn't be
validated is marked as such.

Headless runs carry the same mark. Headless Chromium paints on a synthetic cadence, so its FPS
describes a timer. That's useful for checking configuration, and not for published figures.

---

## 7. Scenarios and datasets

A scenario fixes column count, cell complexity and frozen-column count. Dataset size is a runtime flag.

| Axis | Values |
| --- | --- |
| Column count | 10, 20, 40, 100 |
| Cell complexity | `tpl` — real HTML in cells · `pln` — plain text |
| Frozen columns | 0, or 3 for the `frz` family |
| Dataset size | 10 000 · 50 000 · 100 000 · 200 000 · 800 000 |

Ten scenarios: `tpl10`, `tpl20`, `tpl40`, `tpl100`, `pln10`, `pln20`, `pln40`, `pln100`, `frz10`,
`frz40`. The published comparison runs the eight that leave out the hundred-column pair, which answers
a different question than the comparison asks.

Every scenario uses the same 10 base fields plus numeric filler to reach the target count. Datasets are
deterministic and seeded: the same (scenario, size) pair always produces byte-identical rows, so two
people measuring the same combination measure the same data.

**Intended comparisons.** `tplN` against `plnN` at equal column count isolates cell rendering cost.
`tplN` against `frzN` isolates column pinning. The column-scaling curve shows what it costs to have N
columns configured while scrolling vertically; the suite never scrolls horizontally.

### What is not equalized between grids

**Feature defaults.** They differ. Some grids attach sort handlers to every header by default and
others don't, so the grids aren't doing identical amounts of work. Each results file records the
configuration its grid ran with.

**Column virtualization.** We set it for DevExtreme, from an explicit vendor-documented flag. AG Grid
has it on by default. For Kendo, DHTMLX and Bryntum we don't configure it, so each runs its own
default. The five may therefore be doing different amounts of work per column, which is why the axis is
described as the cost of having N columns configured, and not as horizontal scrolling performance.

**Themes.** Each grid loads its own stylesheet, and these differ by an order of magnitude in selector
count. Selector-matching cost lands in the style-recalculation counters, which is one reason those stay
in the diagnostic set.

---

## 8. What is not measured, and why

### Out of scope by design

**Deep scroll as continuous motion.** 50 000 px at 40 px rows is 1250 rows, at every dataset size.
Covering 800 000 rows at a credible pace takes days per grid. `jumpMs` answers the same questions in
milliseconds — whether virtualization holds at a high index, whether scrollbar remapping is correct,
whether the grid can render a viewport that far in without walking the dataset again — and it's a
headline figure.

**Equalized vendor defaults and themes.** Default behavior is what an application gets, so it's the
subject of the measurement. A neutral stylesheet shared by all five would be a configuration none of
these grids ships. §7 describes what the choice costs.

**Cross-machine comparison.** Machines differ in display, thermal behavior and background load, so an
average across them describes no machine in particular. Every figure records its machine, and the
report groups by it.

**DOM, GPU and process memory.** `JSHeapUsedSize` can be attributed to the grid at a boundary the
harness controls. The others can't be separated from the browser's own allocation, so the suite reports
the JS heap at both boundaries and leaves the rest unmeasured.

### Open until the mechanism is settled for all five

Each of these needs one mechanism chosen per vendor before the numbers would compare like with like.

**Sort and filter.** Each grid offers several routes: a header click, a store operation, a data-source
call, a custom comparator. The defaults differ in whether a handler is attached at all. One grid
re-renders the viewport while another rebuilds its store. The route chosen moves the result more than
the grids differ from each other, so that choice would decide the outcome.

**Live row updates.** The same mechanism question, plus the update rate. A figure at 1000 updates per
second and one at 50 describe different workloads, and none of the vendors defines the rate.

**Horizontal scroll.** Column virtualization is neither equal nor equally configurable across the five,
as §7 sets out, so a horizontal-scroll figure would largely reflect that difference in
configurability.

**Selection, grouping, tree data, editing, keyboard navigation, accessibility.** These differ in
semantics between vendors. Grouping is a store operation in one grid and a view transform in another,
so there's no single stimulus to apply to all five.

**Bundle size and parse cost.** We'd measure both as A → C on the timeline in §4 and report them under
that name. They stay out of the render and scroll figures, which start at mark C.

---

## 9. Pinned builds and trial expiry

Four of the five grids are commercial trial builds and versions are pinned exactly, so the pins age
into expiry: reproducibility holds for bytes, not for runnability months later.

An expired trial is caught before it becomes a figure. The harness checks the page for expiry and
license text and records a distinct status. At least one of these grids inserts a license banner into
the DOM without throwing, and such a run would otherwise be measured as a normal one.
