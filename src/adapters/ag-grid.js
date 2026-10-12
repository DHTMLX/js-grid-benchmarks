import { ROW_HEIGHT }   from '../core/measurement.js';
import { buildColumns, rowElements } from './_shared.js';

export default {
    id:   'ag-grid',
    name: 'AG Grid',

    mapColumns(columns, scenario) {
        return buildColumns(columns, scenario, {
            base:     col  => ({ field: col.id, headerName: col.label, width: col.width }),
            renderer: html => ({ cellRenderer: p => html(p.data) }),
            pin:      { pinned: 'left' },
        });
    },

    create(container, { columns, data, scenario }) {
        container.innerHTML = `<div id="ag-host" class="ag-theme-alpine" style="width:100%;height:100%"></div>`;
        const host = container.querySelector('#ag-host');

        return new Promise(resolve => {
            const grid = agGrid.createGrid(host, {
                columnDefs: this.mapColumns(columns, scenario),
                rowData:    data,
                rowHeight:  ROW_HEIGHT,
                theme:      'legacy',
                onGridReady() { resolve(grid); },
            });
        });
    },

    getRenderedRows(container) {
        return rowElements(container, '.ag-row', 'row-index');
    },

    getScrollContainer(container) {
        // Same element, renamed in v35: `.ag-body-viewport` up to v34.
        return container.querySelector('.ag-grid-viewport')
            ?? container.querySelector('.ag-body-viewport');
    },
};
