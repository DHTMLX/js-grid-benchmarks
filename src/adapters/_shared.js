/**
 * The column mapping every adapter performs, in one place. A grid describes itself with:
 *
 *   base(col)      the vendor's column object — field name, header text, width
 *   renderer(html) what to add so the cell content comes from `html(row)`
 *   pin            what to add to pin a column left; omitted by grids that pin by count in
 *                  create() rather than per column
 */
import { statusHtml, ratingHtml, teamComplexHtml, changeHtml, NUM_TEMPLATE_FNS } from '../utils/renderers.js';

/** The HTML producer for one column, or null when the column is plain text. */
function cellHtml(col) {
    if (col.templateSlot !== undefined) return row => NUM_TEMPLATE_FNS[col.templateSlot](row[col.id]);
    if (col.type === 'status')          return row => statusHtml(row.status);
    if (col.id.startsWith('team'))      return row => teamComplexHtml(row[col.id]);
    if (col.id.startsWith('rating'))    return row => ratingHtml(row[col.id]);
    if (col.id.startsWith('change'))    return row => changeHtml(row[col.id]);
    return null;
}

/**
 * The rendered data rows under `container`, one element per row. Deduplicated by index
 * attribute: a grid with frozen columns renders each row once per sub-table.
 */
export function rowElements(container, selector, indexAttribute) {
    const rowsByIndex = new Map();
    for (const element of container.querySelectorAll(selector)) {
        const index = element.getAttribute(indexAttribute);
        if (index === null) continue;
        if (!rowsByIndex.has(index)) rowsByIndex.set(index, element);
    }
    return [...rowsByIndex.values()];
}

export function buildColumns(columns, scenario, spec) {
    return columns.map((col, index) => {
        const mapped = spec.base(col);

        if (scenario.complexCells) {
            const html = cellHtml(col);
            if (html) Object.assign(mapped, spec.renderer(html));
        }

        if (spec.pin && index < scenario.frozenColumns) {
            Object.assign(mapped, spec.pin);
        }

        return mapped;
    });
}
