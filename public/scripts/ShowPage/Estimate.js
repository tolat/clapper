// Hides or shows the 'Enter Version' Modal for the Slick.grid
toggleEnterVersionModal=(show, firstEstimate=false, isNewVersion=false) => {
    // Hide modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('enter-version-modal').style.display=null;
        document.querySelector('#enter-version-modal-blank-selector').style.display=null;
        document.querySelector('#enter-version-modal-submit').setAttribute('onclick', 'updateVersionName()');
        grid.focus()
    }
    // Show modal
    else {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('enter-version-modal').style.display='flex';
        document.getElementById('enter-version-modal').focus()
        // Set first estimate and new estimate modal text
        if (firstEstimate||isNewVersion) {
            document.querySelector('#enter-version-modal label').innerText='Enter new estimate version number:';
            document.querySelector('#enter-version-modal input').placeholder="E.g. '1001' or 'A100' etc.";
            document.querySelector('#enter-version-modal input').focus();
            // Show option to create a new blank version if creating a new version
            if (isNewVersion) {
                document.querySelector('#enter-version-modal-blank-selector').style.display='flex';
                document.querySelector('#enter-version-modal-submit').setAttribute('onclick', 'updateVersionName(true)');
            }
            // Otherwise just hide the cancel option (no cancel on first estimate)
            else {
                document.querySelector('#enter-version-modal-cancel').style.display='none';
            }
        }
        // Otherwise Set regular modal text
        else {
            document.querySelector('#enter-version-modal label').innerText='Note: \n Changing the version number will save and refresh the page, clearing your undo/redo history. \n \n Enter new version number: \n \n ';
            document.querySelector('#enter-version-modal input').placeholder=`${_version.replaceAll("_", ".")}`;
            document.querySelector('#enter-version-modal input').focus();
            document.querySelector('#enter-version-modal button').style.display=null;
        }
    }
}

// Hides or shows the 'add department' Modal for the Slick.grid
toggleAddDepartmentModal=(show, addDep=false) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('add-department-modal').style.display=null;
        grid.focus()
        if (addDep) {
            grid.setColumns(grid.getColumns().concat(addDepartment(document.getElementById('add-department-input').value, true)));
            document.getElementById('add-department-input').value=null;
            toggleManDayRatesModal(true);
        }
    }
    // Show modal
    else {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('add-department-modal').style.display='flex';
        document.getElementById('add-department-modal').focus()
    }
}

// Add a new department to the show
addDepartment=(d, saveAll=false) => {
    let mdKey=`${d} Man Days`;
    let lrKey=`${d} Labor`;
    let mtKey=`${d} Materials`;
    let rlKey=`${d} Rentals`;
    columns=[
        {
            id: mdKey, name: 'Man Days', field: mdKey, width: 80, minWidth: 50,
            editor: Slick.Editors.Text, sortable: true, headerCssClass: `${d.replaceAll(" ", "")}_cssClass`,
            groupTotalsFormatter: sumTotalsFormatter, cssClass: 'mandays'
        },
        {
            id: lrKey, name: 'Labor', field: lrKey, width: 80, minWidth: 50,
            editor: Slick.Editors.Text, sortable: true, headerCssClass: `${d.replaceAll(" ", "")}_cssClass`,
            groupTotalsFormatter: sumTotalsDollarsFormatter, cssClass: 'currency'
        },
        {
            id: mtKey, name: 'Materials', field: mtKey, width: 80, minWidth: 50,
            editor: Slick.Editors.Text, sortable: true, headerCssClass: `${d.replaceAll(" ", "")}_cssClass`,
            groupTotalsFormatter: sumTotalsDollarsFormatter, cssClass: 'currency'
        },
        {
            id: rlKey, name: 'Rentals', field: rlKey, width: 80, minWidth: 50,
            editor: Slick.Editors.Text, sortable: true, headerCssClass: `${d.replaceAll(" ", "")}_cssClass`,
            groupTotalsFormatter: sumTotalsDollarsFormatter, cssClass: 'currency'
        },
    ]

    // Prevent duplicates from being added
    if (!_show.departments.includes(d)) { _show.departments.push(d) }

    addDepartmentCssClass(d);
    addToDepartmentsBar(d, `${d.replaceAll(" ", "")}_cssClass`, `toggleDepartmentClickedModal(true, '${d}')`);
    updateSaveStatus(false);

    return columns
}

