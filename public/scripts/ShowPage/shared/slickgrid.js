// Global Variables
let _contextCell
let _itemBeforeEdit
let _test=false
let _groupedBy
let _editDirectionForwards=true
let _validEdit=true
let _week=null
let _frozenColumns=0
let _dataSaved=true
let _cellCssStyles={}
let _newWeek=false
let _deletedWeek=false
let _showrecordWeekMap={}
let _prevColumns
let _prevColMap
let _prevDepartmentOrder
let _overrideBlankRFSWarning=false
let _headerDblCLick=false
let _colSortMap={}
let _userYesNo=true
let _savingUnderway=false

// Edit History Buffer
let undoRedoBuffer={
    commandQueue: [],
    commandCtr: 0,
}

const alphabet='abcdefghijklmnopqrstuvwxyz1234567890'.split('');
const oneDay=24*60*60*1000;

let server;
let newRowIds=0;

// Currency formatter
let formatter=new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

// Creates a slick grid with parameters
createSlickGrid=(data, columns, options) => {
    // Add 5 blank rows at end of grid
    if (!data[0]) {
        data.push(...[
            { id: 'empty_0', editedfields: [] },
            { id: 'empty_1', editedfields: [] },
            { id: 'empty_2', editedfields: [] },
            { id: 'empty_3', editedfields: [] },
            { id: 'empty_4', editedfields: [] }])
    }

    // Set server
    server=_args.server;

    // Create the DataView
    var groupItemMetadataProvider=new Slick.Data.GroupItemMetadataProvider();
    dataView=new Slick.Data.DataView({ groupItemMetadataProvider: groupItemMetadataProvider });

    // Create grid 
    grid=new Slick.Grid("#myGrid", dataView, columns, options);
    grid.registerPlugin(groupItemMetadataProvider);
    grid.setSelectionModel(new Slick.CellSelectionModel());

    // Create the Resizer plugin
    resizer=new Slick.Plugins.Resizer({ container: '#grid-container' });
    grid.registerPlugin(resizer);

    // Context menu functionality
    grid.onContextMenu.subscribe(function (e, args) {
        // Set context cell
        e.preventDefault();
        _contextCell=grid.getCellFromEvent(e);

        // Set context menu options
        setContextMenu();

        $("#contextMenu")
            .data("row", _contextCell.row)
            .css("top", e.pageY)
            .css("left", e.pageX)
            .show();

        // Make sure context menu is always visible
        let diffH=document.body.offsetHeight-(e.pageY+document.getElementById('contextMenu').offsetHeight);
        let diffW=document.body.offsetWidth-(e.pageX+document.getElementById('contextMenu').offsetWidth);
        if (diffH<0) { e.pageY+=diffH }
        if (diffW<0) { e.pageX+=diffW }

        $("#contextMenu")
            .css("top", e.pageY)
            .css("left", e.pageX)

        $("body").one("click", function () {
            $("#contextMenu").hide();
        });
    });

    // Right click on column header
    grid.onHeaderContextMenu.subscribe(function (e, args) {
        e.preventDefault();
        _contextCell=args.column;

        // Set context menu options
        setHeaderContextMenu(args);

        $("#contextMenu")
            .css("top", e.pageY)
            .css("left", e.pageX)
            .show();

        // Make sure context menu is always visible
        let diffH=document.body.offsetHeight-(e.pageY+document.getElementById('contextMenu').offsetHeight);
        let diffW=document.body.offsetWidth-(e.pageX+document.getElementById('contextMenu').offsetWidth);
        if (diffH<0) { e.pageY+=diffH }
        if (diffW<0) { e.pageX+=diffW }

        $("#contextMenu")
            .css("top", e.pageY)
            .css("left", e.pageX)

        $("body").one("click", function () {
            $("#contextMenu").hide();
        });
    });

    // Updates for after a cell edit
    grid.onCellChange.subscribe(function (e, args) {
        // Update totals row if it is show
        updateTotalsRow();

        // Save the previous item to the edit command
        savePrevItemToCommand(_itemBeforeEdit, grid.getColumns()[args.cell].field);

        // Apply dataView changes to grid
        grid.invalidate();
        grid.setData(dataView);
        grid.render();
    })

    // Register if an arrow key was pressed so auto edit is enabled when navigating with arrow keys
    grid.onKeyDown.subscribe(e => {
        if (document.getElementById('grid-modal-container').contains(document.activeElement)) { return }
        // Edit cell if keyboard text key is pressed but not if in combination with a modifier key
        if (e.key
            &&alphabet.includes(e.key.toLowerCase())
            &&grid.getActiveCellNode()
            &&!grid.getActiveCellNode().classList.contains('editable')
            &&!e.ctrlKey&&!e.metaKey) {
            grid.editActiveCell();
        }

        // Clear cells on delete key pressed
        if (e.keyCode==8||e.keyCode==46) {
            if (!grid.getCellEditor()) {
                clearCells()
            }
        }

        // Go to next line on enter
        if (e.keyCode==13) {
            // Prevent degault enter key action (slick.grid native)
            e.stopImmediatePropagation()
            e.stopPropagation()

            let activeCell=grid.getActiveCell()
            let editor=grid.getCellEditor()
            if (activeCell) {
                if (editor) {
                    let val=document.querySelector('.editor-text').value
                    let row=activeCell.row
                    let col=grid.getColumns()[activeCell.cell]
                    let oldItem=dataView.getItemById(dataView.mapRowsToIds([row])[0])
                    let newItem={}
                    Object.assign(newItem, oldItem)
                    newItem[col.field]=val
                    updateItemCustom(row, activeCell.cell, newItem, oldItem)
                }
                if (activeCell.row<dataView.getItems().length-1) {
                    grid.setActiveCell(activeCell.row+1, activeCell.cell)
                }
            }

            grid.focus()
        }
    })

    // Update context cell and context Item on active cell change
    grid.onActiveCellChanged.subscribe(function (e, args) {
        // Set context cell
        let activeCell=grid.getActiveCell()
        if (activeCell) {
            _contextCell={ row: activeCell.row, cell: activeCell.cell }
        } else {
            _contextCell={ row: 0, cell: 0 }
        }
        grid.focus()
    });

    // Update itemBeforeEdit so it can be added to a cell edit command
    grid.onBeforeEditCell.subscribe(function (e, args) {

        // Stop edit event if this is an uneditable cell
        if (_cellCssStyles['uneditableRow']&&Object.keys(_cellCssStyles['uneditableRow']).includes(args.item.id)) {
            return false
        }

        let item=args.item;
        _itemBeforeEdit={};
        Object.assign(_itemBeforeEdit, item);
    });

    // Set frozen columns after columns are reordered
    grid.onColumnsReordered.subscribe(function (e, args) {
        if (_args.section!='Crew') {
            setFrozenColumns(_frozenColumns);
            createReorderColumnCommand()
            _prevColumns=grid.getColumns()
        }
    })

    grid.onColumnsResized.subscribe(function (e, args) {
        createResizeColumnCommand()
        _prevColMap=getColumnWidths()
    })

    // If shift click on a cell, select cells starting at active cell to clicked cell
    grid.onClick.subscribe(async function (e, args) {
        let activeCell=await grid.getActiveCell()
        if (e.shiftKey&&activeCell) {
            let toRow=args.row;
            let toCell=args.cell;
            let fromRow=activeCell.row;
            let fromCell=activeCell.cell;

            let temp;
            let originalFromCell=fromCell
            let originalFromRow=fromRow
            if (fromRow>toRow) {
                temp=fromRow;
                fromRow=toRow;
                toRow=temp;
            }
            if (fromCell>toCell) {
                temp=fromCell;
                fromCell=toCell;
                toCell=temp;
            }

            let selectionModel=await grid.getSelectionModel()
            let ranges=await selectionModel.getSelectedRanges()

            if (toCell&&toRow) {
                ranges[0].fromCell=fromCell
                ranges[0].fromRow=fromRow
                ranges[0].toCell=toCell
                ranges[0].toRow=toRow
            }

            await grid.setActiveCell(originalFromRow, originalFromCell)
            await selectionModel.setSelectedRanges(ranges)
            await grid.setSelectionModel(selectionModel)
            await grid.invalidate()
            await grid.render()
        }

        // Stop double click to enter cell editor (edit with key press)

    })

    // Grid Key Listener
    document.addEventListener('keydown', function (e) {
        // Save 
        if (e.key=='s'&&e.ctrlKey) {
            e.preventDefault();
            saveData();
        }

        // Return if focus isn't on the grid or one of its children
        if (!document.getElementById('grid-container').contains(document.activeElement)) { return }
    });

    // Warn before navigating away from page
    window.onbeforeunload=function () {
        if (!_dataSaved) {
            return true;
        }
    };

    // Add new row callback
    grid.onAddNewRow.subscribe(function (e, args) {
        var item=args.item;
        grid.invalidateRow(data.length);
        data.push(item);
        grid.updateRowCount();
        grid.render();
    });

    // Handle double click event on column header click (used for sorting)
    grid.onHeaderClick.subscribe(function (e, args) {
        if (_headerDblCLick) {
            if (args.column.sortable) {
                sortColumn(args.column.field)
            }
        } else {
            // Remove sort arrows from grid column headers
            for (elt of document.getElementsByClassName('slick-sort-indicator')) {
                elt.classList.remove('slick-sort-indicator-asc')
                elt.classList.remove('slick-sort-indicator-desc')
            }
        }

        // Set double click delay
        _headerDblCLick=true
        setTimeout(() => { _headerDblCLick=false }, 250)
    })

    // Update _cssCellStyles when the dataView cell styles are changes
    grid.onCellCssStylesChanged.subscribe(function (e, args) {
        // Save style hash as keyed by item id instead of by row number
        if (!args.hash) { return }
        let idHash={}
        for (row in args.hash) {
            idHash[dataView.mapRowsToIds([row])[0]]=args.hash[row]
        }
        _cellCssStyles[args.key]=idHash;

        grid.invalidate()
        grid.setData(dataView)
        grid.render()
    })

    // Update grid on DataView change events.
    dataView.onRowCountChanged.subscribe(function (e, args) {
        grid.updateRowCount();
        grid.render();
    });
    dataView.onRowsChanged.subscribe(function (e, args) {
        grid.invalidateRows(args.rows);
        grid.render();
    });

    // Keep cell styles after group expand/collapse
    dataView.onGroupExpanded.subscribe(function (e, args) {
        applyCellStyles(_cellCssStyles)

        grid.invalidate()
        grid.setData(dataView)
        grid.render()
    })
    dataView.onGroupCollapsed.subscribe(function (e, args) {
        let stylesBefore=JSON.parse(JSON.stringify(_cellCssStyles))
        applyCellStyles(_cellCssStyles)
        _cellCssStyles=JSON.parse(JSON.stringify(stylesBefore))

        grid.invalidate()
        grid.setData(dataView)
        grid.render()
    })

    // Beign bulk update
    dataView.beginUpdate();

    // Fire the change events and update the grid.
    dataView.setItems(data);

    // Define and apply search funcitonality to dataView
    dataView.setFilter(searchFilter);

    // End bulk update
    dataView.endUpdate();

    // Filter functionality listener
    $('#textsearch').on('input', function () {
        dataView.setFilterArgs({ searchString: $(this).val() });
        dataView.refresh();
    });

    // Filter search functionality
    function searchFilter(item, args) {
        if (args&&args.searchString!="") {
            const values=Object.values(item);
            let isMatch=false;
            for (i=0; i<values.length; i++) {
                if (values[i]&&values[i].toString().toLowerCase().indexOf(args.searchString.toLowerCase())>=0) {
                    isMatch=true;
                    break;
                }
            }
            return isMatch;
        }
        return true;
    }

    // Set Week Ending 
    setWeekEnding();

    // No toolbar edit features if in timesheets section
    if (_args.section!='Timesheets') {
        // Add listener to add rows input
        createAddRowListener();

        // Add listener to group by input 
        createGroupByListener();

        // Add listener to auto-number input 
        createAutoNumberListener();

        // Add listener to frozen-columns input 
        createFrozenColumnsListener();
    }

    // Initialize prev variables
    _prevColumns=grid.getColumns()
    _prevColMap=getColumnWidths()
    _prevDepartmentOrder=getDeptOrder()

    // Set page selector dropdown restrictions
    setNavRestrictions()

    // Initialize column sort map
    for (col of grid.getColumns()) { _colSortMap[col.field]=2 }
}

// Sort column and reapply grid styles
sortColumn=(field) => {
    let editCommand={ type: 'sortColumn' }

    // Make copies of previtems
    let prevItems=dataView.getItems()
    editCommand.prevItems=[]
    for (item of prevItems) {
        let copy={}
        Object.assign(copy, item)
        editCommand.prevItems.push(copy)
    }

    editCommand.prevColSortMap={}
    Object.assign(editCommand.prevColSortMap, _colSortMap)

    editCommand.field=field
    editCommand.prevSortCol={}
    for (col in _colSortMap) {
        if (_colSortMap[col]<2) {
            editCommand.prevSortCol.field=col
            editCommand.prevSortCol.asc=_colSortMap[col]
        }
    }

    editCommand.execute=executeSortColumn
    editCommand.undo=undoSortColumn

    queueAndExecuteEdit(null, null, editCommand)

}

