/**
 * Canonical column definitions shared across all adapters.
 * Each adapter maps these to its own column format in its mapColumns() function.
 *
 * @typedef {Object} CanonicalColumn
 * @property {string} id          Column id (also the field name in row data).
 * @property {string} label       Header label.
 * @property {number} width       Column width in px.
 * @property {string} [type]      Optional semantic type: 'number', 'status', etc.
 * @property {number} [templateSlot] Numeric template renderer index (see renderers.js).
 *
 * @typedef {Object} Scenario
 * @property {string} name
 * @property {boolean} complexCells   Use rich HTML cell templates.
 * @property {number}  frozenColumns  Number of pinned columns on the left.
 * @property {string}  [columnSet]    Optional preset id: 'mix20', 'mix40' or 'mix100'.
 *
 * What an adapter must implement is in src/adapters/contract.js.
 */
/** The nine fields every scenario carries. `columns10WithStatus` is these plus status. */
export const baseColumns = [
    { id: 'id',        label: 'Id',         width: 100 },
    { id: 'team',      label: 'Team',        width: 120 },
    { id: 'firstName', label: 'First name',  width: 130 },
    { id: 'surname',   label: 'Surname',     width: 130 },
    { id: 'score',     label: 'Score',       width: 120 },
    { id: 'change',    label: 'Change',      width: 100 },
    { id: 'priority',  label: 'Priority',    width: 80,  type: 'number' },
    { id: 'rating',    label: 'Rating',      width: 90,  type: 'number' },
    { id: 'city',      label: 'City',        width: 120 },
];

export const statusColumn = {
    id: 'status',
    label: 'Status',
    width: 90,
    type: 'status',
};

export const columns10WithStatus = [
    ...baseColumns.slice(0, 4),
    statusColumn,
    ...baseColumns.slice(4),
];

/** N numeric columns. Ids are always col01–col90, matching the generator's output. */
const numericColumns = (count, labelFrom) => Array.from({ length: count }, (_, i) => ({
    id:    `col${String(i + 1).padStart(2, '0')}`,
    label: `Col ${labelFrom + i}`,
    width: 100,
    type:  'number',
    templateSlot: i % 3,
}));

// Ten base columns plus numeric ones, labelled so the last label is the scenario's total.
export const columnsMix20  = [...columns10WithStatus, ...numericColumns(10, 11)];
export const columnsMix40  = [...columns10WithStatus, ...numericColumns(30, 11)];
export const columnsMix100 = [...columns10WithStatus, ...numericColumns(90, 11)];

const COLUMN_SETS = {
    base:   columns10WithStatus,
    mix20:  columnsMix20,
    mix40:  columnsMix40,
    mix100: columnsMix100,
};

/**
 * Which set of columns a scenario reads — the name of what it is measured against.
 *
 * A scenario without `columnSet` is a ten-column one. The id also keys the dataset on disk:
 * scenarios sharing a set read byte-identical rows, so they share one file.
 */
export const columnSetOf = (scenario) => scenario.columnSet ?? 'base';

export function getColumns(scenario) {
    const id        = columnSetOf(scenario);
    const columnSet = COLUMN_SETS[id];
    if (!columnSet) {
        throw new Error(
            `Unknown columnSet "${id}" — one of: ${Object.keys(COLUMN_SETS).join(', ')}`,
        );
    }
    return columnSet;
}
