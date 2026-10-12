/**
 * The report document: markup here, styles in page.css, client-side charts in page.js. The
 * two siblings are inlined at build time so the report stays a single file, but on disk
 * they are an ordinary stylesheet and an ordinary script, linted as such.
 *
 * The page gets its data from one <script type="application/json"> block, so page.js
 * contains no interpolation.
 */
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildHeatmap, buildProvenance } from './sections.js';
import {
    gridLabels as GRID_LABELS,
    reportOrder as GRIDS_ORDER,
} from '../../core/registry.js';

const SUBTITLE = `JS data-grid performance comparison: ${GRIDS_ORDER.map(id => GRID_LABELS[id]).join(', ')}`;

const HERE = path.dirname(fileURLToPath(import.meta.url));

const read = (name) => fs.readFileSync(path.join(HERE, name), 'utf8');

// `<` is escaped so the payload cannot close the script element that carries it.
const embedJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const EMPTY_BODY = `
<div class="pv-card">
  <div class="pv-head">No results yet</div>
  <div class="pv-sub">Nothing has been measured on this machine.</div>
  <div class="pv-warn pv-warn-soft">Run <code>npm run bench</code>, then generate this report again.</div>
</div>`;

export function renderPage(data) {
    const body = data.empty
        ? EMPTY_BODY
        : buildBody(data);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Grid Performance Report</title>
<style>
${read('page.css')}</style>
</head>
<body>
<div class="header">
  <h1>Grid Performance Benchmark</h1>
  <p>${SUBTITLE}</p>
</div>
${body}
</body>
</html>`;
}

function buildBody({ records, matrix, session, gridLabels, interactive, scaling }) {
    const payload = {
        heatmapHtml: buildHeatmap(records, matrix, gridLabels),
        interactive,
        scaling,
    };

    return `${buildProvenance(session, matrix)}
<div id="heatmap"></div>

<div class="section-title">Metric comparison</div>
<div class="controls" id="interactive-controls"></div>
<div class="chart-block">
  <div class="card">
    <div class="legend" id="interactive-legend"></div>
    <div class="chart-host" id="interactive-chart"></div>
    <p class="chart-note" id="interactive-note"></p>
  </div>
</div>

<div class="section-title">Scaling</div>
<div class="controls" id="scaling-controls"></div>
<div class="chart-block scaling-grid-wrap">
  <div class="card">
    <h3 class="card-title">Scaling by row count</h3>
    <div class="legend" id="rows-legend"></div>
    <div class="chart-host" id="rows-chart"></div>
  </div>
  <div class="card">
    <h3 class="card-title">Scaling by column count</h3>
    <div class="legend" id="cols-legend"></div>
    <div class="chart-host" id="cols-chart"></div>
  </div>
</div>

<script id="report-data" type="application/json">${embedJson(payload)}</script>
<script>
${read('page.js')}</script>`;
}