// Execute sort column
function executeSortColumn() {
    _colSortMap[this.field]==0? _colSortMap[this.field]++:_colSortMap[this.field]--

    // Reset other sorted columns to sort ascending
    for (field in _colSortMap) {
        if (field!=this.field) {
            _colSortMap[field]=2
        }
    }
    let asc=_colSortMap[this.field]

    let items=dataView.getItems();
    items.sort((a, b) => { return stableSort(a, b, asc, this.field) });
    dataView.setItems(items);
    grid.setSortColumn(this.field, asc)

    applyCellStyles(_cellCssStyles)
}

// Undo sort column
function undoSortColumn() {
    Object.assign(_colSortMap, this.prevColSortMap)

    let newItems=[]
    for (item of this.prevItems) {
        let copy={}
        Object.assign(copy, item)
        newItems.push(copy)
    }

    // Reset sort column to previous
    if (this.prevSortCol.field) {
        grid.setSortColumn(this.prevSortCol.field, this.prevSortCol.asc)
    } else {
        grid.setSortColumn(null, null)
    }
    dataView.setItems(newItems)
    applyCellStyles(_cellCssStyles)
}

// Retrun greyed out node for dropdown links
greyOutLink=(elt) => {
    let newElt=elt.cloneNode(true)
    newElt.href=''
    newElt.style.color='rgb(140, 140, 140)';
    newElt.style.paddingLeft='16px'
    newElt.innerText+=' (No Rates)'
    return newElt
}

// Restricts page selector dropdown in nav bar so that pages are filled out in correct order
setNavRestrictions=() => {
    // If no rates exist, block access to crew and rates
    if (!_week||!Object.keys(_week.positions.positionList)[0]) {
        let crewDropdown=document.getElementById('crew-dropdown')
        let rentalsDropdown=document.getElementById('rentals-dropdown')
        crewDropdown.parentElement.replaceChild(greyOutLink(crewDropdown), crewDropdown)
        rentalsDropdown.parentElement.replaceChild(greyOutLink(rentalsDropdown), rentalsDropdown)
    }
}

// Initialize reorder column command
createReorderColumnCommand=(initialAction=true) => {
    let editCommand={ type: 'reorderColumns' }

    editCommand.saveStatus=_dataSaved
    editCommand.newCols=grid.getColumns()
    editCommand.oldCols=JSON.parse(JSON.stringify(_prevColumns))
    editCommand.initialAction=initialAction

    editCommand.execute=executeReorderColumns
    editCommand.undo=undoReorderColumns

    queueAndExecuteEdit(null, null, editCommand)
}

// Execute reorder columns
function executeReorderColumns() {
    if (this.initialAction) {
        this.initialAction=false
    } else {
        grid.setColumns(this.newCols)
        grid.invalidate()
        grid.render()
        grid.focus()
        _prevColumns=this.newCols
    }
}

// Execute undo reorder columns
function undoReorderColumns() {
    grid.setColumns(this.oldCols)
    grid.invalidate()
    grid.render()
    grid.focus()
    _prevColumns=this.oldCols
}

createResizeColumnCommand=() => {
    let editCommand={ type: 'resizeColumns' }

    editCommand.saveStatus=_dataSaved
    editCommand.oldMap=_prevColMap
    editCommand.newMap=getColumnWidths()
    editCommand.initialAction=true

    editCommand.execute=executeResizeColumns
    editCommand.undo=undoResizeColumns

    queueAndExecuteEdit(null, null, editCommand)
}

function executeResizeColumns() {
    if (this.initialAction) {
        this.initialAction=false
    } else {
        setColumnWidths(this.newMap)
        _prevColMap=this.newMap
    }
}

function undoResizeColumns() {
    setColumnWidths(this.oldMap)
    _prevColMap=this.oldMap
}

// Custom Paste function - parses spreadsheet clipboard data for pasting in slickgrid
triggerPaste=async () => {
    let editCommand={ type: 'paste', saveStatus: [_dataSaved] }
    let clipText=''

    await navigator.clipboard.readText().then(text => { clipText=text })

    // Replace \r carachters - only use \n for row separation
    clipText=clipText.replaceAll('\r', '')

    // Replace intra-cell return chars with placeholder so splitting into rows is easier
    let newClipText=''
    let inQuote=false
    for (char of clipText) {
        if (char=='\"') { inQuote=!inQuote }
        else if (char=='\n'&&inQuote) { char='_*R*_' }
        newClipText+=char
    }

    // Replace double quotes, and remove any remaining single quotes
    newClipText=newClipText.replaceAll('""', '_*Q*_')
    newClipText=newClipText.replaceAll('"', '')
    newClipText=newClipText.replaceAll('\r', '')
    let rows=newClipText.split('\n')

    // Split up rows into cell values (trim last cell since it will always be a blank (after last \t))
    for (i=0; i<rows.length; i++) {
        rows[i]=rows[i].split('\t')

        // If last row item is blank, trim it
        if (rows[i][rows[i].length-1]=='') {
            rows[i].pop()
        }
    }

    editCommand.rows=rows
    editCommand.startRow=_contextCell.row
    editCommand.startCell=_contextCell.cell
    editCommand.endRow=rows.length-1+editCommand.startRow
    editCommand.endCell=rows[0].length-1+editCommand.startCell
    editCommand.columns=grid.getColumns()
    editCommand.selectedRange=grid.getSelectionModel().getSelectedRanges()[0]

    editCommand.row=editCommand.startRow
    editCommand.cell=editCommand.startCell
    editCommand.execute=executePaste
    editCommand.undo=undoPaste

    editCommand.prevItems=[]
    let items=await dataView.getItems()
    for (item of items) {
        let copy={}
        await Object.assign(copy, item)
        await editCommand.prevItems.push(copy)
    }

    queueAndExecuteEdit(null, null, editCommand)
}

function undoPaste() {
    grid.setActiveCell(this.startRow, this.startCell)
    grid.getSelectionModel().setSelectedRanges([this.selectedRange])

    // Use duplicate objects so originals in command are not changed by undo/redo operations
    let prevItemsCopy=[]
    for (item of this.prevItems) {
        let newItem={}
        Object.assign(newItem, item)
        prevItemsCopy.push(newItem)
    }

    dataView.setItems(prevItemsCopy)
    grid.recalculate(item)
    grid.setData(dataView)
    grid.invalidate()
    grid.render()
    grid.focus()
}

function executePaste() {
    let items=dataView.getItems()
    grid.setActiveCell(this.startRow, this.startCell)
    grid.getSelectionModel().setSelectedRanges([this.selectedRange])

    // Add rows to grid if not enough exist
    let neededRows=this.endRow-this.startRow
    let availableRows=dataView.getItems().length-1-this.startRow

    // Get available rows in group if grid is grouped
    if (_groupedBy) {
        availableRows=-1;
        let firstItem=item=items.find(i => dataView.getRowById(i.id)==this.startRow)

        let groups=dataView.getGroups()
        let stopAtGroupEnd=false
        let startIndex=false;
        for (g of groups) {
            if (!stopAtGroupEnd) {
                for (let i=0; i<g.rows.length; i++) {
                    if (g.rows[i]==firstItem) {
                        stopAtGroupEnd=true
                        startIndex=i
                    }
                    if (i==g.rows.length-1) {
                        availableRows=i-startIndex
                    }
                }
            }
        }
    }

    // Add rows if necessary
    if (availableRows<neededRows) {
        rowCreator(neededRows-availableRows, true)
    }

    let editedfields=[]
    // Update rows if this is a single to multiple
    if (this.rows.length<=2&&this.rows[0].length<=1) {
        let pasteRange=grid.getSelectionModel().getSelectedRanges()[0]
        let Yrange=pasteRange.toRow-pasteRange.fromRow
        let Xrange=pasteRange.toCell-pasteRange.fromCell
        for (let i=0; i<Yrange; i++) {
            this.rows.unshift(this.rows[0])
            for (let j=0; j<Xrange; j++) {
                this.rows[i].unshift(this.rows[0][0])
            }
        }
        this.startRow=pasteRange.fromRow
        this.startCell=pasteRange.fromCell
        this.endRow=this.startRow+Yrange
        this.endCell=this.startCell+Xrange
    }

    // Replace grid data with paste data
    for (let i=0; i<=this.endRow-this.startRow; i++) {
        if (this.rows[i][0]!=undefined) {
            let idx=i+this.startRow
            let item=dataView.getItemByIdx(idx)

            // Do not paste into this item if it is in an uneditable row
            if (Object.keys(_cellCssStyles['uneditableRow']).includes(item.id)) { continue }

            if (_groupedBy) {
                item=items.find(i => dataView.getRowById(i.id)==idx)
            }
            for (j=0; j<=this.endCell-this.startCell; j++) {
                let column=this.columns[j+this.startCell]
                if (!column.cssClass||!column.cssClass.includes('uneditable')) {
                    if (this.rows[i][j]) {
                        let cellData=this.rows[i][j].replaceAll('_*Q*_', '"').replaceAll('_*R*_', '\n')
                        if (column.cssClass&&column.cssClass.includes('currency')) {
                            item[column.field]=parseNumberFromCurrency(cellData)
                        } else {
                            item[column.field]=cellData
                        }

                        if (!item.editedfields)
                            item.editedfields=[]
                        if (!item.editedfields.includes(column.field))
                            item.editedfields.push(column.field)
                        if (!editedfields.includes(column.field))
                            editedfields.push(column.field)
                    }
                }
            }

            dataView.updateItem(item.id, item)
            grid.recalculate(item, editedfields)
        }
    }

    runAllValidators()
    grid.focus()
}

// Custom Copy function - parses slickgrid data, turns it into spreadsheet clipboard data, and capies it to the clipboard
triggerCopy=() => {
    // Get content from selection
    let columns=grid.getColumns()
    let copyRange=grid.getSelectionModel().getSelectedRanges()[0]

    let copyString=''

    for (let i=copyRange.fromRow; i<=copyRange.toRow; i++) {
        item=dataView.getItemByIdx(i)
        for (let j=copyRange.fromCell; j<=copyRange.toCell; j++) {
            let value=false
            if (!columns[j].isHidden) { value=item[columns[j].field] }
            value? copyString+='\"'+value.toString().replaceAll('"', '""')+'\"\t':copyString+='\t'
        }
        copyString+='\r\n'
    }

    navigator.clipboard.writeText(copyString)
}

// Returns the grid columns in the order specified by columnOrder
reorderColumns=(columnOrder) => {
    let columns=grid.getColumns();
    let newColumns=[];
    columns=duplicateArray(columns);
    if (columnOrder) {
        for (let i=0; i<columnOrder.length; i++) {
            for (c of columns) { if (c.id==columnOrder[i]) { newColumns.push(c) } }
        }
    }
    else { newColumns=columns }

    // Add columns that are not accounted for by the column ordering 
    let unaccountedForCols=columns.filter(c => !newColumns.find(clm => clm.name==c.name))
    newColumns.push(...unaccountedForCols)

    grid.setColumns(newColumns);
}

// Adds rows and add the action to the redo/undo queue
addRow=(count, direction, isAfterPaste=false) => {
    let editCommand={ type: 'addRow' };
    let row=_contextCell.row;

    editCommand.isAfterPaste=isAfterPaste
    editCommand.count=count;
    editCommand.row=row;
    if (direction=='below') { editCommand.direction=1 }
    else { editCommand.direction=0 }
    editCommand.execute=executeAddRow;
    editCommand.undo=undoAddRow;
    editCommand.prevCellStyles=JSON.parse(JSON.stringify(_cellCssStyles))

    queueAndExecuteEdit(null, null, editCommand);
}

// Adds count rows below _contextCell
function executeAddRow() {
    for (let i=0; i<this.count; i++) {
        let data=dataView.getItems();
        let item={ id: "id_"+data.length };
        let row=this.row;
        if (_groupedBy) {
            row=getActualRow(row);
            item[`${_groupedBy}`]=data[row][_groupedBy];
        }
        dataView.insertItem(row+this.direction, item);
    }

    grid.focus()
    applyCellStyles(_cellCssStyles)
}

// Undo Addition of count rows below _contextCell
function undoAddRow() {
    for (let i=0; i<this.count; i++) {
        let data=dataView.getItems();
        let row=this.row;
        if (_groupedBy) { row=getActualRow(row) }
        let deleted=data.splice(row+this.direction, 1);
        dataView.setItems(data);
        dataView.refresh();
    }

    // Undo next command as well if this is joined to previous a paste command
    if (this.isAfterPaste) {
        undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr-1].undo()
        undoRedoBuffer.commandCtr--
    }

    grid.focus()
    applyCellStyles(this.prevCellStyles)
}

