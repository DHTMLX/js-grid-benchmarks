/**
 * The two blocks built as HTML on the Node side instead of drawn by the page: the
 * provenance card and the FPS heatmap. Both are tables of values known before the page opens.
 */
import { vendorOf } from '../aggregate.js';
import {
    grids,
    gridLabels as GRID_LABELS,
    reportOrder as GRIDS_ORDER,
} from '../../core/registry.js';

const JQUERY_DEPENDENTS = grids
    .filter(grid => grid.assets.scripts?.some(src => src.includes('/jquery/')))
    .map(grid => grid.name);

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function buildProvenance(session, matrix) {
    const env = session?.env ?? null;

    const rows = GRIDS_ORDER.map(grid => {
        const v = vendorOf(session, grid);
        return `<tr>
      <td class="pv-name">${esc(GRID_LABELS[grid])}</td>
      <td class="pv-pkg">${v?.package ? esc(v.package) : '—'}</td>
      <td class="pv-ver">${v ? esc(v.version) : '<span class="pv-missing">not recorded</span>'}</td>
    </tr>`;
    }).join('');

    // jQuery has no column anywhere else in the report, but the grids that run on it
    // were measured against whichever copy the page loaded.
    const jq = vendorOf(session, 'jquery');
    const jqRow = jq ? `<tr class="pv-support">
      <td class="pv-name">jQuery</td>
      <td class="pv-pkg">${esc(jq.package ?? 'jquery')}</td>
      <td class="pv-ver">${esc(jq.version)} <span class="pv-note">— loaded by ${esc(JQUERY_DEPENDENTS.join(' and '))}</span></td>
    </tr>` : '';

    const facts = env ? [
        ['Machine', `${esc(env.machine ?? 'unknown')} — ${esc(env.cpu ?? '?')}, ${env.cores ?? '?'} cores, ${env.ramGb ?? '?'} GB`],
        ['Browser', `${esc(env.browser ?? '?')}${env.headless ? ' — headless' : ''}`],
        ['Display', env.refreshHz ? `${env.refreshHz} Hz measured` : 'refresh rate could not be measured'],
        ['Viewport', env.viewport ? `${env.viewport.width}×${env.viewport.height}` : '—'],
        ['Runs per point', `${env.runs ?? '?'}${env.warmup ? ` (+${env.warmup} warmup, discarded)` : ''}`],
    ] : [];

    const factRows = facts
        .map(([k, v]) => `<tr><td class="pv-k">${k}</td><td class="pv-v">${v}</td></tr>`)
        .join('');

    // Two different failures, and they must not read the same. No environment block at
    // all means the run predates this recording; a recorded run that failed validation
    // means the FPS numbers on this page are known to be wrong.
    let banner = '';
    if (!env) {
        banner = `<div class="pv-warn pv-warn-soft">This run recorded no environment. Re-run
      <code>npm run bench</code> to capture the machine and validate the FPS column.</div>`;
    } else if (env.fps && !env.fps.trustworthy) {
        banner = `<div class="pv-warn">FPS not validated — ${esc(env.fps.warning)}</div>`;
    } else if (env.fps?.source === 'headless') {
        banner = `<div class="pv-warn pv-warn-soft">Measured in headless Chromium, where frames
      follow a synthetic cadence rather than this machine's display. The grids stay
      comparable with each other; these FPS figures are not comparable with a run on a
      real display.</div>`;
    }

    const missing = GRIDS_ORDER.filter(g => !vendorOf(session, g));
    const versionWarn = missing.length ? `<div class="pv-warn pv-warn-soft">No version recorded for
      ${missing.map(g => esc(GRID_LABELS[g])).join(', ')} — run <code>npm run vendor</code> so the
      next run can name what it measured.</div>` : '';

    return `
<div class="pv-card">
  <div class="pv-head">What produced these numbers</div>
  <div class="pv-sub">Run of ${esc(matrix.latestLabel || 'unknown date')}</div>
  <div class="pv-cols">
    <table class="pv-table">
      <thead><tr><th>Grid</th><th>npm package</th><th>Version measured</th></tr></thead>
      <tbody>${rows}${jqRow}</tbody>
    </table>
    <table class="pv-table pv-facts"><tbody>${factRows || '<tr><td class="pv-k">Environment</td><td class="pv-v">not recorded</td></tr>'}</tbody></table>
  </div>
  ${banner}${versionWarn}
</div>`;
}

