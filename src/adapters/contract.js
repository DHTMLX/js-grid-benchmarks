/**
 * What every module in this directory must export, and a check that it does.
 *
 * @typedef {Object} Adapter
 * @property {string} id    Stable id, matching the entry in src/core/registry.js.
 * @property {string} name  Display name.
 * @property {(columns: CanonicalColumn[], scenario: Scenario) => object[]} mapColumns
 *           Canonical columns → the vendor's column format. Built with buildColumns()
 *           from ./_shared.js.
 * @property {(container: HTMLElement, ctx: { columns: CanonicalColumn[], data: object[], scenario: Scenario }) => any|Promise<any>} create
 *           Instantiate the grid inside container. May return a promise.
 * @property {(container: HTMLElement) => HTMLElement[]} getRenderedRows
 *           The data rows currently in the DOM, one element per row, deduplicated across
 *           the sub-tables a grid uses for frozen columns.
 * @property {(container: HTMLElement) => HTMLElement|null} getScrollContainer
 *           The DOM node the scroll benchmark drives. Kendo's is a synthetic scrollbar,
 *           not the node the rows live in.
 *
 * There is no `destroy`: every measurement ends by closing the page.
 */

/**
 * Method name → the number of parameters the contract gives it.
 *
 * Checked against `fn.length`, which counts only the parameters before the first one with a
 * default and excludes a rest parameter. Contract methods therefore declare all of theirs
 * plainly: a default would read as a missing parameter and reject a correct adapter.
 */
const METHODS = {
    mapColumns:         2,
    create:             2,
    getRenderedRows:    1,
    getScrollContainer: 1,
};

/** Throw unless `adapter` implements the contract under the id it is registered as. */
export function assertAdapter(adapter, registeredAs) {
    const where = `adapter "${registeredAs}"`;

    if (!adapter || typeof adapter !== 'object') {
        throw new TypeError(`${where}: default export is not an object`);
    }
    if (adapter.id !== registeredAs) {
        throw new TypeError(`${where}: reports id "${adapter.id}" — the two must match`);
    }
    if (typeof adapter.name !== 'string' || !adapter.name) {
        throw new TypeError(`${where}: no display name`);
    }

    for (const [method, arity] of Object.entries(METHODS)) {
        const fn = adapter[method];
        if (typeof fn !== 'function') {
            throw new TypeError(`${where}: ${method} is ${typeof fn}, not a function`);
        }
        if (fn.length !== arity) {
            throw new TypeError(
                `${where}: ${method} takes ${fn.length} parameters, the contract gives it ${arity}`,
            );
        }
    }

    return adapter;
}