// Clears cells in selected range (called on delete key pressed)
clearCells=() => {
    if (!_contextCell) {
        let range=grid.getSelectionModel().getSelectedRanges()[0]
        _contextCell={}
        _contextCell.row=range.fromRow
        _contextCell.cell=range.fromCell
    }
    let editCommand={ type: 'clearCells' }
    let row=_contextCell.row
    let cell=_contextCell.cell

    let prevItems=[]
    let rows=grid.getSelectedRows()
    let items=dataView.getItems()
    for (row of rows) {
        if (_groupedBy) { row=getActualRow(row) }
        prevItems.push(items[row])
    }

    let newItems=[]
    let range=grid.getSelectionModel().getSelectedRanges()[0]
    let startCol=range.fromCell
    let endCol=range.toCell
    let cols=grid.getColumns()

    // Set editedfields for use in grid.recalculate function
    editCommand.editedfields=cols.filter(c => cols.indexOf(c)>=startCol&&cols.indexOf(c)<=endCol).map(c => c.field)

    // Exit if editing all ueditable cells
    if (!cols.slice(startCol, endCol+1).find(c => !c.cssClass||!c.cssClass.includes('uneditable'))) { return }

    if (range&&range.fromCell) {
        row=range.fromRow
        cell=range.fromCell
    }

    for (let i=0; i<prevItems.length; i++) {
        let item={}
        Object.assign(item, prevItems[i])
        for (let j=startCol; j<=endCol; j++) {
            let col=cols[j];
            // Do not change cell if column has uneditable class
            if (col.cssClass&&col.cssClass.includes('uneditable')) {
                continue
            }
            item[cols[j].field]=undefined
            if (!item.editedfields) {
                item.editedfields=[]
            }
            item.editedfields.push(cols[j].field)
        }
        newItems.push(item)
    }

    editCommand.startCol=startCol
    editCommand.endCol=endCol
    editCommand.row=row
    editCommand.cell=cell
    editCommand.execute=executeClearCells
    editCommand.undo=undoClearCells
    editCommand.prevItems=prevItems
    editCommand.newItems=newItems
    editCommand.prevCellStyles=JSON.parse(JSON.stringify(_cellCssStyles))

    queueAndExecuteEdit(false, false, editCommand)
}

// Executes clear cell operation
function executeClearCells() {
    grid.setActiveCell(this.row, this.cell)
    for (ni of this.newItems) {
        let item={}
        Object.assign(item, ni)
        dataView.updateItem(item.id, item)

        let row=dataView.getItems().indexOf(item)
        if (_groupedBy) { row=getGroupedRow(row) }
        for (let i=this.startCol; i<=this.endCol; i++) {
            clearInvalidCellMarker({ row: row, cell: i })
        }

        grid.recalculate(ni, this.editedfields)
    }

    grid.invalidate()
    grid.setData(dataView)
    grid.render()
}

// Undoes clear cell operation
function undoClearCells() {
    grid.setActiveCell(this.row, this.cell)
    for (pi of this.prevItems) {
        let item={}
        Object.assign(item, pi)
        dataView.updateItem(item.id, item)

        grid.recalculate(pi)
    }

    grid.invalidate()
    grid.setData(dataView)
    grid.render()
}

// Custom item update function that pushes item update to the unde redo buffer
updateItemCustom=(row, cell, newItem, oldItem) => {
    let editCommand={ type: 'addRow' };

    editCommand.row=row
    editCommand.cell=cell
    editCommand.newItem=newItem
    editCommand.oldItem=oldItem
    editCommand.execute=function () {
        dataView.updateItem(this.newItem.id, this.newItem)
        grid.onCellChange.notify(
            {
                row: this.row,
                cell: this.cell,
                item: this.newItem,
                column: grid.getColumns()[this.cell],
                grid: grid
            },
            {
                isPropagationStopped: function () { return false },
                isImmediatePropagationStopped: function () { return false },
                stopImmediatePropagation: function () { return },
                stopPropagation: function () { return }
            },

        )
    }
    editCommand.undo=function () {
        dataView.updateItem(this.oldItem.id, this.oldItem)
        grid.onCellChange.notify(
            {
                row: this.row,
                cell: this.cell,
                item: this.oldItem,
                column: grid.getColumns()[this.cell],
                grid: grid
            },
            {
                isPropagationStopped: function () { return false },
                isImmediatePropagationStopped: function () { return false },
                stopImmediatePropagation: function () { return },
                stopPropagation: function () { return }
            },
        )
    }

    queueAndExecuteEdit(false, false, editCommand)
}

// Gets the correct row for the context menu when data is grouped 
getActualRow=(row) => {
    let groups=dataView.getGroups();
    let rowsIntoGroup=0;
    let rowIndex=0;
    let item=false;
    row--;

    // Find the rows into the target group the selected row is in
    for (group of groups) {
        if (item) { break }
        if (group.collapsed) { row--; continue; }
        rowsIntoGroup=0;
        while (rowsIntoGroup<group.rows.length) {
            if (rowIndex==row) {
                item=group.rows[rowsIntoGroup];
                break;
            } else {
                rowsIntoGroup++;
                rowIndex++;
            }
        }
        row-=2;
    }
    return (dataView.getItems().map(i => i.id).indexOf(item.id));
}

// Group data by column function
groupBy=async (group) => {
    if (!group) {
        await dataView.setGrouping(null);
        document.getElementById('cancel-grouping').style.display='none';
        _groupedBy=null;
        applyCellStyles(_cellCssStyles)

        return;
    }

    aggregators=getGroupAggregators();

    _groupedBy=group;
    await dataView.setGrouping({
        getter: _groupedBy,
        formatter: function (g) {
            return `${group}:  `+g.value+"  <span style='color:green'>("+g.count+" items)</span>";
        },
        aggregators: aggregators,
        collapsed: true
    });
    document.getElementById('cancel-grouping').style.display=null;
}

// Collapses or expands groups as defined in collapasedGroups argument
collapseGroups=(collapsedGroups) => {
    let groups=dataView.getGroups();
    if (groups[0]) {
        for (let i=0; i<collapsedGroups.length; i++) {
            if (collapsedGroups[i]==1) { dataView.collapseGroup(groups[i].groupingKey) }
            else { dataView.expandGroup(groups[i].groupingKey) }
        }
    }
}

// Add listener to group input
createGroupByListener=() => {
    document.getElementById('group-by-input').addEventListener('keydown', e => {
        if (e.key=='Enter') {
            let input=document.getElementById('group-by-input');
            groupBy(input.value);
            input.value=null;

            // Hide dropdown menu item
            for (elt of document.querySelectorAll('.show')) {
                elt.classList.remove('show');
            }
        }
    })
}

// Add listener to add rows input
createAddRowListener=() => {
    document.getElementById('add-rows-input').addEventListener('keydown', e => {
        if (e.key=='Enter') {
            let input=document.getElementById('add-rows-input');
            rowCreator(input.value);
            input.value=null;

            // Hide dropdown menu item
            for (elt of document.querySelectorAll('.show')) {
                elt.classList.remove('show');
            }
        }
    })
}

// Add listener to auto-number input
createAutoNumberListener=() => {
    document.getElementById('auto-number-input').addEventListener('keydown', e => {
        if (e.key=='Enter') {
            let input=document.getElementById('auto-number-input');
            toggleAutoNumberModal(true, input.value, false);
            input.value=null;

            // Hide dropdown menu item
            for (elt of document.querySelectorAll('.show')) {
                elt.classList.remove('show');
            }
        }
    })
}

// Sets 'numCols' frozen column at left of grid
setFrozenColumns=(numCols) => {
    // Update global variable
    _frozenColumns=numCols;

    // Freeze 'frozenCols' columns at left of grid
    numCols--;
    let prevCols=grid.getColumns();
    grid.setOptions({ frozenColumn: numCols });

    // Remove style from previous 'last' frozen column
    let lastFrozenCol=prevCols.find(c => c.cssClass&&c.cssClass.includes('last-frozen-column'));
    if (lastFrozenCol) {
        grid.setColumns(prevCols.map(c => { if (c.id==lastFrozenCol.id) { c.cssClass=c.prevCssClass } return c }))
    }

    // Apply style to new 'last' frozen col so there is a divider
    if (numCols>=0) {
        prevCols[numCols].prevCssClass=prevCols[numCols].cssClass
        prevCols[numCols].cssClass+=' last-frozen-column';
    }

    // Set grid columns as prevcols so setOptions doesn't reorder the columns
    grid.setColumns(prevCols);

    // Clear input field
    document.getElementById('auto-number-input').value=null;
}

// Add listener to frozen-columns input 
createFrozenColumnsListener=() => {
    document.getElementById('frozen-columns-input').addEventListener('keydown', e => {
        if (e.key=='Enter') {
            _frozenColumns=parseInt(document.getElementById('frozen-columns-input').value)||0;

            // Set frozen columns
            setFrozenColumns(_frozenColumns);

            // Hide dropdown menu item
            for (elt of document.querySelectorAll('.show')) {
                elt.classList.remove('show');
            }
        }
    })
}

// Hide/show auto-number modal
toggleAutoNumberModal=(show, group, execute) => {
    // Hide Modal
    if (!show||!group) {
        document.getElementById('auto-number-input').value=null;
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('auto-number-modal').style.display=null;
        if (execute) {
            group=document.getElementById('auto-number-modal-group-display').innerText.slice(1);
            let preserve=document.getElementById('auto-number-modal-preserve-numbers-checkbox').checked;
            let prevItems=dataView.getItems();
            let numberStartMap={}
            for (g of getGroupValues(group)) {
                if (g) {
                    numberStartMap[g]=document.getElementById(`${g}-auto-number-input`).value;
                }
            }
            autoNumberData(group, numberStartMap, preserve, prevItems);
        }
    }
    // Show modal
    else {
        for (elt of document.querySelectorAll('.dropdown-menu')) { elt.classList.remove('show') }
        document.getElementById('auto-number-modal-groups-display').innerHTML=``;
        for (g of getGroupValues(group)) {
            if (g) {
                document.getElementById('auto-number-modal-groups-display').innerHTML+=`
                <div style="display: flex; justify-content: space-between; width: 100%;">
                <div><b>${g}<b>:</div>
                <input id="${g}-auto-number-input" style="width: 50px;" onkeydown="validateModalInput(event, 'number')"> 
                </div
                `
            }
        }
        document.getElementById('auto-number-modal-group-display').innerText=`\xa0${group}`;
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('auto-number-modal').style.display='flex';
        document.getElementById('auto-number-input').focus();
    }
}

getGroupValues=(group) => {
    let groups=[];
    for (item of dataView.getItems()) {
        if (!groups.includes(item[group])) {
            groups.push(item[group]);
        }
    }
    return groups.sort((a, b) => { return stableSort(a, b, true, group) });
}

// Auto-numbers data based on group and increment, and preserves existing numbering if preserve is selected
autoNumberData=(group, numberStartMap, preserve, prevItems) => {
    let editCommand={ type: 'autoNumber' }

    let prevItemNumMap={};
    for (item of prevItems) {
        prevItemNumMap[`${item.id}`]=item['#'];
    }

    if (!_contextCell) {
        editCommand.row=0;
        editCommand.cell=0;
    } else {
        editCommand.row=_contextCell.row;
        editCommand.cell=_contextCell.cell;
    }
    editCommand.execute=executeAutoNumberData;
    editCommand.undo=undoAutoNumberData;
    editCommand.group=group;
    editCommand.preserve=preserve;
    editCommand.prevItemNumMap=prevItemNumMap;
    editCommand.numberStartMap=numberStartMap;

    queueAndExecuteEdit(false, false, editCommand);
}

// execute auto-number and add command to the undoredo buffer
function executeAutoNumberData() {
    let items=dataView.getItems().sort((a, b) => { return stableSort(a, b, true, this.group) });
    let countMap={}

    for (key in this.numberStartMap) {
        countMap[key]=this.numberStartMap[key];
    }

    for (item of items) {
        let cMapVal=countMap[item[this.group]];
        if (cMapVal) {
            if (this.preserve) { if (!item['#']) { item['#']=cMapVal } }
            else { item['#']=cMapVal }
            countMap[item[this.group]]++;
        }
    }

    dataView.setItems(items);
    grid.invalidate();
    grid.setData(dataView);
    grid.render();
}

// undo an auto-number command
function undoAutoNumberData() {
    let items=dataView.getItems();
    for (item of items) {
        item['#']=this.prevItemNumMap[`${item.id}`];
    }
    dataView.setItems(items);
    grid.invalidate();
    grid.setData(dataView);
    grid.render();
}

// Custom sorting algorithm for numbers, strings, and dates
stableSort=(a, b, sortAsc, field, tiebreak='Set Code') => {
    if (_args.section=='Crew') { tiebreak='Date Joined' }
    if (!a||!b) { if (sortAsc) { return 1 } else { return 0 } }
    aTie=a[tiebreak]
    bTie=b[tiebreak]
    a=a[field]
    b=b[field]

    // Sort Dates
    if (field.toLowerCase().includes('date')) {
        a=new Date(a).getTime();
        b=new Date(b).getTime();
    }

    // Sort numbers
    let aNum=parseFloat(a);
    let bNum=parseFloat(b);
    if (!a) { if (sortAsc) { aNum=Infinity } else { aNum=-Infinity } }
    if (!b) { if (sortAsc) { bNum=Infinity } else { bNum=-Infinity } }
    let aNumTie=parseFloat(aTie);
    let bNumTie=parseFloat(bTie);
    if (!isNaN(aNum)&&!isNaN(bNum)) {
        if (sortAsc) { if (aNum==bNum) { if (aNumTie>bNumTie) { return 1 } if (bNumTie>aNumTie) { return -1 } return 0 } return aNum-bNum }
        else { if (bNum==aNum) { if (bNumTie>aNumTie) { return 1 } if (aNumTie>bNumTie) { return -1 } return 0 } return bNum-aNum }
    }
    // Else sort alphabetical
    else {
        if (!a) { if (sortAsc) { a='ZZZZZZZZZ' } else { a='AAAAAAAAA' } }
        if (!b) { if (sortAsc) { b='ZZZZZZZZZ' } else { b='AAAAAAAAA' } }
        if (sortAsc) { if (a>b) { return 1 } if (b>a) { return -1 } return 0 }
        else { if (b>a) { return 1 } if (a>b) { return -1 } return 0 }
    }
}

