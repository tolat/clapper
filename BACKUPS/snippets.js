
let sheet=null;
let initialRowOffset=0;



loadSheet=(show) => {
    var data=[];
    var columns=[{ title: 'Department', width: '200' },
    { title: 'Date', width: '200' },
    { title: 'P.O.', width: '200' },
    { title: 'Invoice #', width: '200' },
    { title: 'Supplier', width: '200' },
    { title: 'Amount', width: '200' }];
    for (p of show.purchases) {
        data.push([p.department,
        p.date.slice(0, 10),
        p.poNum,
        p.invoiceNum,
        p.supplier,
        p.amount]);
    }
    sheet=Jspreadsheet(document.getElementById('spreadsheet'), {
        data: data,
        columns: columns,
        toolbar: [
            {
                type: 'i',
                content: 'undo',
                onclick: function () {
                    table.undo();
                }
            },
            {
                type: 'i',
                content: 'redo',
                onclick: function () {
                    table.redo();
                }
            },
            {
                type: 'i',
                content: 'save',
                onclick: function () {
                    table.download();
                }
            },
            {
                type: 'select',
                k: 'font-family',
                v: ['Arial', 'Verdana']
            },
            {
                type: 'select',
                k: 'font-size',
                v: ['9px', '10px', '11px', '12px', '13px', '14px', '15px', '16px', '17px', '18px', '19px', '20px']
            },
            {
                type: 'i',
                content: 'format_align_left',
                k: 'text-align',
                v: 'left'
            },
            {
                type: 'i',
                content: 'format_align_center',
                k: 'text-align',
                v: 'center'
            },
            {
                type: 'i',
                content: 'format_align_right',
                k: 'text-align',
                v: 'right'
            },
            {
                type: 'i',
                content: 'format_bold',
                k: 'font-weight',
                v: 'bold'
            },
            {
                type: 'color',
                content: 'format_color_text',
                k: 'color'
            },
            {
                type: 'color',
                content: 'format_color_fill',
                k: 'background-color'
            },
        ],
        columnSorting: true,
        search: true,
        csvHeaders: true,
        tableOverflow: true,
        minSpareCols: 4,
        defaultColWidth: 200,

    });

    setSheetHeight();
    //fixRowNumbers();
}

loadGridJS=(show) => {
    new gridjs.Grid({
        sort: true,
        fixedHeader: true,
        search: true,
        data: show.purchases
    }).render(document.getElementById("wrapper"));
}

setSheetHeight=() => {
    tbarHeight=document.querySelector('.jexcel_toolbar').offsetHeight;
    navbarHeight=document.querySelector('#navbar').offsetHeight;
    controlsHeight=document.querySelector('#control-bar').offsetHeight;

    jContent=document.querySelector('.jexcel_content');
    jContent.style.maxHeight=`${window.innerHeight-tbarHeight-navbarHeight-controlsHeight}px`;
}

fixRowNumbers=async () => {
    initialRowOffset=document.querySelector('.jexcel tr').getBoundingClientRect().x;
    document.querySelector('.show-content-container').addEventListener('scroll', async () => {
        await fixRowNumbersHelper();
    });
}

fixRowNumbersHelper=async () => {
    let tds=document.querySelectorAll('.jexcel_row');
    offset=initialRowOffset-document.querySelector('.jexcel tr').getBoundingClientRect().x;
    for (let i=0; i<tds.length; i++) {
        tds[i].style.left=`${offset}px`;
    }
}

window.addEventListener("resize", () => {
    setSheetHeight();
})

toggleCreateShow=(value) => {
    document.getElementById("grayOut").style.display=value;
    document.getElementById("create-show-container").style.display=value;
}


customClickCell=(e, cellComponent) => {
    if (!cell.classList.contains('tabulator-cell')) { return }

    // Deselect other selected cells
    for (c of document.querySelectorAll('.selectedCell')) { if (c!=cell) { deselectCell(c) } }

    //Deselect other editing cells
    for (c of document.querySelectorAll('.editingCell')) { if (c!=cell) { deselectCell(c) } }

    // If cell is not selected or editing, select it
    if (!cell.classList.contains('selectedCell')&&!cell.classList.contains('editingCell')) {
        cell.classList.add('selectedCell');
    }
    // Otherwise, if cell is selected but not editing, remove selectedCell class and add editingCell class (second click)
    else if (!cell.classList.contains('editingCell')) {
        cell.classList.remove('selectedCell');
        cell.classList.add('editingCell');
    }
}


