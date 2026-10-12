import { ROW_HEIGHT }   from '../core/measurement.js';
import { buildColumns, rowElements } from './_shared.js';

export default {
    id:   'dhtmlx',
    name: 'DHTMLX Grid',

    mapColumns(columns, scenario) {
        return buildColumns(columns, scenario, {
            base:     col  => ({ id: col.id, header: [{ text: col.label }], width: col.width }),
            renderer: html => ({ template: (_value, row) => html(row) }),
        });
    },

    create(container, { columns, data, scenario }) {
        const config = {
            columns:    this.mapColumns(columns, scenario),
            data,
            htmlEnable: scenario.complexCells,
            rowHeight:  ROW_HEIGHT,
        };
        if (scenario.frozenColumns > 0) {
            config.leftSplit = scenario.frozenColumns;
        }
        return new dhx.Grid(container, config);
    },

    getRenderedRows(container) {
        return rowElements(container, '.dhx_grid-row', 'data-dhx-id');
    },

    getScrollContainer(container) {
        return container.querySelector('.dhx_grid-body');
    },
};
