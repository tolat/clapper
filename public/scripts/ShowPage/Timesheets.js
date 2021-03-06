// Set context menu options 
setContextMenu=() => {
    // Add copy and paste to context menu
    document.getElementById('contextMenu').innerHTML=`
    <li onclick="triggerCopy()">Copy</li>
    <li onclick="triggerPaste()">Paste</li>
    <br>`

    document.getElementById('contextMenu').innerHTML+=getHideColumnsOptions();
}

// Set context menu options for column header
setHeaderContextMenu=(args) => {
    document.getElementById('contextMenu').innerHTML=getHideColumnsOptions();
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

// Hide and show generate timesheets modal
toggleGenerateTimesheetsModal=(show, generate=false) => {
    if (show) {
        // Show Modal
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('generate-timesheets-modal').style.display='flex';
        document.getElementById('new-timesheet-map-modal').focus()
    } else {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('generate-timesheets-modal').style.display=null;

        if (generate) {
            generateTimesheets()
        }
    }
}

// Generate timesheets through put request to server =>
generateTimesheets=() => {
    let template=document.getElementById('timesheet-template-selection').files[0]
    let data=new FormData()
    data.append('file', template)
    data.append('items', JSON.stringify(dataView.getItems()))

    // Cancel save if invalid cells remain
    if (invalidCellsRemain()) { return }

    toggleLoadingScreen(true, 'Generating...')
    let checkGenerationInterval

    // Post estimate data and version to server
    fetch(server+`/shows/${_args.showid}/Timesheets`, {
        method: 'PUT',
        body: data,
        credentials: 'include'
    }).then(response => { return response.json() })
        .then(responseData => {
            // Check evey  1000 ms to see if generation is done
            checkGenerationInterval=setInterval(() => {
                console.log('checking for timesheets...')
                fetch(server+`/checkgenerated/${responseData.file.filename}`, { method: 'GET', credentials: 'include' })
                    .then(response => { return response.json() })
                    .then(responseData => {
                        // If timesheets generated then download the .xlsx file from server
                        if (responseData.filename) {
                            toggleLoadingScreen(false)
                            downloadTimesheets(responseData.filename)
                            window.clearInterval(checkGenerationInterval)
                        }
                    })
            }, 1000);
        })
}

// Downlaod timesheets from server
function downloadTimesheets(filename) {
    let downloadElt=document.createElement('div')
    downloadElt.style.diplay='none'
    downloadElt.innerHTML=`<a id="download-link" href="/uploads/${filename}.xlsx" download></a>`
    document.body.appendChild(downloadElt)
    document.getElementById('download-link').click()
    downloadElt.parentElement.removeChild(downloadElt)
}

// Update Timesheets
saveData=(reload=false, newMapName=false, isNewMap=false, openMap=false, deleteMap=false) => {
    // Run pre save procedure
    if (!preSaveProcedure(reload)) { return }

    // Do nothing if trying to open current map
    if (!reload&&openMap) {
        toggleOpenTimesheetMapModal(false)
        return
    }

    // Close open timesheet map modal if rloading
    if (reload&&(openMap||deleteMap)) {
        toggleOpenTimesheetMapModal(false)
    }

    // Save value of copy current map checkbox
    const copyCurrentMap=document.getElementById('copy-current-checkbox').checked

    // Repopulate open maps modal if deleting map other than current map
    if (deleteMap&&!reload) {
        const map=_args.timesheetMaps.find(m => m.name==newMapName)
        _args.timesheetMaps.splice(_args.timesheetMaps.indexOf(map), 1)
        populateOpenMapsModal()
    }

    // Indicate grid is saving
    let statusElement=document.getElementById('save-status');
    statusElement.innerText='saving...';
    statusElement.style.color='rgb(255, 193, 49)';

    // Post estimate data and version to server
    fetch(server+`/shows/${_args.showid}/Timesheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: dataView.getItems(),
            newWeek: _newWeek,
            deletedWeek: _deletedWeek,
            newMapName: newMapName,
            isNewMap: isNewMap,
            openMap: openMap,
            deleteMap: deleteMap,
            copyCurrentMap: copyCurrentMap,
            currentWeekDays: _currentWeekDays,
            variables: _variables,
            displaySettings: {
                groupBy: _groupedBy,
                setColumnWidths: getColumnWidths(),
                setHiddenColumns: getHiddenColumns(),
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

// add variable picker to grid
addVariablePicker=() => {
    document.getElementById('grid-footer-totals-container').style.display='none'

    let varPicker=document.createElement("div")
    varPicker.id='varpicker-container'
    document.getElementById('grid-container').parentElement.appendChild(varPicker)
    document.getElementById('grid-container').style.width='82%'


    // Build Varpicker
    varPicker.innerHTML+=`<div style="margin-top: 5px; text-decoration: underline;"> Variables </div>`
    varPicker.innerHTML+='<div id="varpicker-variable-container"><div>'

    let varContainer=document.getElementById('varpicker-variable-container')
    for (v of _variables) {
        varContainer.innerHTML+=`<div class="varpicker-individual-variable-wrapper" onclick="assignVariable('${v.name}')">
            <div class = "varpicker-variable-name"> ${v.name}</div>
            <div class = "varpicker-variable-description"> ${v.description}</div>
        </div>`
    }
}

// Initlialize variables w/ descriptions for the Variable Picker grid pane
initializeVariables=() => {
    let variables=[
        {
            name: 'Show-Name',
            description: "Name of current show"
        }, {
            name: 'Crew-Name',
            description: "Crew Member's name"
        }, {
            name: 'Crew-Phone',
            description: "Crew Member's phone"
        }, {
            name: 'Crew-Position',
            description: "Position code for position worked"
        }, {
            name: 'Crew-Position-Rate',
            description: "Rate corresponding to position worked"
        }, {
            name: 'Crew-Position-Department',
            description: "Department corresponding to position worked"
        },
        {
            name: 'Week-End',
            description: "Date of the end of the current week"
        },
    ]

    for (day of _currentWeekDays) {
        const dayAbbrv=day.toString().slice(0, 3)
        variables.push({
            name: `${dayAbbrv}-Date`,
            description: `Calendar date for ${dayAbbrv} of current week`,
            type: 'weekday-date'
        })

        variables.push({
            name: `${dayAbbrv}-Hours-Total`,
            description: `Total hours worked on ${dayAbbrv} of current week`,
            type: 'total-hours'
        })

        variables.push({
            name: `${dayAbbrv}-Set`,
            description: `Set code for hours worked on ${dayAbbrv} of current week`,
            type: 'hours-setcode'
        })

        variables.push({
            name: `${dayAbbrv}-Episode`,
            description: `Episode for hours worked on ${dayAbbrv} of current week`,
            type: 'set-episode'
        })

        for (mul of _uniqueMuls) {
            variables.push({
                name: `${dayAbbrv}-Hours-${mul}x`,
                description: `Hours worked on ${dayAbbrv} of current week under ${mul}x multiplier`,
                type: 'multiplied-hours'
            })
        }
    }

    for (col in _args.extraColumns) {
        variables.push({
            name: `${col}`,
            description: `User added column from Crew page`,
            type: 'custom-column',
            col: col
        })
    }

    for (col of _args.taxColumns) {
        variables.push({
            name: `${col}`,
            description: `User added TAX column from Crew page`,
            type: 'custom-tax-column',
            col: col
        })
    }

    return variables
}

// Assign variable picker variable to grid cell
assignVariable=(varName) => {
    if (!_contextCell) { return }

    let editCommand={ type: "assignVariable" }
    editCommand.row=_contextCell.row
    editCommand.cell=_contextCell.cell
    editCommand.varName=varName
    editCommand.prevVal=dataView.getItemById(dataView.mapRowsToIds([editCommand.row])[0])[grid.getColumns()[editCommand.cell].field]

    editCommand.execute=executeAssignVariable
    editCommand.undo=undoAssignVariable

    queueAndExecuteEdit(false, false, editCommand)

}

// Execute ^
function executeAssignVariable() {
    let item=dataView.getItemById(dataView.mapRowsToIds([this.row])[0])
    item[grid.getColumns()[this.cell].field]=this.varName
    dataView.updateItem(item.id, item)

    grid.focus()
}

// Undo ^
function undoAssignVariable() {
    let item=dataView.getItemById(dataView.mapRowsToIds([this.row])[0])
    item[grid.getColumns()[this.cell].field]=this.prevVal
    dataView.updateItem(item.id, item)

    grid.focus()
}

// Initialize timesheet map using timesheet map's currentMap object
initializeMap=() => {
    let map=_args.timesheetMaps.find(m => m.name==_currentMap)
    for (col in map.cellValueMap) {
        for (row in map.cellValueMap[col]) {
            let item=dataView.getItemById(`${row}`)

            item[col]=map.cellValueMap[col][row]
            dataView.updateItem(item.id, item)
            grid.focus()
        }
    }
}

// Hide/show new timesheet map modal
toggleNewTimesheetMapModal=(show, createMap=false, renameMap=false, message) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('new-timesheet-map-modal').style.display=null;
        grid.focus()

        if (createMap) {
            let newMapName=document.getElementById('new-timesheet-map-modal-input').value
            saveData(true, newMapName, true)
        }

        if (renameMap) {
            let newMapName=document.getElementById('new-timesheet-map-modal-input').value
            saveData(true, newMapName)
        }
    }
    // Show modal
    else {
        // Show Modal
        if (renameMap) {
            document.getElementById('new-timesheet-map-modal-create').style.display='none'
            document.getElementById('new-timesheet-map-modal-rename').style.display='flex'
            document.getElementById('copy-current-checkbox-container').style.display='none'
        } else {
            document.getElementById('new-timesheet-map-modal-create').style.display='flex'
            document.getElementById('new-timesheet-map-modal-rename').style.display='none'
            if (_currentMap) {
                document.getElementById('copy-current-checkbox-container').style.display='flex'

            }
        }
        document.getElementById('new-timesheet-map-modal-message').innerText=message
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('new-timesheet-map-modal').style.display='flex';
        document.getElementById('new-timesheet-map-modal').focus()
    }
}

// Hide/show open timesheet map modal
toggleOpenTimesheetMapModal=(show, openName=false) => {
    // Hide Modal
    if (!show) {
        document.getElementById('grid-modal-container').style.display=null;
        document.getElementById('open-timesheet-map-modal').style.display=null;
        grid.focus()

        if (openName) {
            saveData(true, false, false, openName)
        }
    }
    // Show modal
    else {
        // Show Modal
        document.getElementById('grid-modal-container').style.display='flex';
        document.getElementById('open-timesheet-map-modal').style.display='flex';
        document.getElementById('open-timesheet-map-modal').focus()
    }
}

// Populate open maps modal with names of all timesheet maps
populateOpenMapsModal=() => {
    const tsCont=document.getElementById("open-timesheet-map-list-container")
    tsCont.innerHTML=null

    for (map of _args.timesheetMaps) {
        const isCurrentMap=_currentMap==map.name

        tsCont.innerHTML+=`
        <div style="display: flex; flex-direction: column; width: 100%; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between;"><div style="font-weight: bold;">${map.name}</div>
        <button style="color: green;" onclick="saveData(${!isCurrentMap},false,false,'${map.name}')">open</button></div>
        <button style="color: red; text-align: left;" onclick="saveData(${!isCurrentMap},false,false,false,'${map.name}')">delete</button>
        </div>
        `
    }
}

testFun=async () => {

}

