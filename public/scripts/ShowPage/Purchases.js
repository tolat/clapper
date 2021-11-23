// Set context menu options 
setContextMenu=() => {
    // Add copy and paste to context menu
    document.getElementById('contextMenu').innerHTML=`
    <li onclick="triggerCopy()">Copy</li>
    <li onclick="triggerPaste()">Paste</li>
    <br>`

    document.getElementById('contextMenu').innerHTML+=getHideColumnsOptions();
    document.getElementById('contextMenu').innerHTML+=`
    <li onclick="addRow(1, 'above')">Add row above</li>
    <li onclick="addRow(1, 'below')">Add row below</li>`;
    let range=grid.getSelectionModel().getSelectedRanges()[0]
    let s=''
    if (range&&range.toRow!=range.fromRow) { s='s' }
    document.getElementById('contextMenu').innerHTML+=`<li onclick="selectRow()">Select row${s}</li>`
}

// Set contezt menu options for column header
setHeaderContextMenu=(args) => {
    document.getElementById('contextMenu').innerHTML=getHideColumnsOptions();

    document.getElementById('contextMenu').innerHTML+=`<li onclick='toggleAddColumnModal(true, 0)'>Add column left</li><li onclick='toggleAddColumnModal(true, 1)'>Add column right</li>`;
    if (args.column.deletable) {
        document.getElementById('contextMenu').innerHTML=document.getElementById('contextMenu').innerHTML+`<li onclick='deleteColumn()'>Delete column</li>`;
    }
}

// gets the group aggregators for purchases
getGroupAggregators=() => {
    let aggregators=[];
    aggregators.push(...[
        new Slick.Data.Aggregators.Sum("Amount"),
        new Slick.Data.Aggregators.Sum("Total"),
    ])
    return aggregators;
}

// Update Purhchases
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
        _savingUnderway=false
        return
    }

    // Grey screen and show loader if reloading
    if (reload) {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('grid-modal-container').innerHTML=`<div class="spinner-border text-light" role="status" style="margin-top: 25%;"></div>`;
    }

    // Post estimate data and version to server
    fetch(server+`/shows/${_show._id}/Purchases`, {
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

// Update the total for this purchase
updatePurchaseTotal=(item) => {
    let tax=0
    for (taxCol of _taxColumns) {
        tax+=item[taxCol]||0
    }

    item['Total']=zeroNanToNull((parseFloat(item['Amount'])*(tax/100+1)).toFixed(2))||0;
    return item;
}

calculateAllWeeklyTotals=() => {
    console.log('here');
    for (item of dataView.getItems()) {
        updatePurchaseTotal(item)
    }
}

testFun=() => {
    console.log(grid);
}