// Updates the Slick.grid's displayed save status
updateSaveStatus=(saved) => {
    let originalStatus=document.getElementById('save-status').innerText;
    if (originalStatus=='saved') { originalStatus=true }
    else { originalStatus=false }

    let newStatus;

    let statusElement=document.getElementById('save-status');
    if (saved) {
        statusElement.innerText='saved';
        statusElement.style.color='rgb(24, 135, 86)';
        newStatus=true;
        _dataSaved=true;
    }
    else {
        statusElement.innerText='unsaved';
        statusElement.style.color='red';
        newStatus=false;
        _dataSaved=false;
    }

    return [originalStatus, newStatus];
}

// Cell Edit execute and edit
queueAndExecuteEdit=(item, column, command) => {
    _editDirectionForwards=true;
    command.saveStatus=updateSaveStatus(false);
    command.prevCellStyles=JSON.parse(JSON.stringify(_cellCssStyles))

    undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr]=command;
    undoRedoBuffer.commandCtr++;
    command.execute();
}

undoCellEdit=() => {
    _editDirectionForwards=false;
    if (undoRedoBuffer.commandCtr<=0) { return }
    undoRedoBuffer.commandCtr--;
    var command=undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr];
    updateSaveStatus(command.saveStatus[0]);

    revertCellStyles(command)

    if (command&&Slick.GlobalEditorLock.cancelCurrentEdit()) {
        if (command.row&&command.cell) {
            grid.setActiveCell(command.row, command.cell);
        }
        command.undo();
    }
}

redoCellEdit=() => {
    _editDirectionForwards=true;
    if (undoRedoBuffer.commandCtr>=undoRedoBuffer.commandQueue.length) { return; }
    var command=undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr];
    updateSaveStatus(command.saveStatus[1]);

    undoRedoBuffer.commandCtr++;

    if (command&&Slick.GlobalEditorLock.cancelCurrentEdit()) {
        if (command.row&&command.cell) {
            grid.setActiveCell(command.row, command.cell, false);
        }
        command.execute();
    }
}

// Restore cell styles before edit
revertCellStyles=(command) => {
    // Clear Styles
    for (style in _cellCssStyles) {
        grid.removeCellCssStyles(style)
    }
    _cellCssStyles={}

    // Apply Previous Styles
    applyCellStyles(command.prevCellStyles)
}

// Apply cell styles defined by styles
applyCellStyles=(styles) => {
    for (style in styles) {
        let rowHash={}
        for (id in styles[style]) {
            let row=dataView.mapIdsToRows([id])[0]
            rowHash[row]=styles[style][id]
        }
        grid.setCellCssStyles(style, rowHash)
    }
}

// Add row(s) function 
rowCreator=(count=1, isAfterPaste=false) => {
    if (_groupedBy) {
        _contextCell=grid.getActiveCell();
        addRow(count, 'below', isAfterPaste);
    } else {
        for (var i=0; i<count; i++) {
            var item={ id: "newRow_"+newRowIds++ }
            grid.getData().addItem(item);
        }
    }
}

// Hides or shows the 'Add Column' Modal for the Slick.grid
toggleAddColumnModal=(show, direction) => {
    // Hide Modal
    if (!show) {
        let cname=document.getElementById('add-column-input').value;
        document.getElementById('add-column-input').value=null;
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('add-column-modal').style.display=null;
        return cname;
    }
    // Show modal
    else {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('add-column-modal').style.display='flex';
        document.getElementById('add-column-direction').innerText=direction;
        document.getElementById('add-column-input').focus();

        if (['Crew', 'Rentals', 'Purchases'].includes(_args.section)) {
            document.getElementById('add-column-modal-tax-column-selector').style.display='flex'
        }
    }
}

// Returns an array containing true at indices of groups that are collapsed, and false for those that are not
getCollapsedGroups=() => {
    let groups=dataView.getGroups();
    if (!groups) { return false }
    let collapsedGroups=[];
    for (let i=0; i<groups.length; i++) {
        collapsedGroups[i]=groups[i].collapsed;
    }
    return collapsedGroups;
}

// Returns the current column order
getColumnOrder=() => {
    let cols=grid.getColumns()
    let order=[];
    for (col of cols) {
        order.push(col.id);
    }
    return order;
}

// Add a column to grid
addColumn=() => {
    let command={ type: 'editColumn' }

    command.execute=executeAddColumn
    command.direction=document.getElementById('add-column-direction').innerText
    command.undo=undoAddColumn
    command.colName=toggleAddColumnModal(false)
    command.idx=grid.getColumnIndex(_contextCell.id)
    command.islongtext=document.getElementById('add-column-editor-selector').checked
    command.istaxcolumn=document.getElementById('add-tax-column-editor-selector').checked

    queueAndExecuteEdit(null, null, command)
}

// 'Execute' function for add column
async function executeAddColumn() {
    let cols=await grid.getColumns();
    let beforeCols=cols.slice(0, parseInt(this.idx)+parseInt(this.direction));
    let afterCols=cols.slice(parseInt(this.idx)+parseInt(this.direction));
    let newColumn={
        id: this.colName,
        name: this.colName,
        field: this.colName,
        width: 150,
        editor: Slick.Editors.Text,
        deletable: true,
        sortable: true
    }

    if (this.istaxcolumn) {
        newColumn.cssClass='tax-column'
        newColumn.istaxcolumn=this.istaxcolumn
        newColumn.width=60
        _taxColumns.push(this.colName)

        await calculateAllWeeklyTotals()
    } else {
        if (this.islongtext) { newColumn.editor=Slick.Editors.LongText }
        _extraColumns.push(this.colName);
    }


    await beforeCols.push(newColumn);
    await beforeCols.push(...afterCols);
    await grid.setColumns(beforeCols);
}

// 'Undo' function for add column
async function undoAddColumn() {
    let idx=grid.getColumnIndex(this.colName);
    let cols=await grid.getColumns();
    cols.splice(idx, 1);
    await grid.setColumns(cols);

    if (this.istaxcolumn) {
        // *****ONLY CHANGE TAX COLUMNS FOR CURRENT SECTION (RENTALS PURCHASE OR CREW PAGE)*****
        _taxColumns.splice(_week.crew.taxColumns.indexOf(this.colName), 1)
        await calculateAllWeeklyTotals()
    } else {
        _extraColumns.splice(_extraColumns.indexOf(this.colName), 1);
    }
}

// Deletes context column
deleteColumn=() => {
    let command={ type: 'editColumn' };
    command.execute=executeDeleteColumn;
    command.undo=undoDeleteColumn;
    command.idx=grid.getColumnIndex(_contextCell.name);
    command.column=_contextCell;
    queueAndExecuteEdit(null, null, command);
}

// 'Execute' function for delete column
async function executeDeleteColumn() {
    let cols=await grid.getColumns();
    cols.splice(this.idx, 1);
    let cName=this.column.name;

    if (this.column.istaxcolumn) {
        _taxColumns.splice(_week.crew.taxColumns.indexOf(cName), 1)

        await calculateAllWeeklyTotals()
    } else {
        if (_extraColumns.includes(cName)) {
            await _extraColumns.splice(_extraColumns.indexOf(`${cName}`), 1);
        }
    }

    await grid.setColumns(cols);
}

// 'Undo' function for delete column
async function undoDeleteColumn() {
    let cols=grid.getColumns();
    await cols.splice(this.idx, 0, this.column);
    await grid.setColumns(cols);

    if (this.column.istaxcolumn) {
        _taxColumns.push(this.column.name)
        await calculateAllWeeklyTotals()
    } else {
        await _extraColumns.push(this.column.name);
    }
}

// Select all rows
selectAll=() => {
    let allRows=[];
    for (let i=0; i<dataView.getItems().length; i++) {
        allRows.push(i);
    }
    grid.setActiveCell(0, 0);
    grid.setSelectedRows(allRows);

}

// duplicates an array
duplicateArray=(array) => {
    let array2=[];
    for (let i=0; i<array.length; i++) {
        array2[i]=array[i];
    }
    return array2;
}

// Sum totals formatter for footer totals
sumTotalsFormatter=(totals, columnDef) => {
    var val=totals.sum&&totals.sum[columnDef.field];
    if (val!=null) {
        return new Intl.NumberFormat().format((Math.round(parseFloat(val)*100)/100));
    }
    return "";
}

// Sum totals formatter for footer totals
sumTotalsDollarsFormatter=(totals, columnDef) => {
    var val=totals.sum&&totals.sum[columnDef.field];
    if (val!=null) {
        // --> SLICE is because the css styles now add the $ symbol so we must remove this one
        return formatter.format((Math.round(parseFloat(val)*100)/100)).slice(1);
    }
    return "";
}

// Sum totals formatter for footer totals
avgPercentFormatter=(totals, columnDef) => {
    var val=totals.avg&&totals.avg[columnDef.field];
    if (val!=null) {
        return `(Avg) ${val.toFixed(0)}`
    }
    return "";
}

// Count totals formatter for footer totals
countTotalsFormatter=(totals, columnDef) => {
    let count=0;
    for (row of totals.group.rows) {
        if (row[columnDef.field]>0) { count++ }
    }
    var val=totals.sum&&totals.sum[columnDef.field];
    var ttl=0;
    if (val!=null) {
        ttl=new Intl.NumberFormat().format((Math.round(parseFloat(val)*100)/100));
    }
    return `${ttl} (${count} Crew)`;
}

// Apply saved display settings to grid
applyDisplaySettings=async (displaySettings) => {
    // Execute groupBy first if it exists
    if (Object.keys(displaySettings).includes('groupBy')) {
        await groupBy(displaySettings.groupBy);
        delete displaySettings.groupBy;
    }
    for (key in displaySettings) {
        await window[key](displaySettings[key]);
    }
}

// Converts YYYY-MM-DD to MM/DD/YYYY
convertDateFromMongooseToGridFormat=(date) => {
    return `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`
}

// Hides or shows the 'Invalid Setcode' Modal for the Slick.grid
toggleValidationModal=(show, validator=null) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('validation-modal').style.display=null;
        let command=undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr-1];
        if (command.type=="paste") {
            markInvalidCells()
        }
        else { undoCellEdit() }
        grid.focus()
    }
    // Show modal
    else {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('validation-modal').style.display='flex';
        document.getElementById('validation-modal').focus()
        document.getElementById('validation-modal-header').innerText=validator.validationHeader;
        document.getElementById('validation-modal-message').innerText=validator.validationMessage;
    }
}

markInvalidCells=() => {

}

// Runs validators for slick grid cells
runValidators=(validators, args) => {
    if (!_editDirectionForwards) { return }

    // runn all validators
    for (v of validators) {
        validateEdit(v, args);
    }
}

// Runs validator on the cell edit data in args
validateEdit=(validator, args) => {
    let cols=grid.getColumns()
    for (field of validator.fields) {
        // Only validate field if it is not restricted by _accessProfile
        if (!_accessProfile.columnFilter.filter.includes(field)) {
            if (cols[args.cell].field==field) {
                if (validator.isInvalid(args, field)) {
                    // Mark invalid cell red
                    let invalidCells=grid.getCellCssStyles('invalidCells')||{}
                    if (!invalidCells[args.row]) { invalidCells[args.row]={} }
                    invalidCells[args.row][grid.getColumns()[args.cell].field]='invalid-cell'
                    grid.setCellCssStyles('invalidCells', invalidCells)
                    // Scroll to invalid cell
                    grid.scrollCellIntoView(args.row, args.cell)
                    // If invalid, show validation modal
                    toggleValidationModal(true, validator);
                } else {
                    clearInvalidCellMarker(args)
                }
            }
        }
    }
}

clearInvalidCellMarker=(args) => {
    // Remove cell invalid style if it exists
    let invalidCells=grid.getCellCssStyles('invalidCells')
    if (invalidCells&&invalidCells[args.row]) {
        let field=grid.getColumns()[args.cell].field
        let cellStyle=invalidCells[args.row][field]
        if (cellStyle=='invalid-cell') {
            delete invalidCells[args.row][field]
            grid.setCellCssStyles('invalidCells', invalidCells)
        }
    }
}

// Returns true if invalid cells remian in the grid
invalidCellsRemain=() => {
    for (s in _cellCssStyles) {
        let style=_cellCssStyles[s]
        for (r in style) {
            let row=style[r]
            for (field in row) {
                if (row[field].includes('invalid-cell')) {
                    let cols=grid.getColumns()
                    let cell=cols.indexOf(cols.find(c => c.field==field))
                    grid.scrollCellIntoView(row, cell)
                    return true
                }
            }
        }
    }
    return false
}

// Updates the totals row
updateTotalsRow=() => {
    document.getElementById('grid-footer').style.display='flex';
    let totalsRow=document.getElementById('grid-footer-totals');
    let innerText='';
    let allTotals={};
    for (field in _totals) {
        let val=getTotal(field, _totals[field]);
        allTotals[field]=val;
        innerText+=`\xa0\xa0${val}\xa0(${field})`;
    }
    totalsRow.innerText=innerText;

    return allTotals;
}

