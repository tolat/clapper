const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const crudUtils=require('./utils')
const numUtils=require('../../utils/numberUtils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals, user, dataOnly) {
    let show=await populateShow(id);

    // Get accessProfile
    let apName=await crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile][section]

    // Generate grid data
    let week=show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)
    let data=initializeData(week.rentals.rentalList, week, accessProfile)
    let currentWeekSetCodes=await show.estimateVersions[show.accessMap[apName].estimateVersion].sets.map(s => s['Set Code'])

    args.reloadOnWeekChange=true

    // Generate a map of all show crew usernames to their position codes for this week
    const allShowUsers=await crudUtils.getAllCrewUsers(await crudUtils.getAllCrewIDs(show._id))
    let userPosForWeekMap={}
    let userNamesForWeekMap={}
    for (user of allShowUsers) {
        const record=user.showrecords.find(r => r.showid==show._id.toString())
        for (pos of record.positions) {
            let daysWorkedInWeek=false
            // Mark this position as worked in week if it has dasy worked in the current week
            for (day in pos.daysWorked) {
                if (await crudUtils.isInCurrentWeek(day, user, week)) {
                    daysWorkedInWeek=true
                }
            }
            if (daysWorkedInWeek) {
                // Generate userNameMap
                if (!userNamesForWeekMap[user.username]) { userNamesForWeekMap[user.username]=user.Name||'* name empty *' }
                // Generate userPosMap
                if (!userPosForWeekMap[user.username]) { userPosForWeekMap[user.username]=[] }
                if (!userPosForWeekMap[user.username].includes[pos.code]) { userPosForWeekMap[user.username].push(pos.code) }
            }
        }
    }

    // Generate a map of all position codes to their department
    let posDeptMap={}
    for (pos in week.positions.positionList) {
        posDeptMap[pos]=week.positions.positionList[pos].Department
    }

    // Create a list of estimateVersion keys sorted by date
    let sortedVersionKeys=Object.keys(show.estimateVersions)
        .map(k => { show.estimateVersions[k].key=k; return show.estimateVersions[k] })
        .sort((a, b) => a.dateCreated>b.dateCreated? -1:1)
        .map(ev => ev.key)

    args.taxColumns=week.rentals.taxColumns
    args.extraColumns=week.rentals.extraColumns

    // Just send back data if this is a data only request
    if (dataOnly) {
        res.send({ data })
    } else {
        res.render('ShowPage/Template', {
            title: `${show['Name']} - ${section}`,
            show,
            section,
            args,
            sharedModals,
            pageModals,
            data,
            accessProfile,
            user,
            apName,
            currentWeekSetCodes,
            userPosForWeekMap,
            userNamesForWeekMap,
            posDeptMap,
            sortedVersionKeys
        })
    }
}

// Update rentals
module.exports.update=async function (body, showId, user) {
    let show=await Show.findById(showId).populate('weeks.crew.crewList')

    // Get accessProfile
    let apName=await crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile].Rentals

    // Get current Week
    let week=show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)

    // Save display settings to access profile
    accessProfile.displaySettings[apName][week._id]=body.displaySettings;
    show.markModified('accessProfiles');

    // Save extra Columns to week
    week.rentals.extraColumns=body.extraColumns;
    show.markModified('positions.extraColumns');

    // Save tax Columns to week
    week.rentals.taxColumns=body.taxColumns;
    show.markModified('positions.extraColumns');

    // Update rental list
    let updatedList=[]
    const RFSkeys=['Day Rate', 'Set Code', 'Department']
    for (item of body.data) {
        if (crudUtils.isValidItem(item, RFSkeys, accessProfile)&&!crudUtils.isRestrictedItem(item, accessProfile)) {
            let rental=await week.rentals.rentalList.find(r => r._id==item._id)

            // If no rental exists, create new rental
            if (!rental) {
                rental={
                    taxColumnValues: {},
                    extraColumnValues: {}
                }
                week.rentals.rentalList.push(rental)
            }

            let displayKeys=['Rental Type', 'Day Rate', 'Set Code', 'Department', 'Days Rented', 'Supplier', 'Supplier Code']
            for (key of displayKeys) {
                if (!crudUtils.isRestrictedColumn(key, accessProfile))
                    rental[key]=item[key];
            }

            // Save extra column values, deferring to previous value if this column in restricted
            let previousValues=rental.extraColumnValues
            rental.extraColumnValues={}
            for (key of body.extraColumns) {
                !crudUtils.isRestrictedColumn(key, accessProfile)? rental.extraColumnValues[key]=item[key]:
                    rental.extraColumnValues[key]=previousValues[key]
            }

            // Save tax column values, deferring to previous value if this column in restricted
            previousValues=rental.taxColumnValues
            rental.taxColumnValues={}
            for (key of body.taxColumns) {
                !crudUtils.isRestrictedColumn(key, accessProfile)? rental.taxColumnValues[key]=item[key]:
                    rental.taxColumnValues[key]=previousValues[key]
            }

            // If item is not restricted, add it to the updated list, otherwise add its old data
            updatedList.push(rental)
        }
    }

    // Add old values for restricted items to the updated List
    let restrictedItems=await crudUtils.getRestrictedItems(week.rentals.rentalList, accessProfile, '_id')
    for (item of restrictedItems) {
        updatedList.push(week.rentals.rentalList.find(rental => rental['_id']==item))
    }

    week.rentals.rentalList=updatedList
    show.markModified('weeks')
    await show.save()


    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, genUniqueId(), apName)
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks, apName)
    }

    return {}
}

// Creates grid data 
function initializeData(rentals, _week, accessProfile) {
    let data=[];

    for (let i=0; i<rentals.length; i++) {
        let item={
            id: 'id_'+i,
            _id: rentals[i]._id,
            'Day Rate': rentals[i]['Day Rate'],
            'Days Rented': rentals[i]['Days Rented'],
            'Rental Type': rentals[i]['Rental Type'],
            'Department': rentals[i]['Department'],
            'Set Code': rentals[i]['Set Code'],
            'Supplier': rentals[i]['Supplier'],
            'Supplier Code': rentals[i]['Supplier Code'],
            editedfields: []
        }

        for (taxCol of _week.rentals.taxColumns) {
            item[taxCol]=numUtils.zeroNanToNull(parseFloat(rentals[i].taxColumnValues[taxCol]))
        }

        for (extraCol of _week.rentals.extraColumns) {
            item[extraCol]=rentals[i].extraColumnValues[extraCol]
        }

        item['Week Total']=getWeekTotal(item, _week)

        data.push(item);
    }

    let restrictedItems=crudUtils.getRestrictedItems(data, accessProfile, '_id')
    data=crudUtils.filterRestrictedColumnData(data, accessProfile, '_id')
        .filter(item => !restrictedItems.includes(item['_id']))

    return data;
}

function getWeekTotal(item, _week) {
    if (!item['Department']||!item['Day Rate']||!item['Set Code']) { return }
    let rate=parseFloat(item['Day Rate'])||0;
    let days=parseFloat(item['Days Rented'])||0;
    let tax=0
    for (taxCol of _week.rentals.taxColumns) {
        let taxAmount=parseFloat(item[taxCol])||0
        tax+=taxAmount
    }

    return (rate*days*(tax/100+1)).toFixed(2);
}


