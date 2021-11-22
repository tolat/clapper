// Set context menu options 
setContextMenu=() => {
    // Add copy and paste to context menu
    document.getElementById('contextMenu').innerHTML=`
    <li onclick="triggerCopy()">Copy</li>
    <li onclick="triggerPaste()">Paste</li>
    <br>`

    document.getElementById('contextMenu').innerHTML+=getHideColumnsOptions();

    document.getElementById('contextMenu').innerHTML+=`<li onclick="addRow(1, 'above')">Add row above</li>
        <li onclick="addRow(1, 'below')">Add row below</li>`;
    let range=grid.getSelectionModel().getSelectedRanges()[0]
    let s=''
    if (range&&range.toRow!=range.fromRow) { s='s' }
    document.getElementById('contextMenu').innerHTML+=`<li onclick="selectRow()">Select row${s}</li>`
}

// Set context menu options for column header
setHeaderContextMenu=(args) => {
    document.getElementById('contextMenu').innerHTML=getHideColumnsOptions();

    let weekDays=getDaysOfCurrentWeek().map(day => day.toString().slice(0, 3));

    if (args.column.name!='Set'&&!weekDays.includes(args.column.name)) {
        document.getElementById('contextMenu').innerHTML+=`<li onclick='toggleAddColumnModal(true, 0)'>Add column left</li><li onclick='toggleAddColumnModal(true, 1)'>Add column right</li>`;
        if (args.column.deletable) {
            document.getElementById('contextMenu').innerHTML=document.getElementById('contextMenu').innerHTML+`<li onclick='deleteColumn()'>Delete column</li>`;
        }
    }
}

// Gets the group aggregators 
getGroupAggregators=() => {
    let aggregators=[];
    aggregators.push(...[
        new Slick.Data.Aggregators.Sum("Mon"),
    ])
    return aggregators;
}

// initialize supplier dropdowns at page laod
setSupplierOptions=(args) => {
    let item
    args.item? item=args.item:item=dataView.getItemById(dataView.mapRowsToIds([args.row])[0])

    // Update data source for supplier column autofill based on Supplier Code
    if (item['Supplier Code']) {
        let cols=grid.getColumns()
        cols.find(c => c.name=='Supplier').dataSource=Object.keys(_userPosForWeekMap)
            .filter(uname => _userPosForWeekMap[uname].includes(item['Supplier Code']))
            .map(uname => `${_userNamesForWeekMap[uname]} [${uname}]`)
        grid.setColumns(cols)
    } else {
        // Update data source for autofill in supplier column
        let cols=grid.getColumns()
        cols.find(c => c.name=='Supplier').dataSource=_allWeekCrewNames
        grid.setColumns(cols)
    }

    // Update data source for Supplier Code column autofill based on Supplier
    if (item['Supplier']&&Object.keys(_userNamesForWeekMap).includes(item['Supplier'])) {
        // Update data source for autofill in supplier column
        let cols=grid.getColumns()
        cols.find(c => c.name=='Supplier Code').dataSource=_userPosForWeekMap[item['Supplier']]
        grid.setColumns(cols)
    } else {
        // Update data source for autofill in supplier column
        let cols=grid.getColumns()
        cols.find(c => c.name=='Supplier Code').dataSource=Object.keys(_posDeptMap)
        grid.setColumns(cols)
    }
}

// Auto fill supplier data when a supplier is added
autoFillSupplierData=(args) => {
    let col=grid.getColumns()[args.cell];
    let item=args.item;

    // Set _groupedBy property to unwritable
    if (_groupedBy) { Object.defineProperty(item, _groupedBy, { writable: false, configurable: true }) }

    if (col.name=='Supplier Code') {
        // Auto-populate if editing forwards
        if (_editDirectionForwards) {
            if (item['Supplier Code']) {
                item['Department']=_posDeptMap[item['Supplier Code']]

                // Clear Supplier if supplier has not worked new position in this week
                if (item['Supplier']&&!_userPosForWeekMap[item['Supplier']].includes(item['Supplier Code'])) {
                    item['Supplier']=undefined
                }
            }
        }
        // Else use previous values to populate
        else { item=loadPrevItemFromCommand(item) }
    } else if (col.name=='Supplier') {
        // Auto-populate if editing forwards
        if (_editDirectionForwards) {
            // Find user
            if (item['Supplier'].includes('[')&&item['Supplier'].includes(']')) {
                item['Supplier']=item['Supplier'].slice(item['Supplier'].indexOf('[')+1, item['Supplier'].indexOf(']'));
            }
            // If supplier has positions for the week, update rental supplier code and department to first position code in list
            let userPositions=_userPosForWeekMap[item['Supplier']]
            if (userPositions) {
                item['Supplier Code']=userPositions[0]
                item['Department']=_posDeptMap[userPositions[0]]
            }
        }
        // Else use previous values to populate
        else { item=loadPrevItemFromCommand(item) }
    }

    // Set _groupedBy property to writable again
    if (_groupedBy) { Object.defineProperty(item, _groupedBy, { writable: true }) }

    // Apply changes to the dataView
    dataView.updateItem(item.id, item);

    grid.invalidate();
    grid.setData(dataView);
    grid.render();
}

