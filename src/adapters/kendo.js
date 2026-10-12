import { ROW_HEIGHT }   from '../core/measurement.js';
import { buildColumns, rowElements } from './_shared.js';

export default {
    id:   'kendo',
    name: 'Kendo Grid',

    mapColumns(columns, scenario) {
        // Kendo escapes cell values by default. Off only where the templates emit markup,
        // so the plain scenarios stay plain here as they are for every other grid.
        const encoded = !scenario.complexCells;

        return buildColumns(columns, scenario, {
            base:     col  => ({ field: col.id, title: col.label, width: col.width, encoded }),
            renderer: html => ({ template: row => html(row) }),
            pin:      { locked: true },
        });
    },

    create(container, { columns, data, scenario }) {
        container.innerHTML = '<div id="kendo-host"></div>';
        const host = container.querySelector('#kendo-host');

        // Virtual scrolling needs a pageSize of at least 3× the visible rows, and does not
        // virtualize at all below that — so this is the smallest legal value for the
        // viewport in use. A fixed number would put more rows in the DOM than the vendor
        // requires, which is work no other grid in the suite is asked to do.
        // https://www.telerik.com/kendo-jquery-ui/documentation/controls/data-management/grid/scrolling/virtual-scrolling
        const pageSize = Math.ceil(container.clientHeight / ROW_HEIGHT) * 3 + 1;

        $(host).kendoGrid({
            dataSource: { data, pageSize },
            height: '100%',
            // Row height has no grid option here — it is set in CSS, see host.html.
            scrollable: { virtual: true },
            columns: this.mapColumns(columns, scenario),
        });

        return $(host).data('kendoGrid');
    },

    // Kendo identifies a row by the data item's uid rather than by index, and with locked
    // columns renders the same row in two tables.
    getRenderedRows(container) {
        return rowElements(container, 'tr.k-table-row', 'data-uid');
    },

    getScrollContainer(container) {
        const grid = $(container.querySelector('#kendo-host')).data('kendoGrid');
        return (grid && grid.element.find('.k-scrollbar-vertical')[0])
            || container.querySelector('.k-grid-content');
    },
};
