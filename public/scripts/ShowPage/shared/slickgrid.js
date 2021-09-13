// Global Variables
var _contextCell
var _itemBeforeEdit
var _test=false
var _groupedBy
var _editDirectionForwards=true
var _validEdit=true
var _week=null
var _frozenColumns=0
var _dataSaved=true
var _cellCssStyles={}
var _newWeek=false
var _deletedWeek=false
var _showrecordWeekMap={}
var _prevColumns
var _prevColMap
var _prevDepartmentOrder
var _overrideBlankRFSWarning=false
// Edit History Buffer
var undoRedoBuffer={
    commandQueue: [],
    commandCtr: 0,
}

const alphabet='abcdefghijklmnopqrstuvwxyz1234567890'.split('');
const oneDay=24*60*60*1000;

var server;
var newRowIds=0;

// Currency formatter
var formatter=new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

// Creates a slick grid with parameters
createSlickGrid=(data, columns, options) => {
    // Add 5 blank rows at end of grid
    data.push(...[
        { id: 'empty_0', editedfields: [] },
        { id: 'empty_1', editedfields: [] },
        { id: 'empty_2', editedfields: [] },
        { id: 'empty_3', editedfields: [] },
        { id: 'empty_4', editedfields: [] }])

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
        _contextCell={ row: activeCell.row, cell: activeCell.cell }
        grid.focus()
    });

    // Update itemBeforeEdit so it can be added to a cell edit command
    grid.onBeforeEditCell.subscribe(function (e, args) {
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
    grid.onClick.subscribe(function (e, args) {
        let activeCell=grid.getActiveCell()
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

            let selectionModel=grid.getSelectionModel()
            let ranges=selectionModel.getSelectedRanges()

            if (toCell&&toRow) {
                ranges[0].fromCell=fromCell
                ranges[0].fromRow=fromRow
                ranges[0].toCell=toCell
                ranges[0].toRow=toRow
            }

            setTimeout(function () {
                grid.setActiveCell(originalFromRow, originalFromCell)
                selectionModel.setSelectedRanges(ranges)
                grid.setSelectionModel(selectionModel)
                grid.invalidate()
                grid.render()
            }, 1)

        }
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

    // Single column sort functionality
    grid.onSort.subscribe(function (e, args) {
        let items=dataView.getItems();
        items.sort((a, b) => { return stableSort(a, b, args.sortAsc, args.sortCol.field) });

        dataView.setItems(items);

        applyCellStyles(_cellCssStyles)
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

    // Add listener to add rows input
    createAddRowListener();

    // Add listener to group by input 
    createGroupByListener();

    // Add listener to auto-number input 
    createAutoNumberListener();

    // Add listener to frozen-columns input 
    createFrozenColumnsListener();

    // Initialize prev variables
    _prevColumns=grid.getColumns()
    _prevColMap=getColumnWidths()
    _prevDepartmentOrder=getDeptOrder()

    // Set page selector dropdown restrictions
    setNavRestrictions()
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
    if (!_show.positions.positionList[0]) {
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
            let value=item[columns[j].field]
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
                <input id="${g}-auto-number-input" style="width: 50px;"> 
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
    aTie=a[tiebreak]
    bTie=b[tiebreak]
    a=a[field]
    b=b[field]
    if (a==undefined) { a='zzzzz__' }
    if (b==undefined) { b='zzzzz__' }

    // Sort Dates
    if (field.toLowerCase().includes('date')) {
        a=new Date(a).getTime();
        b=new Date(b).getTime();
    }

    // Sort numbers
    let aNum=parseFloat(a);
    let bNum=parseFloat(b);
    if (a=='zzzzz__') { aNum=99999999 }
    if (b=='zzzzz__') { bNum=99999999 }
    let aNumTie=parseFloat(aTie);
    let bNumTie=parseFloat(bTie);

    if (!isNaN(aNum)&&!isNaN(bNum)) {
        if (sortAsc) { if (aNum==bNum) { if (aNumTie>bNumTie) { return 1 } if (bNumTie>aNumTie) { return -1 } return 0 } return aNum-bNum }
        else { if (bNum==aNum) { if (bNumTie>aNumTie) { return 1 } if (aNumTie>bNumTie) { return -1 } return 0 } return bNum-aNum }
    }
    // Sort alphabetical
    else {
        if (!a) { a='ZZZ' }
        if (!b) { b='ZZZ' }
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
    _week=_show.weeks.find(w => w._id==_show.currentWeek)
    let weekEnd=new Date(_week.end)
    let weekEndingText=`Week ${_week.number} (Ending: ${weekEnd.toLocaleDateString('en-US')})`
    if (_args.section=='Estimate') {
        weekEndingText=`Date Created: ${new Date(_show.estimateVersions[_version].dateCreated).toLocaleDateString('en-US')}`
        document.getElementById('week-ending-display-container').classList.add('no-hover-style')
    } else {
        if (_week.number==_show.weeks[0].number) {
            document.getElementById('week-ending-latest-indicator').style.display='flex'
        }
    }
    document.getElementById('week-ending-display').innerText=weekEndingText
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
            original_weekNum=_week.number

            // Delete week and shift week numbers
            _show.weeks.splice(_show.weeks.indexOf(_show.weeks.find(w => w._id==weekId)), 1)
            for (week of _show.weeks) {
                if (week.number>weekNum) {
                    week.number--
                }
            }

            // If deleting current week, delete on server immediately and reload page to most recent week
            if (weekNum==original_weekNum) {
                console.log('deleting current week')
                changeWeek(_show.weeks[0].number)
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
        for (week of _show.weeks) {
            let weekDivStyle=null
            if (week.number==_week.number) { weekDivStyle='text-decoration: underline;' }
            wemWC.innerHTML+=`
            <div class="week-ending-modal-week" onclick="changeWeek('${week.number}')" style="${weekDivStyle}">
                Week ${week.number} (Ending: ${new Date(week.end).toLocaleDateString('en-US')})
            </div>`

            if (_show.weeks.length>1) {
                wemWC.innerHTML+=`
                <button style='color: red' onclick='toggleDeleteWeekWarningModal(true, ${week.number}, "${week._id}")'>Delete</button>`
            }
        }

    }
}

changeWeek=async (weekNum, weekEnd=false, isNewWeek=false, copyCrewFrom='current') => {
    if (weekNum==_week.number&&!isNewWeek&&_deletedWeek!=_week._id) { return }
    if (['Crew', 'Rentals', 'CostReport', 'Purchases'].includes(_args.section)) {
        _newWeek={ number: weekNum, end: weekEnd, isNewWeek: isNewWeek, copyCrewFrom: copyCrewFrom }

        console.log('changing week')
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

            let newWeekNumber=1;
            for (week of _show.weeks) {
                if (weekEnd.getTime()>new Date(week.end).getTime()) {
                    newWeekNumber=parseFloat(week.number)+1
                    break
                }
            }

            changeWeek(newWeekNumber, weekEnd, true, copyCrewFrom)
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
    let cols=grid.getColumns();
    if (hide) {
        for (let i=range[0]; i<=range[1]; i++) {
            if (!cols[i].isHidden) {
                hideColumn(true, cols[i]);
            }
        }
    } else {
        for (let i=range[0]; i<=range[1]; i++) {
            if (cols[i].isHidden) {
                cols[i]=cols[i].colDef;
            }
        }
    }

    grid.setColumns(cols);
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
    } else {
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
    }

    // Show and hide individual columns
    if (grid.getColumns()[args.cell].isHidden) { options=`<li onclick='hideColumn(false)'>Show column</li>` }
    else { options=`<li onclick='hideColumn(true)'>Hide column</li>` }

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
