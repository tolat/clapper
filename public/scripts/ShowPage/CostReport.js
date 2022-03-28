// Set context menu options 
setContextMenu=() => {
    // Add copy and paste to context menu
    document.getElementById('contextMenu').innerHTML=`
    <li onclick="triggerCopy()">Copy</li>
    <br>`

    document.getElementById('contextMenu').innerHTML+=getHideColumnsOptions();
    let range=grid.getSelectionModel().getSelectedRanges()[0]
    let s=''
    if (range&&range.toRow!=range.fromRow) { s='s' }
    document.getElementById('contextMenu').innerHTML+=`<li onclick="selectRow()">Select row${s}</li>`
}

// Set context menu options for column header
setHeaderContextMenu=(args) => {
    document.getElementById('contextMenu').innerHTML=getHideColumnsOptions(args.column);

    document.getElementById('contextMenu').innerHTML+=`
    <li onclick='toggleAddColumnModal(true, 0)'>Add column left</li>
    <li onclick='toggleAddColumnModal(true, 1)'>Add column right</li>`;

    if (args.column.deletable) {
        document.getElementById('contextMenu').innerHTML=document.getElementById('contextMenu').innerHTML+`<li onclick='deleteColumn()'>Delete column</li>`;
    }
}

// Gets the group aggregators 
getGroupAggregators=() => {
    let aggregators=[];
    aggregators.push(...[
        new Slick.Data.Aggregators.Sum("Budget"),
        new Slick.Data.Aggregators.Sum("To Date"),
        new Slick.Data.Aggregators.Sum("Remaining"),
        new Slick.Data.Aggregators.Sum("This Week"),
        new Slick.Data.Aggregators.Avg("% Remaining"),
        new Slick.Data.Aggregators.Sum("Labor"),
        new Slick.Data.Aggregators.Sum("Man Days"),
        new Slick.Data.Aggregators.Sum("Materials"),
        new Slick.Data.Aggregators.Sum("Rentals")

    ])

    for (dep of _args.departments) {
        aggregators.push(...[
            new Slick.Data.Aggregators.Sum(`${dep}_budget`),
            new Slick.Data.Aggregators.Sum(`${dep}_todate`),
            new Slick.Data.Aggregators.Avg(`${dep}_pctremaining`),
            new Slick.Data.Aggregators.Sum(`${dep}_week`),
            new Slick.Data.Aggregators.Sum(`${dep}_mandays`),
            new Slick.Data.Aggregators.Sum(`${dep}_labor`),
            new Slick.Data.Aggregators.Sum(`${dep}_materials`),
            new Slick.Data.Aggregators.Sum(`${dep}_rentals`)
        ])
    }
    return aggregators;
}

// Save cost report
saveData=(reload=false, updateVersion=false) => {
    // Run pre save procedure
    if (!preSaveProcedure(reload)) { return }

    // Post estimate data and version to server
    fetch(server+`/shows/${_args.showid}/CostReport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: dataView.getItems(),
            extraColumns: _extraColumns,
            updateVersion: updateVersion,
            totals: updateTotalsRow(),
            newWeek: _newWeek,
            deletedWeek: _deletedWeek,
            displaySettings: {
                groupBy: _groupedBy,
                reorderColumns: getColumnOrder(),
                collapseGroups: getCollapsedGroups(),
                setColumnWidths: getColumnWidths(),
                setHiddenColumns: getHiddenColumns(),
                setFrozenColumns: _frozenColumns,
            }
        }),
        credentials: 'include',
    })
        .then(response => { return response.text(); })
        .then(responseData => {
            if (reload) { location.reload() }
            else {
                // Update _savingUnderway to false once save is complete
                _savingUnderway=false
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

// Hides or shows the 'Enter Version' Modal for the Slick.grid
toggleOpenVersionModal=(show) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('open-version-modal').style.display=null;
        grid.focus()
    }
    // Show modal
    else {
        if (!_args.apOptions['View Estimate Versions']) { return }
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('open-version-modal').style.display='flex';
        document.getElementById('open-version-modal').focus()
    }
}

// Set estimate version
openEstimate=(version) => {
    toggleOpenVersionModal(false)
    saveData(true, version);
}

// Scroll to department column
scrollToDeptCol=(dept) => {
    let cols=grid.getColumns();
    let idx=cols.indexOf(cols.find(c => c.id==`${dept}_budget`));
    grid.scrollColumnIntoView(cols.length-1);
    grid.scrollColumnIntoView(idx);
}

testFun=() => {
}
