import { ROW_HEIGHT }   from '../core/measurement.js';
import { buildColumns, rowElements } from './_shared.js';

export default {
    id:   'bryntum',
    name: 'Bryntum Grid',

    mapColumns(columns, scenario) {
        const htmlEncode = !scenario.complexCells;

        return buildColumns(columns, scenario, {
            base:     col  => ({ field: col.id, text: col.label, width: col.width, htmlEncode }),
            renderer: html => ({ renderer: ({ record }) => html(record) }),
            pin:      { locked: true },
        });
    },

    create(container, { columns, data, scenario }) {
        container.innerHTML = '<div id="bryntum-host" style="width:100%;height:100%"></div>';

        return new bryntum.grid.Grid({
            appendTo:  container.querySelector('#bryntum-host'),
            columns:   this.mapColumns(columns, scenario),
            data,
            rowHeight: ROW_HEIGHT,
            fixedRowHeight: true,
        });
    },

    getRenderedRows(container) {
        return rowElements(container, '.b-grid-row', 'data-index');
    },

    getScrollContainer(container) {
        return container.querySelector('.b-grid-body-container') ||
               container.querySelector('.b-virtual-scrollers');
    },
};
