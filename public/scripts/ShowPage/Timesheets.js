// Set context menu options 
setContextMenu=() => {
    document.getElementById('contextMenu').innerHTML=getHideColumnsOptions();

    document.getElementById('contextMenu').innerHTML+=`
    <li onclick="addRow(1, 'above')">Add row above</li>
    <li onclick="addRow(1, 'below')">Add row below</li>
    <br>
    <li id="context-menu-delete-row" onclick="deleteItem('purchaseid')">Delete row</li>`;

    // if multiple items selected, pluralize
    if (grid.getSelectedRows().length>1) { document.getElementById('context-menu-delete-row').innerText='Delete purchases' }
    else { document.getElementById('context-menu-delete-row').innerText='Delete purchase'; }
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
saveData=() => {
    // Cancel save if invalid cells remain
    if (invalidCellsRemain()) { return }

    // Indicate grid is saving
    let statusElement=document.getElementById('save-status');
    statusElement.innerText='saving...';
    statusElement.style.color='rgb(255, 193, 49)';

    // Save all items if necessary
    let data=_editedItems;
    if (_saveAll) { data=dataView.getItems() }

    // Post estimate data and version to server
    fetch(server+`shows/${_show._id}/Purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: data,
            extraColumns: _extraColumns,
            deletedPurchases: _deletedItems,
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
            // Push new item ids to items
            updateNewItems(responseData.newItemMap, 'purchaseid');
            // Reset _saveAll
            _saveAll=false;
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
        })
}

testFun=async () => {

}