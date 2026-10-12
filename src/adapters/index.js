/**
 * Grid id → adapter. Static imports so Vite can rewrite the paths at dev time.
 *
 * Keys must match the ids in src/core/registry.js; a unit test asserts they do.
 */
import agGrid            from './ag-grid.js';
import bryntum           from './bryntum.js';
import devextreme        from './devextreme.js';
import dhtmlx            from './dhtmlx.js';
import kendo             from './kendo.js';
import { assertAdapter } from './contract.js';

export const adapters = {
    'ag-grid':    agGrid,
    'bryntum':    bryntum,
    'devextreme': devextreme,
    'dhtmlx':     dhtmlx,
    'kendo':      kendo,
};

// Checked once, when this module loads — in the page and in the tests alike.
for (const [id, adapter] of Object.entries(adapters)) assertAdapter(adapter, id);

export const adapterFor = (gridId) => adapters[gridId] ?? null;
