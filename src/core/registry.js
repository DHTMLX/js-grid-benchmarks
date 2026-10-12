/**
 * The grids under test — one declaration, read by the runner, the viewer and the report.
 *
 * Kept free of Node built-ins so the browser side can import it directly.
 *
 * Expected vendor layout (flat, one folder per grid id):
 *
 *   vendor/
 *     jquery/           — shared jQuery
 *     dhtmlx/           — grid.js, grid.css
 *     ag-grid/          — ag-grid-community.min.js, ag-grid.css, ag-theme-alpine.css
 *     kendo/            — kendo.all.min.js, default-main.css
 *     bryntum/          — grid.umd.js, grid.css, svalbard-light.css, fontawesome/
 *     devextreme/       — dx.all.js, dx.light.css
 *
 * @typedef {Object} GridConfig
 * @property {string} id            Stable id, matches the adapter and CLI --grid=.
 * @property {string} name          Display name.
 * @property {string} color         Series colour in the report.
 * @property {{ scripts: string[], styles: string[] }} assets  Loaded in order.
 */

// Okabe-Ito: five hues of comparable chroma, distinguishable under the common forms of
// colour blindness. Assigned by alphabetical id.
const COLORS = {
    'ag-grid':    '#CC79A7',
    'bryntum':    '#E69F00',
    'devextreme': '#009E73',
    'dhtmlx':     '#0288D1',
    'kendo':      '#D55E00',
};

/** Declaration order is the order the runner measures in. Reports use `reportOrder`. */
export const grids = [
    {
        id:    'dhtmlx',
        name:  'DHTMLX Grid',
        color: COLORS.dhtmlx,
        assets: {
            scripts: ['/vendor/dhtmlx/grid.js'],
            styles:  ['/vendor/dhtmlx/grid.css'],
        },
    },
    {
        id:    'bryntum',
        name:  'Bryntum Grid',
        color: COLORS.bryntum,
        assets: {
            scripts: ['/vendor/bryntum/grid.umd.js'],
            styles: [
                '/vendor/bryntum/fontawesome/css/fontawesome.css',
                '/vendor/bryntum/fontawesome/css/solid.css',
                '/vendor/bryntum/grid.css',
                '/vendor/bryntum/svalbard-light.css',
            ],
        },
    },
    {
        id:    'ag-grid',
        name:  'AG Grid',
        color: COLORS['ag-grid'],
        assets: {
            scripts: ['/vendor/ag-grid/ag-grid-community.min.js'],
            styles:  [
                '/vendor/ag-grid/ag-grid.css',
                '/vendor/ag-grid/ag-theme-alpine.css',
            ],
        },
    },
    {
        id:    'kendo',
        name:  'Kendo Grid',
        color: COLORS.kendo,
        assets: {
            scripts: [
                '/vendor/jquery/jquery.min.js',
                '/vendor/kendo/kendo.all.min.js',
            ],
            styles: ['/vendor/kendo/default-main.css'],
        },
    },
    {
        id:    'devextreme',
        name:  'DevExtreme DataGrid',
        color: COLORS.devextreme,
        assets: {
            scripts: [
                '/vendor/jquery/jquery.min.js',
                '/vendor/devextreme/dx.all.js',
            ],
            styles: ['/vendor/devextreme/dx.light.css'],
        },
    },
];

export const gridMap = Object.fromEntries(grids.map(grid => [grid.id, grid]));

export const gridIds = grids.map(grid => grid.id);

/** Alphabetical. The publisher of this suite is one of the five, so charts order by rule. */
export const reportOrder = [...gridIds].sort();

export const gridLabels = Object.fromEntries(grids.map(grid => [grid.id, grid.name]));
export const gridColors = Object.fromEntries(grids.map(grid => [grid.id, grid.color]));