// Gets specified 'type' of total from the grid's items
getTotal=(field, type) => {
    let items=dataView.getItems();
    switch (type) {
        case 'sum':
            return sumItems(items, field);
        case 'avg':
            return avgItems(items, field);
    }
}

// Returns a sum of the grid's items' 'field' types
sumItems=(items, field) => {
    let sum=0
    for (item of items) {
        if (item[field]) {
            let val=parseFloat(item[field]);
            if (!isNaN(val)) { sum+=val }
        }
    }
    return formatter.format(sum);
}

// Returns an average of the grid's items' 'field' types
avgItems=(items, field) => {
    let f=field.toLowerCase();
    let sum='NaN';
    let count=0;
    for (item of items) {
        if (item[f]) {
            if (sum=='NaN') { sum=0 }
            let str=item[f].toString();
            sum+=parseFloat(str);
            count++;
        }
    }
    return new Intl.NumberFormat().format(sum/count);
}

// Calculates and sets the current week ending based on the show's first week ending
setWeekEnding=() => {
    if (_args.isFirstEstimate) {
        toggleEnterVersionModal(true, true, false)
        return
    }
    _week=_args.week

    // If in estimate page, show the version in the week ending display, and the date created in the toolbar
    if (_args.section=='Estimate') {
        let dateCreatedText=`Date Created: ${new Date(_show.estimateVersions[_version].dateCreated).toLocaleDateString('en-US')}`
        document.getElementById("date-created-display").innerText=dateCreatedText

        document.getElementById('week-ending-display').style.color='black'
        document.getElementById('week-ending-display').innerText=`Estimate Version: ${_version}`
        document.getElementById('week-ending-display-container').onclick=function () { toggleOpenVersionModal(true) }

        // Add latest indicator if in latest version
        if (_version==_sortedVersionKeys[0]) {
            document.getElementById('week-ending-display-container').style.color='grey'
            document.getElementById('week-ending-display-container').innerHTML+='&nbsp- Latest'
        }

    } else {
        let weekEnd=new Date(_week.end)
        let weekEndingText=`Week ${_args.weekList.indexOf(_args.weekList.find(w => w._id==_week._id))+1} (Ending: ${weekEnd.toLocaleDateString('en-US')})`
        if (_args.weekList[_args.weekList.length-1]._id==_week._id) {
            document.getElementById('week-ending-latest-indicator').style.display='flex'
        }
        document.getElementById('week-ending-display').innerText=weekEndingText

    }
}

// Toggles delete week warning modal and deletes week if specified
toggleDeleteWeekWarningModal=(show, weekNum, weekId, deleteWeek=false) => {
    if (!show) {
        document.getElementById('delete-week-warning-modal').style.display=null
        document.getElementById('week-ending-modal').style.display='flex'

        if (deleteWeek) {
            weekNum=parseFloat(document.getElementById('delete-week-warning-modal-number').innerText)
            weekId=document.getElementById('delete-week-warning-modal-storage').innerText
            _deletedWeek=weekId

            // Save original week number
            let currentWeekNum=parseInt(_args.weekList.indexOf(_args.weekList.find(w => w._id==_week._id)))+1

            // Delete week from weeklist
            _args.weekList.splice(_args.weekList.indexOf(_args.weekList.find(w => w._id==weekId)), 1)

            // If deleting current week, delete on server immediately and reload page to most recent week
            if (weekNum==currentWeekNum) {
                changeWeek(_args.weekList[_args.weekList.length-1]._id)
            } else {
                // Update grid to reflect week deletion
                updateSaveStatus(false)
                toggleWeekEndingModal(false)
                toggleWeekEndingModal(true)
                setWeekEnding()
                saveData()

                // Reset deleted week (week has been deleted by server)
                _deletedWeek=false
            }
        }
    } else {
        document.getElementById('week-ending-modal').style.display=null
        document.getElementById('delete-week-warning-modal').style.display='flex'
        document.getElementById('delete-week-warning-modal-number').innerText=weekNum
        document.getElementById('delete-week-warning-modal-storage').innerText=weekId
    }
}

// Toggle week ending modal
toggleWeekEndingModal=(show) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('week-ending-modal').style.display=null;
        grid.focus()
    }
    // Show modal
    else if (_args.section!='Estimate') {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('week-ending-modal').style.display='flex';
        document.getElementById('week-ending-modal').focus();

        let wemWC=document.getElementById('week-ending-modal-weeks-container');
        wemWC.innerHTML=null;

        for (i in _args.weekList) {
            let week=_args.weekList[i]
            let weekDivStyle=null

            // Underline if week is the current weeks
            if (week._id==_week._id) { weekDivStyle='text-decoration: underline;' }

            // Add delete button to weeks if there is more than one week
            let deleteButton=''
            if (_args.weekList.length>1) {
                deleteButton=`<button style='color: red' onclick='toggleDeleteWeekWarningModal(true, ${parseInt(i)+1}, "${week._id}")'>Delete</button>`
            }

            wemWC.innerHTML=`
            <div class="week-ending-modal-week" onclick="changeWeek('${week._id}')" style="${weekDivStyle}">
                Week ${parseInt(i)+1} (Ending: ${new Date(week.end).toLocaleDateString('en-US')})
            </div>` +deleteButton+wemWC.innerHTML

        }

    }
}

changeWeek=async (weekId, weekEnd=false, isNewWeek=false, copyCrewFrom='current') => {
    if (weekId==_week._id&&_deletedWeek!=_week._id) { return }
    if (_args.section!='Estimate') {
        _newWeek={ weekId, end: weekEnd, isNewWeek, copyCrewFrom }
        await toggleAddWeekModal(false)
        await toggleWeekEndingModal(false)
        await saveData(true)
    }
}

toggleAddWeekModal=(show, update) => {
    // Hide Modal
    if (!show) {
        if (update) {
            let weekEnd=new Date(document.getElementById('add-week-input').value+'T00:00')
            if (weekEnd=='Invalid Date') {
                document.getElementById('add-week-modal-input-warning').style.display='flex'
                return
            }
            let copyCrewFrom=''
            if (document.getElementById('add-week-radio-current').checked) { copyCrewFrom='current' }
            if (document.getElementById('add-week-radio-preceding').checked) { copyCrewFrom='preceding' }
            if (document.getElementById('add-week-radio-blank').checked) { copyCrewFrom='blank' }

            changeWeek(false, weekEnd, true, copyCrewFrom)
        }
        document.getElementById('add-week-modal-input-warning').style.display='none'
        document.getElementById('add-week-modal').style.display=null
        document.getElementById('week-ending-modal').style.display='flex'
        grid.focus()
    }
    // Show modal
    else {
        document.getElementById('add-week-radio-current').checked=true
        document.getElementById('week-ending-modal').style.display=null
        document.getElementById('grid-modal-container').style.display='flex'
        document.getElementById('add-week-modal').style.display='flex'
        document.getElementById('add-week-modal').focus()
    }
}

addTaxColumn=(colName) => {

}

// Returns array of dates representing the current week
getDaysOfCurrentWeek=(date=false) => {
    let day=date||new Date(_week.end);

    let days=[];
    for (let i=0; i<7; i++) {
        days.unshift(new Date(day-oneDay*i));
    }

    return days;
}

// Editor used for auto-complete input type
function AutoCompleteEditor(args) {
    var $input;
    var defaultValue;
    var scope=this;
    var calendarOpen=false;

    this.keyCaptureList=[Slick.keyCode.UP, Slick.keyCode.DOWN, Slick.keyCode.ENTER];

    this.init=function () {
        $input=$("<INPUT id='tags' class='editor-text' />");
        $input.appendTo(args.container);
        $input.on('focus').on('select');

        $input.autocomplete({
            source: args.column.dataSource
        });

        // Causes change to be immediately applied when dropdown menu is clicked
        document.querySelector('.ui-widget.ui-autocomplete').addEventListener('click', () => {
            grid.navigateUp()
            grid.navigateDown()
        })
    };

    this.destroy=function () {
        $input.autocomplete("destroy");
        $input.remove();
    };

    this.focus=function () {
        $input.focus();
    };

    this.loadValue=function (item) {
        defaultValue=item[args.column.field];
        $input.val(defaultValue);
        $input[0].defaultValue=defaultValue;
        $input.select();
    };

    this.serializeValue=function () {
        return $input.val();
    };

    this.applyValue=function (item, state) {
        item[args.column.field]=state;
    };

    this.isValueChanged=function () {
        isChanged=(!($input.val()==""&&defaultValue==null))&&($input.val()!=defaultValue);
        return isChanged;
    };

    this.validate=function () {
        return {
            valid: true,
            msg: null
        };
    };

    this.init();
}

// Automatically adjusts row numbers when a new row is added *** NOT USED ***
fixRowNumbers=async (num, id) => {
    let items=dataView.getItems();
    for (let i=0; i<items.length; i++) {
        if (items[i]['#']>=num&&items[i].id!=id) {
            if (_editDirectionForwards) { items[i]['#']++ }
            else { items[i]['#']--; }
        }
    }
    dataView.setItems(items);
}

// Sort data bu number property
sortByNumber=(data) => {
    return data.sort((a, b) => { return stableSort(a, b, true, '#') });
}

// Calculates the daily labor cost given multipliers, hours, rate, and day
calculateDailyLaborCost=(multipliers, hours, rate, day) => {
    let total=0;

    // Sort multipliers
    let multiplierKeys=Object.keys(multipliers).sort((a, b) => { return a-b });

    // Calculate the multiplied hours and total payout in each multiplier interval
    let totalNonUnitHours=0;
    for (let i=0; i<multiplierKeys.length; i++) {
        let multipliedHours=0;

        if (multiplierKeys[i+1]&&hours>multiplierKeys[i+1]) {
            multipliedHours=multiplierKeys[i+1]-multiplierKeys[i];
        } else if (hours>multiplierKeys[i]) {
            multipliedHours=hours-multiplierKeys[i]
        }

        total+=multipliedHours*multipliers[multiplierKeys[i]][day]*rate;
        totalNonUnitHours+=multipliedHours;
    }
    total+=(hours-totalNonUnitHours)*rate;

    return total;
}

// Save previous items to clipboard command and updates oldvalues. Used when a page does autofill
savePrevItemToCommand=(item, field) => {
    if (_editDirectionForwards) {
        let cq=undoRedoBuffer.commandQueue;
        let ctr=undoRedoBuffer.commandCtr;

        // Set previous items for current command if this is called as the result of a copy paste command
        if (cq[ctr-1].isClipboardCommand) {
            let h=cq[ctr-1].h;
            let w=cq[ctr-1].w;

            // Create previous items object on first copy paste action
            if (h==1&&w==1) {
                let previousItems=[];
                let items=dataView.getItems();
                for (let i=0; i<cq[ctr-1].destH; i++) {
                    let row=cq[ctr-1].activeRow+i;
                    if (_groupedBy) { row=getActualRow(row) }
                    let item=items[row];
                    let itemCopy={}
                    for (key in item) { itemCopy[key]=item[key] }
                    previousItems[i]=itemCopy;
                }
                let firstField=grid.getColumns()[cq[ctr-1].activeCell].field;
                previousItems[0][firstField]=cq[ctr-1].oldValues[0][0];

                cq[ctr-1].previousItems=previousItems;
            }

            // Fix the previous values because the auto fill changes them
            if (h==cq[ctr-1].destH&&w==cq[ctr-1].destW) {
                // Get edited fields
                let editedFields=[];
                let cols=grid.getColumns();
                for (let i=0; i<cq[ctr-1].destW; i++) {
                    editedFields.push(cols[cq[ctr-1].activeCell+i].field);
                }

                // Update command's old values
                for (let i=0; i<cq[ctr-1].destH; i++) {
                    for (let j=0; j<cq[ctr-1].destW; j++) {
                        cq[ctr-1].oldValues[i][j]=cq[ctr-1].previousItems[i][`${editedFields[j]}`]
                    }
                }
            }


        }
        else {
            cq[ctr-1].previousItem={}
            for (key in item) {
                cq[ctr-1].previousItem[key]=item[key];
            }
        }
    }
}

// Loads the previous item given the item argument (from command.previousItems). Used when a page does autofill
loadPrevItemFromCommand=(item) => {
    let cq=undoRedoBuffer.commandQueue;
    let ctr=undoRedoBuffer.commandCtr;

    return cq[ctr].previousItem
}

// Add department item to departmnents color bar
addToDepartmentsBar=(d, c, onclick) => {
    let dBar=document.getElementById('departments-bar');
    dBar.innerHTML+=`<div class="departments-bar-item ${c}" id="${d}_dbarItem" onclick="${onclick}">${d}</div>`;
    if (_args.section=='CostReport') {
        document.getElementById('add-department-button').style.display='none';
    }
}

// Add any missing columns (happens after a cost report save when a new department has been added)
addMissingCols=(columns) => {
    for (col of columns) {
        let cols=grid.getColumns();
        let colFields=cols.map(c => c.field);
        if (!colFields.includes(col.field)) {
            grid.setColumns(cols.concat([col]))
        }
    }

}

// Get widths from grid columns and retun a map object
getColumnWidths=() => {
    let cols=grid.getColumns();
    let colWidthMap={};
    for (col of cols) {
        if (col.isHidden) {
            colWidthMap[col.field]=col.colDef.width;
        } else {
            colWidthMap[col.field]=col.width;
        }
    }
    return colWidthMap;
}