getWeekTotal=(item) => {
    if (!item['Department']||!item['Day Rate']||!item['Set Code']) { return }
    let rate=parseFloat(item['Day Rate'])||0;
    let days=parseFloat(item['Days Rented'])||0;
    let tax=0
    for (taxCol of _week.rentals.taxColumns) {
        let taxAmount=parseFloat(item[taxCol])||0
        tax+=taxAmount
    }

    return (rate*days*(tax/100+1)).toFixed(2);
}

// Calculate weekly total for item
calculateWeeklyTotal=(args) => {
    args.item['Week Total']=getWeekTotal(args.item);

    // Apply changes to the dataView
    dataView.updateItem(args.item.id, args.item);
    grid.invalidate();
    grid.setData(dataView);
    grid.render();
}

// Calculate weekly totals for all items
calculateAllWeeklyTotals=() => {
    let items=dataView.getItems();
    for (item of items) { item['Week Total']=getWeekTotal(item) }

    // Apply changes to the dataView
    dataView.setItems(items);
    grid.invalidate();
    grid.setData(dataView);
    grid.render();
}

// Update rentals
saveData=(reload=false) => {
    // Only save if saving is not already underway, and the user has not overidden the RFS warning
    if (_savingUnderway||(!_overrideBlankRFSWarning&&blankRequiredWarning())) { return } else { _savingUnderway=true }

    // Indicate grid is saving
    let statusElement=document.getElementById('save-status');
    statusElement.innerText='saving...';
    statusElement.style.color='rgb(255, 193, 49)';

    // Run all validators
    runAllValidators()

    // Cancel save if invalid cells remain
    if (invalidCellsRemain()) {
        toggleLoadingScreen(false)
        updateSaveStatus(_dataSaved)
        return
    }

    // Grey screen and show loader if reloading
    if (reload) {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('grid-modal-container').innerHTML=`<div class="spinner-border text-light" role="status" style="margin-top: 25%;"></div>`;
    }

    // Post estimate data and version to server
    fetch(server+`/shows/${_show._id}/Rentals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: dataView.getItems(),
            extraColumns: _extraColumns,
            newWeek: _newWeek,
            weeks: _show.weeks,
            deletedWeek: _deletedWeek,
            taxColumns: _taxColumns,
            displaySettings: {
                groupBy: _groupedBy,
                reorderColumns: getColumnOrder(),
                collapseGroups: getCollapsedGroups(),
                setColumnWidths: getColumnWidths(),
                setHiddenColumns: getHiddenColumns(),
                setFrozenColumns: _frozenColumns,
            }
        }),
        credentials: 'include'
    })
        .then(response => { return response.json() })
        .then(responseData => {
            console.log(responseData)
            if (reload) { location.reload() }
            else {
                // Update _savingUnderway to false once save is complete
                _savingUnderway=false
                // Push new item ids to items
                clearDeletedItems();
                // Update saveStatus
                updateSaveStatus(true);
                // Reflect the change in save point in the Undo/Redo buffer command queue
                if (undoRedoBuffer.commandQueue[0]) {
                    for (cmd of undoRedoBuffer.commandQueue) { cmd.saveStatus=[false, false] }
                    if (undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr-1]) {
                        undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr-1].saveStatus=[false, true];
                    }
                    if (undoRedoBuffer.commandCtr<undoRedoBuffer.commandQueue.length) {
                        undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr].saveStatus=[true, false];
                    }
                }
            }
        })
}

testFun=() => {
    console.log(_show.rentals.rentalList);
}