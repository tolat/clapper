
// Displays and hides the 'Create Show' modal 
toggleCreateShow=(value) => {
    document.getElementById('tzone').value=-new Date().getTimezoneOffset()/60;
    document.getElementById("grid-modal-container").style.display=value;
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

// Adds a department DOM element to 'Create Show' Modal when user adds a department
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

toggleDeleteShowWarningModal=(show, del=false, showid=null) => {
    if (show) {
        document.getElementById('grid-modal-container').style.display='flex'
        document.getElementById('delete-show-warning-modal').style.display='flex'
        document.getElementById('delete-show-warning-modal-id-container').innerText=showid
        let showName=document.getElementById(`${showid}_name`).innerText
        document.getElementById('delete-show-warning-modal-show-name').innerText=showName+'?'
    } else {
        document.getElementById('grid-modal-container').style.display=null
        document.getElementById('delete-show-warning-modal').style.display=null
        if (del) {
            let id=document.getElementById('delete-show-warning-modal-id-container').innerText
            deleteShow(id)
        }
    }
}

// Sends a delete request to the server to delete show 
deleteShow=(showid) => {
    // Send Delete request to server
    fetch(_args.server+`/shows/${showid}`, { method: 'DELETE' })
        .then(response => { return response.json() })
        .then(responseData => {
            if (responseData.redirect) {
                window.location=responseData.redirect
            } else {
                document.getElementById(`${showid}-table-item`).remove()
                document.getElementById('show-count-indicator').innerText=parseInt(document.getElementById('show-count-indicator').innerText)-1
            }
        })

}