// Hides or shows the 'Department Clicked' modal
toggleDepartmentClickedModal=(show, dep, del) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('department-clicked-modal').style.display=null;
        grid.focus()
        let dep=document.getElementById('department-store').innerText;
        let color=document.getElementById('department-color-input').value;
        if (color!=_show.departmentColorMap[dep]) { addDepartmentCssClass(dep, color) }
        if (del) {
            deleteDepartment(document.getElementById('department-store').innerText);
        }
    }
    // Show modal
    else {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('department-clicked-modal').style.display='flex';
        document.getElementById('department-clicked-modal').focus()
        document.getElementById('department-clicked-modal-title').innerText=`${dep} Department`;
        document.getElementById('department-store').innerText=dep;
        document.getElementById('department-color-input').value=_show.departmentColorMap[dep];
    }
}

// Remove department from the show
deleteDepartment=(dep) => {
    _show.departments.splice(_show.departments.indexOf(dep), 1);
    document.getElementById(`${dep}_dbarItem`).remove();

    let cols=grid.getColumns();
    let newCols=[];
    for (col of cols) { if (!col.field.includes(dep)) { newCols.push(col) } }
    grid.setColumns(newCols);

    updateEstimateMathColumns();
    updateTotalsRow();
    updateSaveStatus(false);
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

// Hides or shows the 'Delete Version' Modal for the Slick.grid
toggleDeleteVersionModal=(show) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('delete-version-modal').style.display=null;
    }
    // Show modal
    else {
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('delete-version-modal').style.display='flex';
    }
}

// Hides or shows the 'Man Day Rates' Modal for the Slick.grid
toggleManDayRatesModal=(show, setRates) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('manday-rates-modal').style.display=null;
        if (setRates) {
            for (d of _show.departments) {
                _mandayRates[d]=parseFloat(document.getElementById(`${d}_mandayRate`).value);
            }

            updateEstimateMathColumns();
            balanceAllLaborMandays();
            updateTotalsRow();
            updateSaveStatus(false);
        }
    }
    // Show modal
    else {
        if (_show.departments.length==0) { return }
        populateMandayRates();
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('manday-rates-modal').style.display='flex';
    }
}

// Populates the Man Day rates modal with stored man day rates for this estimate version
populateMandayRates=() => {
    let cont=document.getElementById('manday-rates-container');
    cont.innerHTML=null;
    for (d of _show.departments) {
        cont.innerHTML+=`<div class="rate-container">
        <div style="min-width: 2rem;">${d}</div>
        <div>
        $\xa0<input class="manday-rates-modal-input" id="${d}_mandayRate" value="${_mandayRates[d]}" type="number">
        </div>
        </div>`;
    }
}

// Hides or shows the 'Fringes' Modal for the Slick.grid
toggleFringesModal=(show, setFringes=false) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('fringes-modal').style.display=null;
        if (setFringes) {
            for (f of Object.keys(_fringes)) {
                _fringes[f]=parseFloat(document.getElementById(`${f}_fringe`).value);
            }
            updateEstimateMathColumns();
        }
    }
    // Show modal
    else {
        populateFringes();
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('fringes-modal').style.display='flex';
    }
}

// Populates the fringes modal with stored fringes for this estimate version
populateFringes=() => {
    let cont=document.getElementById('fringes-container');
    cont.innerHTML=null;
    for (key of Object.keys(_fringes)) {
        cont.innerHTML+=`<div id="${key}_fringe-container" style="display: flex; justify-content: space-between; width: 100%;">
        <div style="min-width: 2rem;">${key}</div>
        <div style="display: flex; justify-content: flex-end;">
        <input class="modal-input" id="${key}_fringe" value="${_fringes[key]}">\xa0%
        </div></div>
        <button style="color: red;" onclick="deleteFringe('${key}')">Delete</button>`;
    }
}

// Delete a fringe
deleteFringe=(key) => {
    delete _fringes[key];
    toggleFringesModal(false);
    toggleFringesModal(true);
}

// Hides or shows the 'Add Fringe' Modal for the Slick.grid
toggleAddFringeModal=(show, addFringe=false) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('add-fringe-modal').style.display=null;
        if (addFringe) {
            _fringes[document.getElementById('add-fringe-input').value]=0;
        }
        toggleFringesModal(true);
    }
    // Show modal
    else {
        toggleFringesModal(false);
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('add-fringe-modal').style.display='flex';
    }
}

