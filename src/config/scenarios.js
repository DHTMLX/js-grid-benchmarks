/**
 * The grid configurations under test.
 *
 *   tpl* — 10 base columns with HTML template renderers, plus N numeric columns
 *   pln* — the same columns as plain text
 *   frz* — template columns with 3 pinned on the left
 *
 * tpl against pln at one column count isolates the cost of template rendering;
 * tpl against frz isolates the cost of pinning.
 *
 * 60 and 80 columns are deliberately absent: they sit between 40 and 100 on an axis every
 * grid has so far been linear along, and no run ever measured them.
 */
export const scenarios = {
    tpl10:  { name: '10 cols — template',    complexCells: true,  frozenColumns: 0 },
    tpl20:  { name: '20 cols — template',    columnSet: 'mix20',  complexCells: true,  frozenColumns: 0 },
    tpl40:  { name: '40 cols — template',    columnSet: 'mix40',  complexCells: true,  frozenColumns: 0 },
    tpl100: { name: '100 cols — template',   columnSet: 'mix100', complexCells: true,  frozenColumns: 0 },
    pln10:  { name: '10 cols — plain',       complexCells: false, frozenColumns: 0 },
    pln20:  { name: '20 cols — plain',       columnSet: 'mix20',  complexCells: false, frozenColumns: 0 },
    pln40:  { name: '40 cols — plain',       columnSet: 'mix40',  complexCells: false, frozenColumns: 0 },
    pln100: { name: '100 cols — plain',      columnSet: 'mix100', complexCells: false, frozenColumns: 0 },
    frz10:  { name: '10 cols — frozen',      complexCells: true,  frozenColumns: 3 },
    frz40:  { name: '40 cols — frozen',      columnSet: 'mix40',  complexCells: true,  frozenColumns: 3 },
};

/**
 * Named subsets, chosen by `--set`.
 *
 *   smoke   — is the harness working: one scenario from each family, both column extremes
 *   full    — everything
 *   article — what the published comparison is measured on
 *
 * `article` runs both cell families at 10, 20 and 40 columns, so the column-scaling curve has
 * three points rather than two, plus both frozen scenarios. The hundred-column pair is measured
 * by `full` but not published: it answers a different question than the article asks.
 */
export const scenarioSets = {
    smoke:   ['pln10', 'tpl10', 'tpl40', 'frz10'],
    full:    Object.keys(scenarios),
    article: ['tpl10', 'tpl20', 'tpl40', 'pln10', 'pln20', 'pln40', 'frz10', 'frz40'],
};

export const scenarioList = Object.entries(scenarios).map(([id, scenario]) => ({ id, ...scenario }));