grid.setColumns([{ id: "setcode", initPos: 0, name: "Set Code", field: "setcode", width: 80, editor: Slick.Editors.Text, sortable: true, },
{ id: "Episode", initPos: 1, name: "Episode", field: "episode", width: 80, editor: Slick.Editors.Text, sortable: true, },
{ id: "Set Name", initPos: 2, name: "Set Name", field: "name", width: 200, editor: Slick.Editors.Text, sortable: true },
{ id: 'Location', initPos: 3, name: 'Location', field: 'Location', width: 150, editor: Slick.Editors.Text, sortable: true },
{ id: 'Notes', initPos: 4, name: 'Notes', field: 'Notes', width: 150, editor: Slick.Editors.Text, sortable: true },
{ id: "NoFringes", initPos: 5, name: "No Fringes", field: "nofringes", width: 100, sortable: true },
{ id: "Current", initPos: 6, name: "Current", field: "current", width: 100, sortable: true },
{ id: "Previous", initPos: 7, name: "Previous", field: "previous", width: 100, sortable: true },
{ id: "Variance", initPos: 8, name: "Variance", field: "variance", width: 100, sortable: true },
{ id: `Construction_mandays`, initPos: 9, name: `Construction Man Days`, field: `Construction_mandays`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Construction_header` },
{ id: `Construction_materials`, initPos: 10, name: `Construction Materials`, field: `Construction_materials`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Construction_header` },
{ id: `Construction_rentals`, initPos: 11, name: `Construction Rentals`, field: `Construction_rentals`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Construction_header` },
{ id: `Paint_mandays`, initPos: 12, name: `Paint Man Days`, field: `Paint_mandays`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Paint_header` },
{ id: `Paint_materials`, initPos: 13, name: `Paint Materials`, field: `Paint_materials`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Paint_header` },
{ id: `Paint_rentals`, initPos: 14, name: `Paint Rentals`, field: `Paint_rentals`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Paint_header` },
{ id: `Greens_mandays`, initPos: 15, name: `Greens Man Days`, field: `Greens_mandays`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Greens_header` },
{ id: `Greens_materials`, initPos: 16, name: `Greens Materials`, field: `Greens_materials`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Greens_header` },
{ id: `Greens_rentals`, initPos: 17, name: `Greens Rentals`, field: `Greens_rentals`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Greens_header` },
{ id: `MetalFab_mandays`, initPos: 18, name: `MetalFab Man Days`, field: `MetalFab_mandays`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `MetalFab_header` },
{ id: `MetalFab_materials`, initPos: 19, name: `MetalFab Materials`, field: `MetalFab_materials`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `MetalFab_header` },
{ id: `MetalFab_rentals`, initPos: 20, name: `MetalFab Rentals`, field: `MetalFab_rentals`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `MetalFab_header` },
{ id: `Sculptors_mandays`, initPos: 21, name: `Sculptors Man Days`, field: `Sculptors_mandays`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Sculptors_header` },
{ id: `Sculptors_materials`, initPos: 22, name: `Sculptors Materials`, field: `Sculptors_materials`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Sculptors_header` },
{ id: `Sculptors_rentals`, initPos: 23, name: `Sculptors Rentals`, field: `Sculptors_rentals`, width: 150, editor: Slick.Editors.Text, sortable: true, headerCssClass: `Sculptors_header` },
])



/* datejoined: Date,
    show: {
    type: Schema.Types.ObjectId,
        ref: 'Show'
},
rentals: [{
    type: Schema.Types.ObjectId, ref: 'Rental'
}],
    purchases: [{
        type: Schema.Types.ObjectId, ref: 'Purchase'
    }],
        daysWorked: [{
            date: Date,
            numhours: Number,
            set: { type: Schema.Types.ObjectId, ref: 'Set' },
            position: { type: Schema.Types.ObjectId, ref: 'Position' }
        }] */


let weekdays=[{ id: "monday", name: "Mon", field: "monday", width: 50, editor: Slick.Editors.Text, sortable: true },
{ id: "tuesday", name: "Tue", field: "tuesday", width: 50, editor: Slick.Editors.Text, sortable: true },
{ id: "wednesday", name: "Wed", field: "wednesday", width: 50, editor: Slick.Editors.Text, sortable: true },
{ id: "thursday", name: "Thu", field: "thursday", width: 50, editor: Slick.Editors.Text, sortable: true },
{ id: "friday", name: "Fri", field: "friday", width: 50, editor: Slick.Editors.Text, sortable: true },
{ id: "saturday", name: "Sat", field: "saturday", width: 50, editor: Slick.Editors.Text, sortable: true },
{ id: "sunday", name: "Sun", field: "sunday", width: 50, editor: Slick.Editors.Text, sortable: true },]

// Find the rows into the target group the selected row is in
for (group of groups) {
    if (rowIndex>=row) { break }
    rowsIntoGroup=0;
    rowIndex++;
    groupIndex++;
    if (!group.collapsed) {
        for (let i=0; i<group.rows.length; i++) {
            if (rowIndex>=row) { break }
            rowIndex++;
            rowsIntoGroup++;
        }
    }
}

// Colorized Department columns 
for (d of _show.departments) {
    let mdKey=`${d} Labor`;
    let mtKey=`${d} Purchases`;
    let rlKey=`${d} Rentals`;
    columns=columns.concat([
        {
            id: mdKey, name: mdKey, field: mdKey, width: 150, minWidth: 50,
            sortable: true, headerCssClass: `header-color-${_colorIndex}`, groupTotalsFormatter: sumTotalsDollarsFormatter, cssClass: 'uneditable'
        },
        {
            id: mtKey, name: mtKey, field: mtKey, width: 150, minWidth: 50,
            sortable: true, headerCssClass: `header-color-${_colorIndex}`, groupTotalsFormatter: sumTotalsDollarsFormatter, cssClass: 'uneditable'
        },
        {
            id: rlKey, name: rlKey, field: rlKey, width: 150, minWidth: 50,
            sortable: true, headerCssClass: `header-color-${_colorIndex}`, groupTotalsFormatter: sumTotalsDollarsFormatter, cssClass: 'uneditable'
        },
    ])
    _colorIndex=(_colorIndex+1)%5;
}