// Updates the displayed version name
updateVersionName=(isNewVersion=false) => {
    document.getElementById('estimate-version-display').innerText=document.getElementById('enter-version').value;
    toggleEnterVersionModal(false);

    // save estimate as new version and blank if specified, then hide enter version modal
    let isBlankVersion=false;
    if (isNewVersion) {
        isBlankVersion=document.getElementById('blank-selector-checkbox').checked;
    }
    saveData(isNewVersion, isBlankVersion);
}

// Open estimate
openEstimate=(version) => {
    window.location=server+`shows/${_show._id}/Estimate?version=${version}`
}

// Delete estimate version
deleteVersion=() => {
    // Indicate grid is deleting
    let statusElement=document.getElementById('save-status');
    statusElement.innerText='DELETING...';
    statusElement.style.color='red';
    toggleDeleteVersionModal(false);

    // Get current version from estimate-version-display. replace '.' with '_' to avoid database bson key problems
    let currentVersion=document.getElementById('estimate-version-display').innerText.replace('.', '_');

    fetch(server+`shows/${_show._id}/Estimate`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            version: currentVersion
        })
    })
        .then(response => { return response.json() })
        .then(responseData => { window.location=server+`shows/${_show._id}/Estimate?version=${responseData.latestVersion}` })
}

