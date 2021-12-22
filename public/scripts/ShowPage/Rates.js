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

// gets the group aggregators for purchases
getGroupAggregators=() => {
    let aggregators=[];
    return aggregators;
}

// Update estimate
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

    // Post estimate data and version to server
    fetch(server+`/shows/${_show._id}/Rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: dataView.getItems(),
            extraColumns: _extraColumns,
            multipliers: _multipliers,
            newWeek: _newWeek,
            weeks: _show.weeks,
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
        credentials: 'include'
    })
        .then(response => { return response.json() })
        .then(responseData => {
            if (reload) { location.reload() }
            // Update _savingUnderway to false once save is complete
            _savingUnderway=false
            // Push new item ids to items
            clearDeletedItems();
            // Update saveStatus
            updateSaveStatus(true);
            // Reflect the change in save point in the Undo/Redo buffer command queue
            if (undoRedoBuffer.commandQueue[0]) {
                for (cmd of undoRedoBuffer.commandQueue) { cmd.saveStatus=[false, false] }
                undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr-1].saveStatus=[false, true];
                if (undoRedoBuffer.commandCtr<undoRedoBuffer.commandQueue.length) {
                    undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr].saveStatus=[true, false];
                }
            }
            // If save successful update nav restrictions
            updateNavDropdown()
        })
}

// Hide/show  'Multipliers'  modal
toggleMultipliersModal=(show, update=false) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('multipliers-modal').style.display=null;
        document.getElementById('week-ending-display').style.zIndex=null;
        document.getElementById('week-ending-display').style.backgroundColor=null;

        // Update _multipliers with table values
        if (update) {
            let days=getDaysOfCurrentWeek(new Date(_week.end)).map(day => day.toString().slice(0, 3));
            for (m of Object.keys(_multipliers)) {
                for (day of days) {
                    let val=parseFloat(document.getElementById(`${m}-${day}`).value);
                    if (!isNaN(val)) { _multipliers[m][day]=val }
                }
            }
            saveData();
        }
    }
    // Show modal
    else {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('multipliers-modal').style.display='flex';
        loadMultipliersModal();
    }
}

// Hide/show  'Add Multiplier'  modal
toggleAddMultiplierModal=(show, add=false) => {
    // Hide Modal
    if (!show) {
        document.getElementById('add-multiplier-modal').style.display=null;
        document.getElementById('multipliers-modal').style.display='flex';
        // update Multipliers 
        if (add) {
            let newMultiplier=parseFloat(document.getElementById('add-multiplier-input').value);
            _multipliers[newMultiplier]={
                Mon: 1, Tue: 1, Wed: 1, Thu: 1, Fri: 1, Sat: 1, Sun: 1
            }
        }
        loadMultipliersModal();
        document.getElementById('add-multiplier-input').value=null;
    }
    // Show modal
    else {
        document.getElementById('add-multiplier-modal').style.display='flex';
        document.getElementById('add-multiplier-input').focus();
        document.getElementById('multipliers-modal').style.display=null;
    }
}

// Delete multiplier
deleteMultiplier=(multiplier) => {
    delete _multipliers[multiplier];
    loadMultipliersModal();
}

// Load _multipliers data into the multipliers modal table
loadMultipliersModal=() => {
    // Reset table
    document.getElementById('multipliers-table').innerHTML=`
    <thead>
        <tr id='multiplier-headers'>
            <th scope="col"></th>
            <th scope="col">Hour</th>
        </tr>
    </thead>
    <tbody id="multiplier-rows">
    </tbody>`

    let days=getDaysOfCurrentWeek(new Date(_week.end)).map(day => day.toString().slice(0, 3));
    let mHeaders=document.getElementById('multiplier-headers');
    let mRows=document.getElementById('multiplier-rows');
    let mRowKeys=Object.keys(_multipliers);

    // Add week day columns
    for (day of days) {
        mHeaders.innerHTML+=`<th scope="col">${day}</th>`;
    }

    // Add Multiplier Rows
    for (m of mRowKeys) {
        if (m==0) {
            mRows.innerHTML+=`
            <tr id='${m}'>
            <th class='delete-multiplier-button' onclick=''></th>
            <td scope="row"><b>${m}<b></td>
        </tr>`
        } else {
            mRows.innerHTML+=`
        <tr id='${m}'>
            <th class='delete-multiplier-button' onclick='deleteMultiplier(${m})'>delete</th>
            <td scope="row"><b>${m}<b></td>
        </tr>`
        }
    }

    // Populate table with multiplier data
    for (m of mRowKeys) {
        for (day of days) {
            if (!_args.apOptions['Edit Multipliers']) {
                document.getElementById(`${m}`).innerHTML+=`<td><div>${_multipliers[m][day]}</div></td>`
            } else {
                document.getElementById(`${m}`).innerHTML+=`<td><input onkeydown="validateModalInput(event, 'number'); refocusElement(this)" class='multiplier-input' id='${m}-${day}' value='${_multipliers[m][day]}'></td>`
            }
        }
    }

}

// Initialize _dropdown nodes so saving can toggle access to crew and rates page 
initDropdownNodes=() => {
    let c=document.getElementById('crew-dropdown')
    let r=document.getElementById('rentals-dropdown')
    let greyCrew=greyOutLink(c)
    let greyRentals=greyOutLink(r)
    let originalCrew=c
    let originalRentals=r

    return { greyCrew, greyRentals, originalCrew, originalRentals }
}

// Update the navbar dropdown options to block access to crew and rates pages if no rates exist
updateNavDropdown=() => {
    let c=document.getElementById('crew-dropdown')
    let r=document.getElementById('rentals-dropdown')
    for (item of dataView.getItems()) {
        if (!isEmpty(item)) {
            c.parentElement.replaceChild(_dropdownNodes.originalCrew, c)
            r.parentElement.replaceChild(_dropdownNodes.originalRentals, r)
            return
        }
    }
    c.parentElement.replaceChild(_dropdownNodes.greyCrew, c)
    r.parentElement.replaceChild(_dropdownNodes.greyRentals, r)
}

testFun=() => {
    console.log(dataView.getItems());
}