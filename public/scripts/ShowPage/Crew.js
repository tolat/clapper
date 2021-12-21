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

// Set contezt menu options for column header
setHeaderContextMenu=(args) => {
    document.getElementById('contextMenu').innerHTML=getHideColumnsOptions(args.column);

    let weekDays=getDaysOfCurrentWeek().map(day => day.toString().slice(0, 3));

    if (args.column.name!='Set'&&!weekDays.includes(args.column.name)) {
        document.getElementById('contextMenu').innerHTML+=`
        <li onclick='toggleAddColumnModal(true, 0)'>Add column left</li>
        <li onclick='toggleAddColumnModal(true, 1)'>Add column right</li>`;
        if (args.column.deletable) {
            document.getElementById('contextMenu').innerHTML+=`<li onclick='deleteColumn()'>Delete column</li>`;
        }
    }
}

// gets the group aggregators for purchases
getGroupAggregators=() => {
    let aggregators=[];
    aggregators.push(...[
        new Slick.Data.Aggregators.Sum("Mon"),
        new Slick.Data.Aggregators.Sum("Tue"),
        new Slick.Data.Aggregators.Sum("Wed"),
        new Slick.Data.Aggregators.Sum("Thu"),
        new Slick.Data.Aggregators.Sum("Fri"),
        new Slick.Data.Aggregators.Sum("Sat"),
        new Slick.Data.Aggregators.Sum("Sun"),
        new Slick.Data.Aggregators.Sum("Total"),
        new Slick.Data.Aggregators.Sum("Rentals"),
    ])
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

    // Clear highlighted cells
    grid.removeCellCssStyles("hangingSetsOrHours");

    // Grey screen if reloading since the save can take some time
    if (reload) { toggleLoadingScreen(true, 'Reloading...') }

    let weekDays=[]
    for (day of _currentWeekDays) {
        weekDays.push(day.toLocaleDateString('en-US'))
    }

    // Post estimate data and version to server
    fetch(server+`/shows/${_show._id}/Crew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: dataView.getItems(),
            extraColumns: _extraColumns,
            currentWeekDays: weekDays,
            newWeek: _newWeek,
            weeks: _show.weeks,
            taxColumns: _taxColumns,
            deletedWeek: _deletedWeek,
            currentTime: new Date(Date.now().getTime()),
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
            console.log(responseData.message)
            if (reload) { location.reload() }
            else {
                // Update _savingUnderway to false once save is complete
                _savingUnderway=false
                // Push new item ids to items
                clearDeletedItems()
                // Update Totals
                updateTotalsRow()
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

// Calculate weekly total for a user
calculateWeeklyTotal=(item) => {
    // Return 0 if item does not have a position
    if (!item['Position']||item['Position']=='DELETED') { return 0 }

    let total=0;
    let pos=_week.positions.positionList[item['Position']]
    // Return 0 if no position found (errant position code)
    if (!pos) { return 0 }
    let rate=parseFloat(pos['Rate'])

    for (date of _currentWeekDays) {
        let day=date.toString().slice(0, 3);
        let hours=zeroNanToNull(parseFloat(item[day]))||0
        total+=calculateDailyLaborCost(_multipliers, hours, rate, day);
    }

    // Add tax and rentals to make final total
    let rentals=zeroNanToNull(parseFloat(item['Rentals']))||0
    let tax=0;
    for (t of _week.crew.taxColumns) {
        tax+=zeroNanToNull(parseFloat(item[t]))||0
    }

    return (total*(tax/100+1)+rentals).toFixed(2);
}

// Calculates weekly rental amounts for item if item has a userid. Otherwise returns 0.
calculateWeeklyRentals=(item) => {
    let rentalAmount=0;
    if (item['username']&&item['Position']) {
        let rentals=_week.rentals.rentalList.filter(r => r['Supplier']&&r['Supplier']==item['username']&&r['Supplier Code']==item['Position'])
        for (rental of rentals) {
            console.log(rental)
            let tax=0;
            for (t of _week.rentals.taxColumns) {
                tax+=parseFloat(rental.taxColumnValues[t])||0
            }
            rentalAmount+=parseFloat(rental['Day Rate'])*parseFloat(rental['Days Rented'])*(tax/100+1)
        }
    }
    return rentalAmount.toFixed(2);
}

// Sets the correct column order for the day/set columns
setCrewPageColumnOrder=() => {
    let weekDays=_currentWeekDays.map(day => day.toString().slice(0, 3));
    let postWeekColKeys=['Rentals', 'Total'].concat(_week.crew.taxColumns)
    let cols=grid.getColumns();
    let preWeekCols=cols.filter(col => !weekDays.includes(col.field)&&col.name!='Set'&&col.name!='Total'&&!postWeekColKeys.includes(col.name));
    let postWeekCols=cols.filter(col => postWeekColKeys.includes(col.name));
    let weekCols=cols.filter(col => weekDays.includes(col.field)||col.name=='Set');
    let newWeekCols=[];

    for (day of weekDays) {
        let dayCol=weekCols[weekCols.map(col => col.field).indexOf(day)];
        let setCol=weekCols[weekCols.map(col => col.field).indexOf(`${day}_set`)];
        newWeekCols.push(dayCol);
        newWeekCols.push(setCol);
    }

    let newCols=preWeekCols.concat(newWeekCols).concat(postWeekCols);
    grid.setColumns(newCols);
    _prevColumns=newCols;
}

// Load user's weekly hours into item
loadUserHours=(recordPosition, item) => {
    for (day of _currentWeekDays) {
        let dayString=day.toString().slice(0, 3);
        let dayWorked=recordPosition.daysWorked[day.toLocaleDateString('en-US')];
        if (dayWorked) {
            item[dayString]=zeroNanToNull(dayWorked.hours)
            item[`${dayString}_set`]=dayWorked.set
        }
    }

    return item;
}

// Auto fills user data when a new user is added
autoFillUserData=(args) => {
    let item=args.item;
    let col=grid.getColumns()[args.cell];

    // Set _groupedBy property to unwritable
    if (_groupedBy) { Object.defineProperty(item, _groupedBy, { writable: false, configurable: true }) }

    // Do nothing if not editing auto-populate fields
    if (!['username', 'Position', 'Name'].includes(col.field)) { return }

    // Auto-populate if editing forwards
    if (_editDirectionForwards) {
        if (['Name', 'username'].includes(col.field)) {
            // Populate username from Name if chosen from dropdown
            if (col.field=='Name') {
                if (item['Name'].includes('[')&&item['Name'].includes(']')) {
                    let Name=item['Name'].slice(item['Name'].indexOf('[')+1, item['Name'].indexOf(']'))
                    let username=_allUsernames.find(u => u==Name)
                    item['username']=username
                    item['Name']=item['Name'].slice(0, item['Name'].indexOf('['))
                }
            }
            // Populate Name from username if username exists
            else {
                let Name=_dropdownNames.find(ddn => ddn.includes(item['username']))
                if (Name) {
                    item['Name']=Name.slice(0, Name.indexOf('['))
                }
            }
            // Populate user data
            for (key of ['Email', 'Phone', 'Date Joined']) {
                item[key]=undefined
            }
        } else {
            let posCode=item['Position']
            console.log(posCode)
            //clearShowRecordFields(item)
            item['Department']=_week.positions.positionList[item['Position']].Department
            item['Position']=posCode

        }
    } else { item=loadPrevItemFromCommand(item) }


    // Set _groupedBy property to writable again
    if (_groupedBy) { Object.defineProperty(item, _groupedBy, { writable: true }) }

    // Apply changes to the dataView
    dataView.updateItem(item.id, item);

    grid.invalidate();
    grid.setData(dataView);
    grid.render();
}

// Record which cells have been edited for updating daysworked hours
updateEditedFields=(args) => {
    let argCol=grid.getColumns()[args.cell];
    if (!args.item.editedfields) { args.item.editedfields=[] }
    // If this is a new edited field for this item, and the edit is valid, add the edited field to the item's edited fields
    if (!args.item.editedfields.includes(argCol.field)&&!_removeEditedField) {
        args.item.editedfields.push(argCol.field);
    }
}

// Recalculate item weekly total
recalculateWeeklyTotal=(args) => {
    let cellField=grid.getColumns()[args.cell].field;
    let weekDays=_currentWeekDays.map(day => day.toString().slice(0, 3));
    // Only update if editing a position or hours cell
    if (weekDays.includes(cellField)||cellField=='Position'||_week.crew.taxColumns.includes(cellField)) {
        args.item['Total']=calculateWeeklyTotal(args.item);
        // Apply changes to the dataView
        dataView.updateItem(args.item.id, args.item);
    }
}

// Calculate weekly totals for all items
calculateAllWeeklyTotals=() => {
    for (item of dataView.getItems()) {
        item['Total']=calculateWeeklyTotal(item)
        // Apply changes to the dataView
        dataView.updateItem(item.id, item);
    }
}

populateShowRecordData=(record, item) => {
    let recordPosition=_positions.find(pos => pos._id==record.positionid)||{};
    item=loadUserHours(record, recordPosition, item);
    item['Position']=recordPosition['Code'];
    item['Total']=calculateWeeklyTotal(item, record);
    item['Department']=recordPosition['Department'];
}

clearShowRecordFields=(item) => {
    let keepFields=['username', 'Name', 'Phone', 'Email', 'id', '#'];
    for (key of Object.keys(item)) {
        if (!keepFields.includes(key)) { item[key]=undefined }
    }
}

// Returns true if pos has days worked in the current week
daysWorkedInWeek=(pos) => {
    for (day of _currentWeekDays) {
        let dateKey=new Date(day).toLocaleDateString('en-US');
        if (pos.daysWorked[`${dateKey}`]) {
            return true
        }
    }
    return false
}

testFun=() => {
    console.log(grid);
    console.log(grid.getCellCssStyles('hangingSetsOrHours'));
}
