var Tabulator=require('tabulator-tables');

//Global Variables
var _selectionStart=null;
var _selectionEnd=null;
var _selectedCells=[];
var redrawSelection=true;
var table=null;


createTable=(data, columns) => {
    // Create Tabulator table
    table=new Tabulator("#table", {
        data: data,
        columns: columns,
        height: '1000px', // *** Make sure to set dynamically ***
        layout: "fitDataTable",
        clipboard: false,
        history: true,
        movableColumns: true,
        addRowPos: "bottom",
        cellMouseEnter: (e, cell) => { _selectionEnd=cell, redrawSelection=true; },
    });

    // Add row on "Add Row" button click
    document.getElementById("add-row").addEventListener("click", function () {
        table.addRow({});
    });

    // Key listeners
    window.addEventListener('keydown', e => {
        // Undo and Redo events
        if (e.ctrlKey&&e.key==='z'||e.metaKey&&e.key==='z') {
            if (e.shiftKey) { table.redo() }
            else { table.undo() }
        }

        // Prevent default tabulator key handling
        if (e.key=='ArrowUp'||e.key=='ArrowDown'||e.key=='ArrowLeft'||e.key=='ArrowRight') {
            if (document.getElementById('table').focus==true) {
                e.stopPropagation();
            }
        }
    });

    // Mouse Listeners
    window.addEventListener('mousedown', e => {
        if (_selectionStart&&e.target==_selectionStart.getElement()) {
            window.addEventListener('mousemove', outlineSelection);
            window.addEventListener('mouseup', stopOutliningSelection);
        }
    });
}

toggleCreateShow=(value) => {
    document.getElementById("grayOut").style.display=value;
    document.getElementById("create-show-container").style.display=value;
    if (value!=null) {
        window.addEventListener('keydown', e => {
            if (e.key=='Enter') {
                e.preventDefault();
                for (i of document.querySelectorAll('input.department-input')) { i.blur() }
                if (document.querySelector('.entered-department-container')) {
                    addDepartment();
                }
            }
        })
    }
    else {
        document.getElementById('entered-departments').innerHTML=null;
    }
}

addDepartment=() => {
    let newInput=document.createElement('input');
    newInput.classList.add('department-input');
    newInput.type='text';
    newInput.placeholder='Enter department name..';
    newInput.name='show[departments]';

    let newDeleteButton=document.createElement('div');
    newDeleteButton.classList.add('delete-department-button');
    newDeleteButton.innerText='Delete';
    newDeleteButton.onclick=e => {
        e.target.parentElement.remove();
    }

    let newInputContainer=document.createElement('div');
    newInputContainer.classList.add('entered-department-container');
    newInputContainer.appendChild(newInput);
    newInputContainer.appendChild(newDeleteButton);

    const firstChild=document.querySelector('.entered-department-container');
    if (firstChild) {
        document.getElementById('entered-departments').insertBefore(newInputContainer, firstChild);
    } else {
        document.getElementById('entered-departments').appendChild(newInputContainer);
    }
    newInput.focus();
}

clickCell=(cell) => {
    cellElement=cell.getElement();
    // If cell is not selected, select it and outline it as the selection
    if (!(cell==_selectionStart)) {
        clearAllSelection();
        _selectionStart=cell;
        _selectionEnd=cell;
        _selectedCells=[cell];
    }
    // Else open the editor (second click)
    else { cell.edit(true) }
}

outlineSelection=(e) => {
    if (!redrawSelection) { return }
    const startRow=_selectionStart.getRow().getPosition();
    const startCol=getColumnNumber(_selectionStart);
    const endRow=_selectionEnd.getRow().getPosition();
    const endCol=getColumnNumber(_selectionEnd);

    // Get selected cells
    getSelectedCells(startRow, startCol, endRow, endCol);

    for (cell of _selectedCells) {
        cell.getElement().style.backgroundColor='lightblue';
    }

    /* // Handle different quadrants of selection
    switch (getSelectionQuadrant(startRow, startCol, endRow, endCol)) {
        case 'topleft':
            outlineCells(startRow, startCol, endRow, endCol, '1px 0px 0px 0px', '0px 0px 1px 0px', '0px 0px 0px 1px', '0px 1px 0px 0px');
        case 'topright':
            outlineCells(startRow, startCol, endRow, endCol, '1px 0px 0px 0px', '0px 0px 1px 0px', '0px 1px 0px 1px', '0px 0px 0px 1px');
        case 'bottomleft':
            outlineCells(startRow, startCol, endRow, endCol, '0px 0px 1px 0px', '0px 0px 1px 0px', '0px 0px 0px 1px', '0px 1px 0px 0px');
        case 'bottomright':
            outlineCells(startRow, startCol, endRow, endCol, '0px 0px 1px 0px', '1px 0px 0px 0px', '0px 1px 0px 0px', '0px 0px 0px 1px');
    } */

    redrawSelection=false;
}

function getSelectionQuadrant(startRow, startCol, endRow, endCol) {
    if (startRow>endRow) {
        if (startCol>endCol) { return 'topleft' }
        else { return 'topright' }
    }
    if (startCol>endCol) { return 'bottomleft' }
    else { return 'bottomright' }

}

function outlineCells(startRow, startCol, endRow, endCol, endRowBorder, startRowBorder, endColBorder, startColBorder) {
    for (cell of _selectedCells) {
        cell.getElement().style.border='solid rgb(24, 135, 86)';
        if (cell.getRow().getPosition()==endRow) { cell.getElement().style.borderWidth=endRowBorder }
        if (cell.getRow().getPosition()==startRow) { cell.getElement().style.borderWidth=startRowBorder }
        if (getColumnNumber(cell)==endCol) { cell.getElement().style.borderWidth=endColBorder }
        if (getColumnNumber(cell)==startCol) { cell.getElement().style.borderWidth=startColBorder }
    }
}

function getSelectedCells(startRow, startCol, endRow, endCol) {
    // Clear selected cells and their selection styling
    for (cell of _selectedCells) { cell.getElement().style.backgroundColor=null; }
    _selectedCells=[];

    // Make sure startRow is the uppermost row
    if (startRow>endRow) {
        const temp=startRow;
        startRow=endRow;
        endRow=temp;
    }

    // Make sure startCol is the leftmost column
    if (startCol>endCol) {
        const temp=startCol;
        startCol=endCol;
        endCol=temp;
    }

    // Gather selected cells in _selectedCells
    for (row of table.rowManager.rows.slice(startRow, endRow+1)) {
        for (c of row.cells) {
            let cCol=getColumnNumber(c.component);
            if (cCol>=startCol&&cCol<=endCol) { _selectedCells.push(c.component) }
        }
    }
}

isSelected=(cell) => {
    return cell==_selectionStart;
}

stopOutliningSelection=(e) => {
    window.removeEventListener('mousemove', outlineSelection);
    window.removeEventListener('mouseup', stopOutliningSelection);
}

function getColumnNumber(cell) {
    const columns=table.columnManager.columns;
    for (let i=0; i<columns.length; i++) {
        if (columns[i].component==cell.getColumn()) { return i }
    }
    return -1;
}

function clearAllSelection() {
    _selectionStart=null;
    _selectionEnd=null;
    for (cell of _selectedCells) {                //DELETE
        cell.getElement().style.backgroundColor=null;
    }
    _selectedCells=[];
}