// Set column widths from map object
setColumnWidths=(columnWidthMap) => {
    let cols=grid.getColumns();
    for (col of cols) {
        col.width=columnWidthMap[col.field];
    }
    grid.setColumns(cols);
}

// Clears deleted items ** ADD TO UNDO REDO BUFFER **
clearDeletedItems=() => {
    let items=dataView.getItems()
    let reqForSaveCols=grid.getColumns().filter(c => c.cssClass&&c.cssClass.includes('required-for-save'))
    for (item of items) {
        for (col of reqForSaveCols) {
            if (!item[col.field]) {
                dataView.updateItem(item.id, { id: item.id })
            }
        }
    }
}

// Add the appropriate css class <style> element to the document body
addDepartmentCssClass=(d, newColor=false) => {
    if (newColor) {
        document.getElementById(`${d.replaceAll(" ", "")}_cssClassElement`).remove();
        _show.departmentColorMap[d]=newColor;
        updateSaveStatus(false);
    }

    var departmentStyle=document.createElement('style');
    departmentStyle.id=`${d.replaceAll(" ", "")}_cssClassElement`;
    let color=_show.departmentColorMap[d];

    // Create new color if adding new department
    if (!color) {
        updateSaveStatus(false);
        let hexVals=['a', 'b', 'c', 'd', 'e', 'f', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        color='#';
        for (let i=0; i<6; i++) { color=color.concat(hexVals[randInt(0, hexVals.length)]) }
        _show.departmentColorMap[d]=color;
    }

    // Set text color to white if dark colour is chosen, and black otherwise
    let textColor='black';
    if (lightOrDark(color)=='dark') { textColor='white' }

    departmentStyle.innerHTML=`.${d.replaceAll(" ", "")}_cssClass {background: ${color} !important; color: ${textColor} !important;}`
    document.head.appendChild(departmentStyle);
}

// Gets a rand int between min and max
randInt=(min, max) => {
    return Math.floor(Math.random()*(max-min)+min);
}

// Returns light if a color is light, or dark if it is dark
lightOrDark=(color) => {

    // Variables for red, green, blue values
    var r, g, b, hsp;

    // Check the format of the color, HEX or RGB?
    if (color.match(/^rgb/)) {

        // If RGB --> store the red, green, blue values in separate variables
        color=color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/);

        r=color[1];
        g=color[2];
        b=color[3];
    }
    else {

        // If hex --> Convert it to RGB: http://gist.github.com/983661
        color=+("0x"+color.slice(1).replace(
            color.length<5&&/./g, '$&$&'));

        r=color>>16;
        g=color>>8&255;
        b=color&255;
    }

    // HSP (Highly Sensitive Poo) equation from http://alienryderflex.com/hsp.html
    hsp=Math.sqrt(
        0.299*(r*r)+
        0.587*(g*g)+
        0.114*(b*b)
    );

    // Using the HSP value, determine whether the color is light or dark
    if (hsp>127.5) {

        return 'light';
    }
    else {

        return 'dark';
    }
}

// Hides and shows columns in range
hideColumns=(hide, range) => {
    let editCommand={ type: 'hideColumns' }

    editCommand.prevCols=[]
    for (col of grid.getColumns()) {
        editCommand.prevCols.push(Object.assign({}, col))
    }

    editCommand.hide=hide
    editCommand.range=range

    editCommand.execute=executeHideColumns
    editCommand.undo=undoHideColumns

    queueAndExecuteEdit(null, null, editCommand)
}

function executeHideColumns() {
    let cols=grid.getColumns();
    if (this.hide) {
        for (let i=this.range[0]; i<=this.range[1]; i++) {
            if (!cols[i].isHidden) {
                hideColumn(true, cols[i]);
            }
        }
    } else {
        for (let i=this.range[0]; i<=this.range[1]; i++) {
            if (cols[i].isHidden&&!cols[i].lockHidden) {
                cols[i]=cols[i].colDef;
            }
        }
    }

    grid.setColumns(cols);
}

function undoHideColumns() {
    let copyCols=[]
    for (col of this.prevCols) {
        copyCols.push(Object.assign({}, col))
    }
    grid.setColumns(copyCols)
}

// Hides and shows individual columns
hideColumn=(hide, col=_contextCell) => {
    // Get col when context menu shown on cell that isn't a header
    if (!col.id) { col=grid.getColumns()[col.cell] }

    if (hide) {
        col.colDef=Object.assign({}, col);
        col.minWidth=15;
        col.width=0;
        col.cssClass='hidden-column';
        col.headerCssClass='hidden-column';
        col.isHidden=true;
        col.sortable=false;
        col.editor=undefined
    } else if (!col.lockHidden) {
        col=col.colDef;
    }

    let newCols=grid.getColumns().map(c => c.id==col.id? col:c);
    grid.setColumns(newCols);
}

// Returns a string of html that displays the options for hiding and showing columns in the context menu
getHideColumnsOptions=(args=_contextCell) => {
    let options;

    if (args.id) {
        let cols=grid.getColumns();
        _contextCell.cell=cols.map(c => c.id).indexOf(args.id);
        args.cell=_contextCell.cell
    }

    // Show and hide individual columns
    if (grid.getColumns()[args.cell].isHidden) { options=`<li onclick='hideColumns(false, [${_contextCell.cell}, ${_contextCell.cell}])'>Show column</li>` }
    else { options=`<li onclick='hideColumns(true, [${_contextCell.cell}, ${_contextCell.cell}])'>Hide column</li>` }

    // Show and hide columns in selection range
    let ranges=grid.getSelectionModel().getSelectedRanges();
    if (ranges[0]&&ranges[0].isSingleCell&&!ranges[0].isSingleCell()
        &&_contextCell.cell<=ranges[0].toCell
        &&_contextCell.cell>=ranges[0].fromCell
        &&_contextCell.row<=ranges[0].toRow
        &&_contextCell.row>=ranges[0].fromRow) {
        options=`<li onclick='hideColumns(true, [${ranges[0].fromCell}, ${ranges[0].toCell}])'>Hide columns</li>`

        let cols=grid.getColumns();
        let hiddenInSelection=false;
        for (let i=ranges[0].fromCell; i<=ranges[0].toCell; i++) {
            if (cols[i].isHidden) {
                hiddenInSelection=true;
            }
        }
        if (hiddenInSelection) {
            options+=`<li onclick='hideColumns(false, [${ranges[0].fromCell}, ${ranges[0].toCell}])'>Show Hidden columns</li>`
        }
    }

    return options;
}

// Returns an array of the ids of all currently hidden columns
getHiddenColumns=() => {
    return grid.getColumns().filter(c => c.isHidden).map(c => c.id);
}

// Hides columns with ids in the hiddenColumnIds arguument
setHiddenColumns=(hiddenColumnIds) => {
    let cols=grid.getColumns();
    for (let i=0; i<cols.length; i++) {
        if (hiddenColumnIds.includes(cols[i].id)) {
            hideColumn(true, { cell: i });
        }
    }
}

// Parses number from currency string if it is a currency string
parseNumberFromCurrency=(val) => {
    let valNum=currency(val.toString().replaceAll(' ', '')).value;
    if (isNaN(valNum)) {
        return val
    } else {
        return valNum
    }
}

// Return Null if value is zero or nan
zeroNanToNull=(val) => {
    if (val==0||isNaN(val)||val==Infinity||val==-Infinity) { val=null }
    return val
}

// Hide and show the loading screen with spinner and message 'msg'
toggleLoadingScreen=(show, msg='Loading...') => {

    if (show) {
        document.getElementById('grid-modal-container').style.display='flex';
        if (!document.getElementById('loading-spinner')) {
            document.getElementById('grid-modal-container').innerHTML+=`
            <div id="loading-spinner" style="margin-top: 25%; display: flex; flex-direction: column; align-items: center">
                <div class="spinner-border text-light" role="status"></div>
                <br>
                <div style="color: white">${msg}</div>
            </div>
            `;
        }
    } else {
        document.getElementById('grid-modal-container').style.display=null;
        let elt=document.getElementById('loading-spinner');
        if (elt) { elt.remove() }
        grid.focus();
    }
}

// Gets grouped row number from an actual row number (for finding items of dataView) ******** FIX THIS ******
getGroupedRow=(row) => {
    if (!_groupedBy) { return row }
    let item=dataView.getItems()[row];

    let groups=dataView.getGroups();
    rowCount=0;
    for (let i=0; i<groups.length; i++) {
        rowCount++;
        if (groups[i].collapsed) {
            continue;
        }
        for (let j=0; j<groups[i].rows.length; j++) {
            if (groups[i].rows[j].id==item.id) { return rowCount }
            rowCount++;
            if (j==groups[i].rows.length-1) { rowCount++ }
        }
    }

    return false
}

// Hide and show 'auto fill range' modal
toggleAutoFillRangeModal=(show, execute=false) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('auto-fill-range-modal').style.display=null;
        if (execute) {
            let startInput=document.getElementById('auto-fill-range-input-start');
            let endInput=document.getElementById('auto-fill-range-input-end');
            let incrementInput=document.getElementById('auto-fill-range-input-increment');
            let start=startInput.value;
            let end=endInput.value;
            let increment=parseFloat(incrementInput.value)||1
            autoFillRange(start, end, increment);
            startInput.value=null;
            endInput.value=null;
            incrementInput.value=null;
        }
        grid.focus()
    }
    // Show modal
    else {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('auto-fill-range-modal').style.display='flex';
        document.getElementById('auto-fill-range-input-start').focus();
    }
}

// Auto fill a range of numbers starting from active cell
autoFillRange=(start, end, increment) => {
    let command={ type: 'autoFillRange' }
    let activeCell=grid.getActiveCell();
    if (!activeCell) { return }
    command.execute=executeAutoFillRange;
    command.undo=undoAutoFillRange;
    command.start=start;
    command.end=end;
    command.increment=increment;
    command.newValueMap={}
    command.oldValueMap={}
    command.row=activeCell.row;
    command.cell=activeCell.cell;
    command.field=grid.getColumns()[grid.getActiveCell().cell].field;

    let items=dataView.getItems();
    for (let i=0; i<=(end-start)/increment; i++) {
        let row=command.row+i;
        if (_groupedBy) { row=getActualRow(row) }
        let item=items[row];
        let newValue=parseFloat(start)+parseFloat(i*increment);
        command.oldValueMap[item.id]=item[command.field];
        command.newValueMap[item.id]=newValue;
    }

    queueAndExecuteEdit(null, null, command);

}

// Execute/redo auto fill range command using to undoRedoBuffer
function executeAutoFillRange() {
    for (id in this.newValueMap) {
        let item=dataView.getItemById(id);
        item[this.field]=this.newValueMap[id];
        dataView.updateItem(id, item);
    }
    grid.focus();
}

// Undo auto fill range command using to undoRedoBuffer
function undoAutoFillRange() {
    for (id in this.newValueMap) {
        let item=dataView.getItemById(id);
        item[this.field]=this.oldValueMap[id];
        dataView.updateItem(id, item);
    }
    grid.focus();
}

// Blur and focus element (fixes input issues in safari)
refocusElement=(elt) => {
    elt.blur();
    elt.focus();
}

// Reorder departments based on the departments bar
reorderDepartments=function () {
    let depts=getDeptOrder()
    _show.departments=depts;

    let columns=grid.getColumns();
    let deptCols=[];
    for (d of depts) {
        deptCols.push(...(columns.filter(c => c.field.includes(d))));
    }

    let nonDeptCols=columns.filter(c => {
        for (d of depts) {
            if (c.field.includes(d)||c.field=='___ExtraColumn___') { return false }
        }
        return true
    })

    // Add extra column at the end 
    let newColumns=nonDeptCols.concat(deptCols);
    let xtraCol=columns.find(c => c.id=='___ExtraColumn___');
    if (xtraCol) { newColumns=newColumns.concat(xtraCol) }

    grid.setColumns(newColumns);

    createReorderDepartmentsCommand()
    _prevColumns=grid.getColumns()
    _prevDepartmentOrder=getDeptOrder()
}

// Generate Qeueable reorder departments command
createReorderDepartmentsCommand=() => {
    let editCommand={ type: 'reorderDepartments' }

    editCommand.saveStatus=_dataSaved
    editCommand.newCols=grid.getColumns()
    editCommand.oldCols=JSON.parse(JSON.stringify(_prevColumns))
    editCommand.initialAction=true
    editCommand.oldDeptOrder=_prevDepartmentOrder
    editCommand.newDeptOrder=getDeptOrder()

    editCommand.execute=executeReorderDepartments
    editCommand.undo=undoReorderDepartments


    queueAndExecuteEdit(null, null, editCommand)
}

// Execute and queue reorder departments command
function executeReorderDepartments() {
    if (this.initialAction) {
        this.initialAction=false
    } else {
        let depElts=document.querySelectorAll('.departments-bar-item')
        let dBar=document.getElementById('departments-bar')
        dBar.innerHTML=null
        for (dep of this.newDeptOrder) {
            let elt
            for (e of depElts) {
                if (dep==e.id.slice(0, e.id.indexOf('_'))) {
                    elt=e
                }
            }
            dBar.appendChild(elt)
        }
        _show.departments=this.newDeptOrder

        grid.setColumns(this.newCols)
        grid.invalidate()
        grid.render()
        grid.focus()
        _prevColumns=this.newCols
        _prevDepartmentOrder=this.newDeptOrder
    }
}