// Update estimate version
saveData=(isNewVersion=false, isBlankVersion=false) => {
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

    // Get current version from estimate-version-display. replace '.' with '_' to avoid database bson key problems
    let currentVersion=document.getElementById('estimate-version-display').innerText.replace('.', '_');

    // Post estimate data and version to server
    fetch(server+`shows/${_show._id}/Estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: dataView.getItems(),
            extraColumns: _extraColumns,
            mandayRates: _mandayRates,
            fringes: _fringes,
            departmentTotals: _departmentTotals,
            departments: _show.departments,
            originalVersion: _version,
            version: currentVersion,
            departmentColorMap: _show.departmentColorMap,
            isNewVersion: isNewVersion,
            isBlankVersion: isBlankVersion,
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
            // Clear items with a deleted required-for-save field
            clearDeletedItems();
            // Update Totals
            updateTotalsRow()
            // If a new estimate was created or the version name was changed, navigate to new version page
            if (isNewVersion||currentVersion!=_version) {
                window.location=server+`shows/${_show._id}/Estimate?version=${currentVersion}`;
            } else {
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

// Update Math column data
updateEstimateMathColumns=() => {
    // Create an object with set id keys and corresponding previous version total values for each set.
    let previousVersion=false;
    let previousVersionSetTotals={};
    if (_show.estimateVersions&&Object.keys(_show.estimateVersions).length>1) {
        let versions=Object.keys(_show.estimateVersions).sort((a, b) => {
            return (parseFloat(b.replace("_", "."))-parseFloat(a.replace("_", ".")));
        });
        previousVersion=versions[versions.indexOf(_version)+1];
        for (set of _show.sets) {
            if (previousVersion) {
                previousVersionSetTotals[set._id]=set.estimateTotals[previousVersion].total;
            }
        }
    }

    let items=dataView.getItems();
    for (item of items) {
        let nofringes=0;
        let current=0;
        let vals=[];
        let totalFringe=1;
        if (Object.keys(_fringes)[0]) { totalFringe=Object.keys(_fringes).map(key => parseFloat(_fringes[key])).reduce((a, b) => a+b)/100+1 }

        // Calculate NoFringes and Current cost. Rate and fringe applies only to mandays
        for (dep of _show.departments) {
            let rate=_mandayRates[dep];
            let mandays=parseFloat(item[`${dep} Man Days`]);
            let materials=parseFloat(item[`${dep} Materials`]);
            let rentals=parseFloat(item[`${dep} Rentals`]);

            // Set NaN values to 0
            vals=[rate, mandays, materials, rentals];
            for (let i=0; i<vals.length; i++) { if (isNaN(vals[i])) { vals[i]=0 } }

            let noFringe=vals[0]*vals[1]+vals[2]+vals[3];
            let curr=totalFringe*vals[0]*vals[1]+vals[2]+vals[3];

            // Update running totals
            nofringes+=noFringe;
            current+=curr;

            // Save department total
            if (!item.departmentTotals) { item.departmentTotals={} }
            item.departmentTotals[dep]=curr;

        }
        item['No Fringes']=zeroNanToNull(nofringes.toFixed(2));
        item['Current']=zeroNanToNull(current.toFixed(2));

        // Set Previous version cost if there is a previous version
        if (previousVersion&&item.setid) {
            item['Previous']=zeroNanToNull(previousVersionSetTotals[item.setid]);
            item['Variance']=zeroNanToNull((item['Current']-item['Previous']).toFixed(2));
        }
    }

    dataView.setItems(items);
    grid.invalidate();
    grid.setData(dataView);
    grid.render();

}

// Returns true if key is a department key e.g. 
isDepartmentKey=(key) => {
    for (d of _show.departments) {
        if (key==`${d} Man Days`||key==`${d} Materials`||key==`${d} Rentals`||key==`${d} Labor`) {
            return true;
        }
    }
    return false;
}

// Gets the aggregators for grouping estimates
getGroupAggregators=() => {
    let aggregators=[];
    for (dep of _show.departments) {
        aggregators.push(...[
            new Slick.Data.Aggregators.Sum(`${dep} Man Days`),
            new Slick.Data.Aggregators.Sum(`${dep} Materials`),
            new Slick.Data.Aggregators.Sum(`${dep} Rentals`),
            new Slick.Data.Aggregators.Sum(`${dep} Labor`)
        ])
    }
    aggregators.push(...[
        new Slick.Data.Aggregators.Sum("Current"),
        new Slick.Data.Aggregators.Sum("No Fringes"),
        new Slick.Data.Aggregators.Sum("Previous"),
        new Slick.Data.Aggregators.Sum("Variance"),
    ])
    return aggregators;
}

// Sets the content of the context menu
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

// Sets the content of the context menu when clicking on a header
setHeaderContextMenu=(args) => {
    document.getElementById('contextMenu').innerHTML=getHideColumnsOptions(args.column);

    document.getElementById('contextMenu').innerHTML+=`<li onclick='toggleAddColumnModal(true, 0)'>Add column left</li><li onclick='toggleAddColumnModal(true, 1)'>Add column right</li>`;
    if (args.column.deletable) {
        document.getElementById('contextMenu').innerHTML=document.getElementById('contextMenu').innerHTML+`<li onclick='deleteColumn()'>Delete column</li>`;
    }
}

// Checks if code is a duplicate of an existing code in the grid
isDuplicateCode=(code) => {
    let items=dataView.getItems();
    let count=0;
    for (item of items) {
        if (item['Set Code']&&item['Set Code']==code) { count++ }
    }
    return count>1;
}

// Returns an array containing the fields of every department column
getDepartmentColumnFields=() => {
    let fields=[];
    for (dep of _show.departments) {
        fields.push(`${dep} Man Days`);
        fields.push(`${dep} Materials`);
        fields.push(`${dep} Rentals`);
    }
    return fields;
}

// Makes sure an edit to a mandays column will be reflected in the corresponding labor column and vice-versa
balanceLaborManDays=(args) => {
    let dep=false;
    let col=grid.getColumns()[args.cell];
    for (d of _show.departments) {
        if (col.field.includes(d)) { dep=d }
    }

    if (_editDirectionForwards) {
        if (col.name=='Labor') {
            let labor=parseFloat(args.item[`${dep} Labor`]);
            if (labor) {
                args.item[`${dep} Man Days`]=labor/_show.estimateVersions[_version].mandayRates[dep];
            }
        }
        if (col.name=='Man Days') {
            let mandays=parseFloat(args.item[`${dep} Man Days`]);
            if (mandays) {
                args.item[`${dep} Labor`]=parseFloat(mandays*_show.estimateVersions[_version].mandayRates[dep]).toFixed(2);
            }
        }
    } else {
        let command=undoRedoBuffer.commandQueue[undoRedoBuffer.commandCtr];
        if (command.isClipboardCommand) {
            prevItem=command.previousItems.find(i => i.id==args.item.id);
        } else {
            prevItem=command.previousItem;
        }

        if (prevItem) { args.item=prevItem }
    }

    dataView.updateItem(args.item.id, args.item);
}

// Calls balanceLaborMandays on all items
balanceAllLaborMandays=() => {
    // Balance Labor Man Days for all items
    for (item of dataView.getItems()) {
        for (d of _show.departments) {
            let cell=grid.getColumns().map(c => c.field).indexOf(`${d} Man Days`);
            balanceLaborManDays({ item: item, cell: cell });
        }
    }
}
