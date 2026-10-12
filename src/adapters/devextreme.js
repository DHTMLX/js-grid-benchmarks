import { buildColumns, rowElements } from './_shared.js';

export default {
    id:   'devextreme',
    name: 'DevExtreme DataGrid',

    mapColumns(columns, scenario) {
        return buildColumns(columns, scenario, {
            base:     col  => ({ dataField: col.id, caption: col.label, width: col.width }),
            renderer: html => ({ cellTemplate: (el, info) => { el[0].innerHTML = html(info.data); } }),
            pin:      { fixed: true, fixedPosition: 'left' },
        });
    },

    create(container, { columns, data, scenario }) {
        container.innerHTML = '<div id="dx-host" style="width:100%;height:100%"></div>';
        const host = container.querySelector('#dx-host');

        return new Promise(resolve => {
            let done = false;

            $(host).dxDataGrid({
                dataSource: data,
                height: '100%',
                // The vendor's large-dataset guide: columnAutoWidth off, both rendering
                // modes virtual. columnRenderingMode defaults to 'standard', which would
                // render off-screen columns too.
                // https://js.devexpress.com/jQuery/Documentation/Guide/UI_Components/DataGrid/Enhance_Performance_on_Large_Datasets/
                columnAutoWidth: false,
                columnFixing: { enabled: scenario.frozenColumns > 0 },
                scrolling:   { mode: 'virtual', columnRenderingMode: 'virtual' },
                columns:     this.mapColumns(columns, scenario),
                onContentReady() {
                    if (!done) { done = true; resolve($(host).dxDataGrid('instance')); }
                },
            });
        });
    },

    getRenderedRows(container) {
        return rowElements(container, '.dx-data-row', 'aria-rowindex');
    },

    getScrollContainer(container) {
        return container.querySelector('.dx-scrollable-container');
    },
};