// Undo reorder departments command and decrease queue counter
function undoReorderDepartments() {
    let depElts=document.querySelectorAll('.departments-bar-item')
    let dBar=document.getElementById('departments-bar')
    dBar.innerHTML=null
    for (dep of this.oldDeptOrder) {
        let elt
        for (e of depElts) {
            if (dep==e.id.slice(0, e.id.indexOf('_'))) {
                elt=e
            }
        }
        dBar.appendChild(elt)
    }
    _show.departments=this.oldDeptOrder

    grid.setColumns(this.oldCols)
    grid.invalidate()
    grid.render()
    grid.focus()
    _prevColumns=this.oldCols
    _prevDepartmentOrder=this.oldDeptOrder
}

// Return an array of the show's departments in correct order
getDeptOrder=() => {
    let elts=document.querySelectorAll('.departments-bar-item');
    let depts=[];
    for (elt of elts) {
        depts.push(elt.id.slice(0, elt.id.indexOf('_')));
    }
    return depts
}

// Run all validators, mnarking all invalid cells invalid but don't show validation modal
runAllValidators=() => {
    let invalidCells=grid.getCellCssStyles('invalidCells')||{}
    let cols=grid.getColumns()
    let scrollToCell=false
    for (item of dataView.getItems()) {
        if (!isEmpty(item)) {
            for (v of _validators) {
                if (!v.skipOnSave) {
                    for (field of v.fields) {
                        // Only validate field if it is not restricted by _accessProfile
                        if (!_accessProfile.columnFilter.filter.includes(field)) {
                            let args={ item: item }
                            let row=dataView.getRowByItem(item)
                            if (v.isInvalid(args, field)) {
                                if (!invalidCells[row]) { invalidCells[row]={} }
                                invalidCells[row][field]='invalid-cell'
                                scrollToCell={ row: row, cell: cols.indexOf(cols.find(c => c.field==field)) }
                            } else if (invalidCells[row]&&invalidCells[row][field]&&invalidCells[row][field].includes('invalid-cell')) {
                                delete invalidCells[row][field]
                            }
                        }
                    }
                }
            }
        }
    }

    // Scroll to last errant cell if any exist
    if (scrollToCell) {
        let selectedRange=grid.getSelectionModel().getSelectedRanges()[0]
        if (selectedRange) {
            if (scrollToCell.row>=selectedRange.fromRow&&
                scrollToCell.row<=selectedRange.toRow&&
                scrollToCell.cell>=selectedRange.fromCell&&
                scrollToCell.cell<=selectedRange.toCell) {
                grid.scrollCellIntoView(scrollToCell.row, scrollToCell.cell)
            }
        } else {
            grid.scrollCellIntoView(scrollToCell.row, scrollToCell.cell)
        }
    }

    // Mark all errant cells red
    grid.setCellCssStyles('invalidCells', invalidCells)
}

// Warn if there are blank required for save fields on save (for non-blank items)
blankRequiredWarning=() => {
    // Return true if empty required for save cells are found
    let requiredCols=grid.getColumns().filter(c => c.cssClass&&c.cssClass.includes('required-for-save'))
    for (item of dataView.getItems()) {
        if (!isEmpty(item)) {
            for (col of requiredCols) {
                if (!item[col.field]) {
                    toggleBlankRequiredWarningModal(true)
                    grid.scrollCellIntoView(dataView.getRowByItem(item), grid.getColumns().indexOf(col))
                    return true
                }
            }
        }
    }

    return false
}

// Hides and show the warning modal when required fields are blank for non-empty rows
toggleBlankRequiredWarningModal=(show, save=false) => {
    if (show) {
        document.getElementById('grid-modal-container').style.display='flex'
        document.getElementById('blank-required-warning-modal').style.display='flex'
    } else {
        document.getElementById('blank-required-warning-modal').style.display=null
        document.getElementById('grid-modal-container').style.display=null
        grid.focus()

        if (save) {
            _overrideBlankRFSWarning=true
            saveData()
            _overrideBlankRFSWarning=false
        }
    }
}

// Returns true if item has no populated fields
isEmpty=(item) => {
    colFields=grid.getColumns().map(c => c.field)
    for (field of colFields) {
        if (item[field]&&field!='#') {
            return false
        }
    }
    return true
}

// Select an entire row
selectRow=() => {
    let ranges=grid.getSelectionModel().getSelectedRanges()
    let selectedRows=[]
    if (ranges[0]) {
        for (let i=ranges[0].fromRow; i<=ranges[0].toRow; i++) {
            selectedRows.push(i)
        }
    } else {
        selectedRows.push(_contextCell.row)
    }
    grid.setSelectedRows(selectedRows)
    grid.focus()
}

// Validator for modal inputs
validateModalInput=(e, type) => {
    let navKeys=['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'Tab']

    // Integer Validator
    if (type=='integer'&&!navKeys.includes(e.key)) {
        e.target.value=zeroNanToNull(parseInt(e.target.value))
        e.preventDefault()
    }

    // Number Validator
    if (type=='number'&&!navKeys.includes(e.key)) {
        if (e.key=='.'&&!e.target.value.includes('.')) { return }
        else if (e.key=='-'&&!e.target.value.includes('-')) { return }
        else if ('1234567890'.split("").includes(e.key)) {
            e.target.value=e.target.value+e.key
            e.preventDefault()
        } else {
            e.preventDefault()
        }
    }
}

// Check if use wants to save before reloading
toggleCheckYesNoModal=(show, message) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('check-yes-no-modal').style.display=null;
        grid.focus()
    }
    // Show modal
    else {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('save-check-modal').style.display='flex';
        document.getElementById('check-yes-no-modal-message').innerText=message;
    }
}

// Hide and sshow access profiles modal
toggleAccessProfilesModal=(show) => {
    if (show) {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('access-profiles-modal').style.display='flex';
    } else {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('access-profiles-modal').style.display=null;
    }
}

// Applies acces profile to hide restricted columns
hideRestrictedColumns=(columns, IDkey) => {
    // Apply access profile column filter to hide restricted columns if _version exists
    if (_args.section=='Estimate'&&!_show.estimateVersions[_version]) { return [] }

    // initialize hidden columns display setting if it is empty
    if (!_displaySettings.setHiddenColumns) { _displaySettings.setHiddenColumns=[] }

    // Initialize all columns to restricted if accessProfile filter is whitelist
    let isWhitelist=_accessProfile.columnFilter.type=='w'
    if (isWhitelist) {
        _displaySettings.setHiddenColumns=_displaySettings.setHiddenColumns.concat(columns.map(c => c.field))
        columns=columns.map(c => { c.lockHidden=true; return c })
    }

    // Apply access profile column filter
    for (col of columns) {
        if (_accessProfile.columnFilter.filter.includes(col.field)) {
            if (isWhitelist) {
                _displaySettings.setHiddenColumns.splice(_displaySettings.setHiddenColumns.indexOf(col.field), 1)
                col.lockHidden=false
            } else {
                _displaySettings.setHiddenColumns.push(col.field)
                col.lockHidden=true
            }
        }
    }

    // Always show the IDkey column, but set to uneditable if it is restricted
    if (_displaySettings.setHiddenColumns.includes(IDkey)) {
        _displaySettings.setHiddenColumns.splice(_displaySettings.setHiddenColumns.indexOf(IDkey), 1)

        let idCol=columns[columns.indexOf(columns.find(c => c.field==IDkey))]
        idCol.lockHidden=false
        idCol.editor=undefined
        idCol.cssClass+=`\nuneditable`
    }

    columns=applyEditColumnFilter(columns)

    return columns
}

// Populates access profiles modal 
populateAccessProfileModal=(showAp=false, showPage=false, initialLoad=false) => {
    //Clear access profiles modal accordion
    let accessProfileAccordion=document.getElementById('access-profiles-accordion')
    accessProfileAccordion.innerHTML=''

    // If this is not the initial load of the page, set saveStatus to false
    if (!initialLoad)
        updateSaveStatus(false)

    // Create an accordion item for each accesss profile
    for (ap in _args.accessProfiles) {
        // Don't show access profiles with same or higher access level
        if (_args.accessProfiles[ap].accessLevel<=_args.accessProfiles[_args.accessProfileName].accessLevel) { continue }

        let apName=ap.replaceAll(" ", "")

        // Begin html for access profile
        let isCurrentProfile=''
        if (ap==showAp) { isCurrentProfile='show' }
        else if (ap==_args.accessProfileName&&!showAp) { isCurrentProfile='show' }

        let apAccordionItem=`
        <div class="accordion-item">
            <h2 class="accordion-header access-profiles-accordion-header" id="heading${apName}">
                 <div style="display: flex; justify-content: space-between;">
                    <button class="accordion-button shadow-none" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${apName}">
                       ${ap} 
                    </button>
                    <div style="color: green; white-space: nowrap; font-size: 1rem;">(Level ${_args.accessProfiles[ap].accessLevel})</div>
                </div>
                <div>
            </h2>
            <div id="collapse${apName}" class="accordion-collapse collapse ${isCurrentProfile}" data-bs-parent="#access-profiles-accordion">
                <div class="accordion-body" style="display: flex; flex-direction: column;">
                    <div class=" accordion" id="ap-sub-accordion-${apName}">
                        <div class="access-profiles-checkbox-container" style="grid-template-columns: 1fr 1fr 1fr">`

        // Add checkbox options for accessProfile options
        for (option in _args.accessProfiles[ap].options) {
            let optionName=option.replaceAll(" ", "")
            let value=''
            if (_args.accessProfiles[ap].options[option]) { value='checked' }
            apAccordionItem+=`
                    <div class="access-profiles-checkbox" id="${apName}-${optionName}-checkbox">
                        <input type="checkbox" style="margin-right: 5px" ${value}>
                        ${option}
                    </div>`
        }

        apAccordionItem+='</div>'


        // Generate html for each page in access profile
        for (apPage in _args.accessProfiles[ap]) {
            let apPageName=apPage.replaceAll(" ", "")
            if (['options', 'accessLevel'].includes(apPage)) { continue }

            // String to put into html to show accordion item for current access profile
            let isCurrentSection=""
            if (apPage==showPage) { isCurrentSection='show' }
            else if (apPageName==_args.section&&!showPage) { isCurrentSection='show' }

            // Get value for page access checkbox
            let pageAccess='checked'
            if (!_args.accessProfiles[ap][apPage].pageAccess) {
                pageAccess=''
            }

            // Start sub-accordion item 
            let subAccordionItem=`
            <div class="accordion-item" >
                <h2 class="accordion-header" id="heading${apName}-${apPageName}" style="flex-grow: 3;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                     <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${apName}-${apPageName}">
                         ${apPage}
                    </button>
                    <input id="${apName}-${apPageName}-pageAccess-checkbox" type="checkbox" ${pageAccess}>
                </div>
                </h2>
                <div id="collapse${apName}-${apPageName}" class="accordion-collapse collapse ${isCurrentSection}" data-bs-parent="#ap-sub-accordion-${apName}">
                    <div class="accordion-body ap-sub-accordion-page-container">
                        <div class="access-profiles-checkbox-container">`


            // Add checkbox options for accessProfile options
            for (option in _args.accessProfiles[ap][apPage].options) {
                let optionName=option.replaceAll(" ", "")
                let value=''
                if (_args.accessProfiles[ap][apPage].options[option]) { value='checked' }
                subAccordionItem+=`
                    <div class="access-profiles-checkbox" id="${apName}-${apPageName}-${optionName}-checkbox">
                        <input type="checkbox" style="margin-right: 5px" ${value}>
                        ${option}
                    </div>`

            }

            // End checkbox container 
            subAccordionItem+=`</div>`

            // Add items for dataFilter
            subAccordionItem+=generateDataFilterHtml(_args.accessProfiles[ap][apPage].dataFilter, ap, apPage, apName, apPageName, 'Access Data', 'dataFilter')

            // Add items for columnFilter
            subAccordionItem+=generateColumnFilterHtml(_args.accessProfiles[ap][apPage].columnFilter, ap, apPage, apName, apPageName, 'Access Columns', 'columnFilter')

            // Add items for dataFilter
            subAccordionItem+=generateDataFilterHtml(_args.accessProfiles[ap][apPage].editDataFilter, ap, apPage, apName, apPageName, 'Edit Data', 'editDataFilter')

            // Add items for columnFilter
            subAccordionItem+=generateColumnFilterHtml(_args.accessProfiles[ap][apPage].editColumnFilter, ap, apPage, apName, apPageName, 'Edit Columns', 'editColumnFilter')

            // End sub-accordion item
            subAccordionItem+=`</div></div></div>`

            // Append sub accordion item to the accordion item for this profile
            apAccordionItem+=subAccordionItem
        }

        // End accordion item and append it to the top level accordion container
        apAccordionItem+=`</div></div></div></div>`
        accessProfileAccordion.innerHTML+=apAccordionItem
    }
}