function fpsColor(fps) {
    if (fps == null) return { bg: '#e2e8f0', text: '#94a3b8', label: '✗' };
    if (fps >= 55) return { bg: '#16a34a', text: '#fff',     label: fps };
    if (fps >= 40) return { bg: '#65a30d', text: '#fff',     label: fps };
    if (fps >= 25) return { bg: '#ca8a04', text: '#fff',     label: fps };
    if (fps >= 10) return { bg: '#dc2626', text: '#fff',     label: fps };
    return              { bg: '#7f1d1d', text: '#fca5a5',   label: fps };
}

export function buildHeatmap(records, matrix, gridLabels) {
    const HMAP_SIZES = matrix.sizes;
    const HMAP_SCENS = matrix.scenarios;
    const HMAP_ROW_LABELS = HMAP_SIZES.map(sz => sz >= 1000 ? (sz / 1000) + 'k' : String(sz));

    // Only the most recent session counts: a combination that was not measured this
    // time reads ✗ rather than falling back to an older number. Within the session
    // the last record wins, so a repeat overrides an earlier attempt and a failure
    // (fps: null) overrides an earlier success — see loadHistory().
    const latestFps = {};
    for (const r of records) {
        if (r.session !== matrix.latestSession) continue;
        latestFps[`${r.grid}|${r.scenario}|${r.size}`] = r.fps;
    }

    // Layout lives in the stylesheet (.hm-*); only the data-driven cell colors are
    // inline. The panel width depends on how many scenarios there are, so it is fed
    // to the auto-fit grid as a custom property rather than a fixed media query.
    const panelMinPx = 40 + HMAP_SCENS.length * 38;

    const tables = GRIDS_ORDER.map(grid => {
        const rows = HMAP_SIZES.map((sz, ri) => {
            const cells = HMAP_SCENS.map(sc => {
                const c = fpsColor(latestFps[`${grid}|${sc}|${sz}`]);
                return `<td class="hm-cell" style="background:${c.bg};color:${c.text}">${c.label}</td>`;
            }).join('');
            return `<tr><th class="hm-rowlabel">${HMAP_ROW_LABELS[ri]}</th>${cells}</tr>`;
        }).join('');

        const headerCells = HMAP_SCENS.map(sc =>
            `<th class="hm-colhead">${esc(sc)}</th>`,
        ).join('');

        return `
<div class="hm-panel">
  <div class="hm-title">${esc(gridLabels[grid])}</div>
  <table class="hm-table">
    <thead><tr><th class="hm-corner"></th>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
    }).join('');

    return `
<div class="hm-card">
  <div class="hm-head">FPS heatmap: row count × scenario</div>
  <div class="hm-sub">Scroll FPS measured in the run of ${esc(matrix.latestLabel || 'unknown date')}</div>
  <div class="hm-grid" style="--hm-panel-min:${panelMinPx}px">${tables}</div>
  <div class="hm-legend">
    <span>Legend:</span>
    <span class="hm-chip" style="background:#16a34a;color:#fff">≥55 FPS</span>
    <span class="hm-chip" style="background:#65a30d;color:#fff">40–54</span>
    <span class="hm-chip" style="background:#ca8a04;color:#fff">25–39</span>
    <span class="hm-chip" style="background:#dc2626;color:#fff">10–24</span>
    <span class="hm-chip" style="background:#e2e8f0;color:#94a3b8">✗ no data / failed</span>
  </div>
</div>`;
}
