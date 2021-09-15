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

// Sets the auto-fill names to only users with correct position
setSupplierOptions=(args) => {
    let col=grid.getColumns()[args.cell];
    if (col.name=='Supplier'||col.name=='Code') {
        let item=dataView.getItemByIdx(args.row)
        let dataSource=[];
        if (item['Code']) {
            let crewWithCode=_week.crew.crewList.filter(c => {
                let record=c.showrecords.find(r => r.showid==_show._id)
                if (record&&record.positions.find(p => p.code==item['Code'])) {
                    return true
                }
                return false
            })
            for (user of crewWithCode) {
                dataSource.push(`${user['Name']} [${user['username']}]`);
            }
            col.dataSource=dataSource;
        }
        else {
            col.dataSource=_allShowCrewNames
        }
    }
}

// Auto fill supplier data when a supplier is added
autoFillSupplierData=(args) => {
    let col=grid.getColumns()[args.cell];
    let item=args.item;

    // Set _groupedBy property to unwritable
    if (_groupedBy) { Object.defineProperty(item, _groupedBy, { writable: false, configurable: true }) }

    // Do nothing if not editing supplier or code fields
    if (col.name!='Supplier'&&col.name!='Code') { return }
    setSupplierOptions(args);

    if (col.name=='Code') {
        // Auto-populate if editing forwards
        if (_editDirectionForwards) {
            // Find position
            let pos=_show.positions.positionList.find(p => p['Code']==item['Code']);

            // Use position to populate if found
            if (pos) {
                item['Department']=pos['Department'];
                let user=_allShowCrewUsers.find(u => u['username']==item['Supplier'])
                if (user) {
                    let record=user.showrecords.find(r => r.showid==_show._id)
                    if (!record.positions.find(p => p.code==item['Code'])) {
                        item['Supplier']=undefined;
                    }
                } else {
                    item['Supplier']=undefined;
                }
            }
        }
        // Else use previous values to populate
        else { item=loadPrevItemFromCommand(item) }
    } else {
        // Auto-populate if editing forwards
        if (_editDirectionForwards) {
            let user;
            // Find user
            if (item['Supplier'].includes('[')&&item['Supplier'].includes(']')) {
                user=_allShowCrewUsers.find(u => u['username']==item['Supplier'].slice(item['Supplier'].indexOf('[')+1, item['Supplier'].indexOf(']')));
                item['Supplier']=item['Supplier'].slice(item['Supplier'].indexOf('[')+1, item['Supplier'].indexOf(']'));
            } else { user=_allShowCrewUsers.find(u => u['Name']==item['Supplier']) }

            // Use user to populate if found
            if (user) {
                let record=user.showrecords.find(r => r.showid==_show._id);
                let position=_show.positions.positionList.find(p => p['Code']==record.positions[0].code);
                item['Code']=position['Code'];
                item['Department']=position['Department'];
            } else {
                delete item.supplierid
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
    if (!_overrideBlankRFSWarning&&blankRequiredWarning()) { return }

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

    console.log('in saveData')

    // Grey screen and show loader if reloading
    if (reload) {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('grid-modal-container').innerHTML=`<div class="spinner-border text-light" role="status" style="margin-top: 25%;"></div>`;
    }

    // Post estimate data and version to server
    fetch(server+`shows/${_show._id}/Rentals`, {
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
        })
    })
        .then(response => { return response.json() })
        .then(responseData => {
            if (reload) { location.reload() }
            else {
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