// Hide and show the modal to edit a cloumn and the restricted values for that column for the data filter 
toggleDataFilterModal=(show, ap=false, apPage=false, filterCol=false, newFilter=false, save=false, del=false, filterKey=null) => {
    if (show) {
        document.getElementById('data-filter-modal').style.display='flex';
        document.getElementById('access-profiles-modal').style.display=null
        document.getElementById('data-filter-modal-memory').innerText=JSON.stringify({ ap, apPage, filterCol, newFilter })
        document.getElementById('data-filter-modal-memory-filterKey').innerText=filterKey

        let memory=JSON.parse(document.getElementById('data-filter-modal-memory').innerText)

        // Set text to describle the filter 
        let filterActionText='access'
        let filterListTypeText='not'
        if (_args.accessProfiles[memory.ap][memory.apPage][filterKey].type=='w') { filterListTypeText='only' }
        if (filterKey=='editDataFilter') { filterActionText='edit' }

        if (newFilter) {
            document.getElementById('data-filter-modal-message').innerHTML=`
            Users assigned to the <b>${ap}</b> access profile will <b>${filterListTypeText}</b> be able to <b>${filterActionText}</b> items on the <b>${apPage}</b> with values in the column entered below that match values in the list entered below.`
            document.getElementById('data-filter-column-input').style.display='flex'
            document.getElementById('data-filter-column-input-label').style.display='flex'

            document.getElementById('data-filter-modal-delete').style.color='black'
            document.getElementById('data-filter-modal-delete').innerText='Cancel'
            document.getElementById('data-filter-modal-delete').setAttribute('onclick', 'toggleDataFilterModal(false)')
        } else {
            let currentValues=_args.accessProfiles[memory.ap][memory.apPage][filterKey].filter[filterCol].join(', ')

            document.getElementById('data-filter-modal-message').innerHTML=`
            Users assigned to the <b>${ap}</b> access profile will <b>${filterListTypeText}</b> be able to <b>${filterActionText}</b> items on the <b>${apPage}</b> page that have values in the <b>${filterCol}</b> column matching entries in the list below.`

            document.getElementById('data-filter-modal-input').value=currentValues
            document.getElementById('data-filter-column-input').style.display='none'
            document.getElementById('data-filter-column-input-label').style.display='none'
            console.log(document.getElementById('data-filter-column-input').style.display)
        }

    } else {
        document.getElementById('data-filter-modal').style.display=null;
        let memory=JSON.parse(document.getElementById('data-filter-modal-memory').innerText)
        let apName=memory.ap.replaceAll(" ", "")
        let apPageName=memory.apPage.replaceAll(" ", "")
        let filterColName=false
        if (memory.filterCol) {
            filterColName=memory.filterCol.replaceAll(' ', '')
        }

        // Reset buttons on edit filter modal
        document.getElementById('data-filter-modal-delete').style.color='red'
        document.getElementById('data-filter-modal-delete').innerText='Delete'
        document.getElementById('data-filter-modal-delete').setAttribute('onclick', 'toggleDataFilterModal(false,false,false,false,false,false,true)')

        // Get filterKey (determines which filter gets edited) from the modal memory div
        filterKey=document.getElementById('data-filter-modal-memory-filterKey').innerText

        // Save data filter filter 
        if (save) {
            // Trim all whitespaces at beginning and end of value list, as well as after commas
            let newValues=cleanUpFilterModalInputValues(document.getElementById("data-filter-modal-input").value)
            // Handle new filter case
            if (memory.newFilter) {
                // Get column name from input
                filterColName=document.getElementById('data-filter-column-input').value
                while (filterColName[0]==' ') { filterColName=filterColName.slice(1) }
                while (filterColName.at(-1)==' '&&filterColName.length>=2) { filterColName=filterColName.slice(0, filterColName.length-1) }

                // If a filter for this column exists, add values to the filter Else create new filter in access profiles and new filter html item
                let filter=_args.accessProfiles[memory.ap][memory.apPage][filterKey].filter
                if (filter[filterColName]) { filter[filterColName]=filter[filterColName].concat(newValues.split(',')) }
                else { filter[filterColName]=newValues.split(',') }
            }
            // Else save to existing filter
            else {
                _args.accessProfiles[memory.ap][memory.apPage][filterKey].filter[filterColName]=newValues.split(',')
            }
        }
        else if (del) {
            document.getElementById(`${apName}-${apPageName}-dataFilter-${filterColName}`).remove()
            delete _args.accessProfiles[memory.ap][memory.apPage][filterKey].filter[memory.filterCol]
        }

        // Re-build access profiles modal from _args.accessProfiles
        populateAccessProfileModal(memory.ap, memory.apPage)

        document.getElementById('access-profiles-modal').style.display='flex';
        document.getElementById('data-filter-modal-input').value=null
        document.getElementById('data-filter-column-input').value=null
        grid.focus()
    }
}

// Hide and show the modal to edit a cloumn and the restricted values for that column for the data filter 
toggleColumnFilterModal=(show, ap=false, apPage=false, save=false, filterKey=null) => {
    if (show) {
        document.getElementById('column-filter-modal').style.display='flex';
        document.getElementById('access-profiles-modal').style.display=null
        document.getElementById('column-filter-modal-memory').innerText=JSON.stringify({ ap, apPage })
        document.getElementById('column-filter-modal-memory-filterKey').innerText=filterKey

        console.log(document.getElementById('column-filter-modal-memory').innerText)
        let memory=JSON.parse(document.getElementById('column-filter-modal-memory').innerText)

        // Set text to describle the filter 
        let filterActionText='access'
        let filterListTypeText='not'
        if (_args.accessProfiles[memory.ap][memory.apPage][filterKey].type=='w') { filterListTypeText='only' }
        if (filterKey=='editColumnFilter') { filterActionText='edit' }

        document.getElementById('column-filter-modal-message').innerHTML=`
        Users assigned to the <b>${ap}</b> access profile will <b>${filterListTypeText}</b> be able to <b>${filterActionText}</b> values on the <b>${apPage}</b> page in the column entered below`

        document.getElementById('column-filter-input').style.display='flex'
        document.getElementById('column-filter-input-label').style.display='flex'
    } else {
        let memory=JSON.parse(document.getElementById('column-filter-modal-memory').innerText)
        document.getElementById('column-filter-modal').style.display=null;

        // Get filterKey (determines which filter gets edited) from the modal memory div
        filterKey=document.getElementById('column-filter-modal-memory-filterKey').innerText

        // Save data filter filter 
        if (save) {
            // Get column name from input and trim leadin g and trailing whitespace
            let newColName=document.getElementById('column-filter-input').value
            while (newColName[0]==' ') { newColName=newColName.slice(1) }
            while (newColName.at(-1)==' '&&newColName.length>=2) { newColName=newColName.slice(0, newColName.length-1) }

            _args.accessProfiles[memory.ap][memory.apPage][filterKey].filter.push(newColName)
        }

        // Re-build access profiles modal from _args.accessProfiles
        populateAccessProfileModal(memory.ap, memory.apPage)

        document.getElementById('access-profiles-modal').style.display='flex';
        document.getElementById('column-filter-input').value=null
        grid.focus()
    }
}

// Cleans up column filter modal input list by removing leading and trailing whitespace, as well as after commas
cleanUpFilterModalInputValues=(vals) => {
    let newVals=''
    let beforeStart=true
    let afterComma=false
    for (v of vals) {
        // Strip leading whitespace
        if (v==' '&&beforeStart) { continue }
        // Strip whitespace after commas
        if (v==',') {
            beforeStart=false
            afterComma=true
            newVals+=v
            continue
        }
        if (afterComma) {
            beforeStart=false
            if (v==' ') { continue }
            else {
                newVals+=v
                afterComma=false
                continue
            }
        }
        newVals+=v
    }

    return newVals
}

// Generates a data filter html element populated with elements for each data filter item
generateDataFilterHtml=(dataFilter, ap, apPage, apName, apPageName, filterTitle, filterKey) => {
    // Set styles for whitelist/blacklist
    let dataFilterStyle='style="background-color: black; color: white;"'
    let editButtonColor='white'
    let profileTypeButtonColor='black'

    if (dataFilter.type=='w') {
        dataFilterStyle='style="background-color: white; color: black;"'
        editButtonColor='black'
        profileTypeButtonColor='white'
    }

    let filterHtml=`
    <div class="ap-filter-container">
        <div class="data-filter-button ${profileTypeButtonColor}" style="margin-top: 5px; width: 10rem; height: 100%;" onclick="toggleFilterType('${ap}', '${apPage}', '${filterKey}')">
            ${filterTitle}:
        </div>`

    // Add sub accordion items for the datafilter
    for (col in dataFilter.filter) {
        let colName=col.replaceAll(' ', '')
        let dataFilterItem=`<div class="ap-filter-item" ${dataFilterStyle} id="${apName}-${apPageName}-dataFilter-${colName}">
            ${col}:<div id="${apName}-${apPageName}-${colName}-data-filter-values" style="margin-left: 5px;">`

        for (val of dataFilter.filter[col]) {
            dataFilterItem+=`${val}`
            if (val!=dataFilter.filter[col].at(-1)) {
                dataFilterItem+=', '
            }
        }


        dataFilterItem+=`</div><div class="edit-filter-item-button" style = "color: ${editButtonColor};" 
            onclick="toggleDataFilterModal(true, '${ap}', '${apPage}', '${col}',false,false,false,'${filterKey}')">Edit</div></div>`

        filterHtml+=dataFilterItem
    }


    filterHtml+=`
        <div class="add-filter-item-button" onclick="toggleDataFilterModal(true, '${ap}', '${apPage}', false, true, false, false, '${filterKey}')">+</div></div>`

    return filterHtml
}

// Generates a column filter html element populated with elements for each column filter item
generateColumnFilterHtml=(columnFilter, ap, apPage, apName, apPageName, filterTitle, filterKey) => {

    let profileTypeButtonColor='white'
    if (columnFilter.type=='b') {
        profileTypeButtonColor='black'
    }

    // End data filter container and start column filter container
    let filterHtml=`
    <div class="ap-filter-container">
            <div class="data-filter-button ${profileTypeButtonColor}" style="margin-top: 5px; width: 10rem;" onclick="toggleFilterType('${ap}', '${apPage}', '${filterKey}')">
                ${filterTitle}:
            </div>
    `

    // Set items to be black if this is a blacklist, or white if it is a whitelist
    let columnFilterStyle='style="background-color: black; color: white;"'
    if (columnFilter.type=='w') { columnFilterStyle='style="background-color: white; color: black;"' }

    // Add sub accordion items for the columnfilter
    for (col of columnFilter.filter) {
        let colName=col.replaceAll(' ', '')
        let itemId=`${apName}-${apPageName}-columnFilter-${colName}`
        let columnFilterItem=`<div class="ap-filter-item" id="${itemId}" ${columnFilterStyle}>${col}
        <div class="delete-filter-item-button" onclick="deleteColumnFilterEntry('${itemId}', '${col}', '${ap}', '${apPage}', '${filterKey}')">x</div></div>`

        filterHtml+=columnFilterItem
    }

    // End column filter container and entire sub accordion item
    filterHtml+=`<div class="add-filter-item-button" onclick="toggleColumnFilterModal(true, '${ap}', '${apPage}',false,'${filterKey}')">+</div></div>`

    return filterHtml

}

// Deletes a column filter html element and updates _args.accessProfiles
deleteColumnFilterEntry=(eltId, colName, ap, apPage, filterKey) => {
    updateSaveStatus(false)
    document.getElementById(eltId).remove()
    _args.accessProfiles[ap][apPage][filterKey].filter=_args.accessProfiles[ap][apPage][filterKey].filter.filter(col => col!=colName)
}

applyEditColumnFilter=(columns) => {
    for (col of columns) {
        if (_accessProfile.editColumnFilter.type=='b') {
            if (_accessProfile.editColumnFilter.filter.includes(col.name)) {
                delete col.editor
                col.cssClass+=' uneditable'
            }
        } else {
            if (!_accessProfile.editColumnFilter.filter.includes(col.name)) {
                delete col.editor
                col.cssClass+=' uneditable'
            }
        }
    }
    return columns
}

// Applies uneditable styles to uneditable row items
applyEditDataFilter=(data, columns) => {
    let editDataFilter=_accessProfile.editDataFilter
    for (item of data) {
        for (col in editDataFilter.filter) {
            if (editDataFilter.type=='b') {
                if (editDataFilter.filter[col].includes(item[col])) {
                    item=setItemUneditable(item, columns)
                }
            } else {
                if (!editDataFilter.filter[col].includes(item[col])) {
                    item=setItemUneditable(item, columns)
                }
            }
        }
    }

    return data
}

// Helper for applyEditDataFilter to add styles to global _cellCssStyles variable
setItemUneditable=(item, columns) => {
    if (!_cellCssStyles['uneditableRow']) {
        _cellCssStyles['uneditableRow']={}
    }

    if (!_cellCssStyles['uneditableRow'][item.id]) {
        _cellCssStyles['uneditableRow'][item.id]={}
    }

    for (col of columns) {
        _cellCssStyles['uneditableRow'][item.id][col.field]='uneditable'
    }
}

// toggle filter type from blacklist to whitelist
toggleFilterType=(ap, apPage, filterKey) => {
    if (_args.accessProfiles[ap][apPage][filterKey].type=='w') {
        _args.accessProfiles[ap][apPage][filterKey].type='b'
    } else {
        _args.accessProfiles[ap][apPage][filterKey].type='w'
    }
    populateAccessProfileModal(ap, apPage)
}