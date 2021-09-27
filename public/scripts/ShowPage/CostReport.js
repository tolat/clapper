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

    for (dep of _show.departments) {
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

// Gets the total funds allocated to a set
calculateBudget=(item) => {
    let ev=_show.costReport.estimateVersion
    let set=_show.sets.find(s => s['Set Code']==item['Set Code']);

    return parseFloat(set.estimateTotals[ev].total).toFixed(2);
}

// Finds first week containing a day
findFirstContainingWeek=(day, user) => {
    let dateMS=new Date(day).getTime()
    for (week of _show.weeks) {
        let weekEndMS=new Date(week.end).getTime()
        if (dateMS<=weekEndMS&&dateMS>=(weekEndMS-6*oneDay)) {
            if (week.crew.crewList.find(c => c.username==user.username)) {
                return week
            }
        }
    }
    return false
}

isInCurrentWeek=(day, user) => {
    let dateMS=new Date(day).getTime()
    let weekEndMS=new Date(_week.end).getTime()
    if (dateMS<=weekEndMS&&dateMS>=(weekEndMS-7*oneDay)) {
        if (_week.crew.crewList.find(c => c.username==user.username)) {
            return true
        }
    }
}

// Calculates the total spent on a set to date (labour, purchases, and rentals)
calculateCosts=(item) => {

    /* Add cost of crew labor for this set */
    // Initialize labor variable
    let departmentLabor={};
    for (d of _show.departments) { departmentLabor[d]={ week: 0, total: 0, mandays: 0 } }

    // Calculate
    for (user of _showCrew) {
        let record=user.showrecords.find(r => r.showid==_show._id);
        for (recordPosition of record.positions) {
            let position=_show.positions.positionList.find(p => p['Code']==recordPosition.code)
            for (day in recordPosition.daysWorked) {
                let week=findFirstContainingWeek(day, user)
                // Only count day worked if it has the same set code as the item and it falls in a valid week 
                if (recordPosition.daysWorked[day].set==item['Set Code']&&week) {
                    let multipliers=week.multipliers;
                    let hours=recordPosition.daysWorked[day].hours||0
                    let rate=position['Rate']
                    let dayOfWeek=new Date(day).toString().slice(0, 3);
                    let tax=0
                    for (taxCol of week.crew.taxColumns) {
                        tax+=record.weeksWorked[week._id].taxColumnValues[taxCol]||0
                    }

                    let cost=calculateDailyLaborCost(multipliers, hours, rate, dayOfWeek)*(tax/100+1);

                    // Add cost to correct department total and week cost 
                    for (k in departmentLabor) {
                        if (position['Department']==k) {
                            departmentLabor[k].total+=cost;
                            departmentLabor[k].mandays++;
                            if (isInCurrentWeek(day, user)) {
                                departmentLabor[k].week+=cost;
                            }
                        }
                    }
                }
            }
        }
    }

    /* Add rentals for this set */
    // Initialize rentals variable
    let departmentRentals={};
    for (d of _show.departments) { departmentRentals[d]={ week: 0, total: 0 } }

    // Calculate
    for (week of _show.weeks) {
        for (rental of week.rentals.rentalList) {
            if (rental['Set Code']==item['Set Code']) {
                // Don't count this rental if the supplier is not in the current week's crew list
                if (rental['Supplier']&&!week.crew.crewList.find(c => c['username']==rental['Supplier'])) { continue }

                let department=rental['Department']
                let daysRented=rental['Days Rented']||0
                let rate=rental['Day Rate']
                let tax=0
                for (taxCol of week.rentals.taxColumns) {
                    tax+=rental.taxColumnValues[taxCol]||0
                }

                let cost=(rate*daysRented)*(tax/100+1);

                for (k in departmentRentals) {
                    if (department==k) {
                        departmentRentals[k].total+=cost;
                        if (week._id==_week._id) {
                            departmentRentals[k].week+=cost;
                        }
                    }
                }
            }
        }
    }

    /* Add purchases for this set */
    // Initialize purchases variable
    let departmentPurchases={};
    for (d of _show.departments) { departmentPurchases[d]={ week: 0, total: 0 } }

    // Calculate
    for (p of _show.purchases.purchaseList) {
        if (p['Set Code']==item['Set Code']) {
            let cost=p['Amount'];
            let tax=0;
            for (tCol of _show.purchases.taxColumns) {
                let tVal=p.taxColumnValues[tCol]
                if (tVal) { tax+=tVal }
            }

            cost*=(tax/100+1);

            // Add cost to correct department
            for (key in departmentPurchases) {
                if (p['Department']==key) {
                    departmentPurchases[key].total+=cost;
                    if (p.weekId==_week._id) {
                        departmentPurchases[key].week+=cost;
                    }
                }
            }
        }
    }

    return [departmentLabor, departmentPurchases, departmentRentals];
}

// Save cost report
saveData=(reload=false, estimateVersion=_show.costReport.estimateVersion) => {
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

    // Grey screen if reloading since the save can take some time
    if (reload) { toggleLoadingScreen(true) }

    // Post estimate data and version to server
    fetch(server+`shows/${_show._id}/CostReport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: dataView.getItems(),
            extraColumns: _extraColumns,
            estimateVersion: estimateVersion,
            totals: updateTotalsRow(),
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
        })
    })
        .then(response => { return response.json() })
        .then(responseData => {
            if (reload) { location.reload() }
            else {
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
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('open-version-modal').style.display='flex';
        document.getElementById('open-version-modal').focus()
    }
}

// Set estimate version
openEstimate=(version) => {
    saveData(true, version);
}

// Scroll to department column
scrollToDeptCol=(dept) => {
    let cols=grid.getColumns();
    let idx=cols.indexOf(cols.find(c => c.id==`${dept}_budget`));
    grid.scrollColumnIntoView(cols.length-1);
    grid.scrollColumnIntoView(idx);
}

// Returns latest estimate version
getLatestVersion=() => {
    let toBeat=-Infinity;
    let latest;
    for (ver of Object.keys(_show.estimateVersions)) {
        let v=parseFloat(ver.replace("_", "."));
        if (v>toBeat) {
            latest=ver;
            toBeat=v;
        }
    }
    return latest;
}

testFun=() => {
    console.log(_show);
}
