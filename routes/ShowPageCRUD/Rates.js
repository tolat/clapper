const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const crudUtils=require('./utils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals, user, dataOnly) {
    let show=await populateShow(id);

    // Get accessProfile
    let apName=await crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile][section]

    // Generate grid data
    let week=show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)
    let data=initializeData(week.positions.positionList, show, args, week, accessProfile)

    // Create a list of estimateVersion keys sorted by date
    let sortedVersionKeys=Object.keys(show.estimateVersions)
        .map(k => { show.estimateVersions[k].key=k; return show.estimateVersions[k] })
        .sort((a, b) => a.dateCreated>b.dateCreated? -1:1)
        .map(ev => ev.key)

    args.extraColumns=week.positions.extraColumns
    args.multipliers=week.multipliers

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
            accessProfile,
            data,
            user,
            apName,
            sortedVersionKeys
        })
    }
}

// Update rates 
module.exports.update=async function (body, showId, user) {
    let show=await Show.findById(showId).populate('crew.crewList')

    // Get access profile
    let apName=await crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile].Rates
    let apOptions=show.accessProfiles[show.accessMap[apName].profile].options

    // Set week
    let week=show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)

    // Save display settings to access profile
    accessProfile.displaySettings[apName][week._id]=body.displaySettings;
    show.markModified('accessProfiles');

    // Save extra Columns to week
    week.positions.extraColumns=body.extraColumns;
    show.markModified('positions.extraColumns');

    // Save multipliers to week if it is allowed by access profile
    if (apOptions['Edit Multipliers']) {
        week.multipliers=body.multipliers;
        show.markModified('weeks');
    }

    // Save items
    let updatedList={}
    const RFSkeys=['Position Title', 'Department', 'Code', 'Rate']
    for (item of body.data) {
        if (crudUtils.isValidItem(item, RFSkeys, accessProfile)&&!crudUtils.isRestrictedItem(item, accessProfile)) {
            let pos=week.positions.positionList[item['Code']]||{}

            // Set core position values
            for (key of RFSkeys) {
                if (!crudUtils.isRestrictedColumn(key, accessProfile)) {
                    pos[key]=item[key]
                }
            }

            // Save extra column values, deferring to previous value if this column in restricted
            let previousValues=pos.extraColumnValues
            pos.extraColumnValues={}
            for (key of body.extraColumns) {
                !crudUtils.isRestrictedColumn(key, accessProfile)? pos.extraColumnValues[key]=item[key]:
                    pos.extraColumnValues[key]=previousValues[key]
            }

            // Add pos to the updated list
            updatedList[item['Code']]=pos
        }
    }

    // Add old values for restricted items to the updated List *** THIS ISN'T WORKING ***
    let positionItems=await Object.keys(week.positions.positionList)
        .map(pCode => { let p=week.positions.positionList[pCode]; p.Code=pCode; return p })
    let restrictedItems=await crudUtils.getRestrictedItems(positionItems, accessProfile, 'Code')
    for (posCode of restrictedItems) {
        updatedList[posCode]=week.positions.positionList[posCode]
    }

    show.markModified('weeks')
    week.positions.positionList=updatedList
    await show.save();

    // Create new id if new week is being created
    const newWeekId=genUniqueId()

    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, newWeekId, apName)
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks, apName)
    }

    return {};
}

// Creates grid data 
function initializeData(positions, _show, _args, _week, accessProfile) {
    let data=[];
    let posCodes=Object.keys(positions)

    for (let i=0; i<posCodes.length; i++) {
        if (!positions[posCodes[i]]) { continue }
        let item={
            id: 'id_'+i,
            'Position Title': positions[posCodes[i]]['Position Title'],
            'Code': posCodes[i],
            'Department': positions[posCodes[i]]['Department'],
            'Rate': positions[posCodes[i]]['Rate'],
        }

        // Mark deleted departments
        if (!_show.departments.includes(item['Department'])) { item['Department']+='\xa0(NOT FOUND)' }

        // Add extra columns values
        for (col of _week.positions.extraColumns) {
            item[col]=positions[posCodes[i]].extraColumnValues[col];
        }

        data.push(item);
    }

    let restrictedItems=crudUtils.getRestrictedItems(data, accessProfile, 'Code')
    data=crudUtils.filterRestrictedColumnData(data, accessProfile, 'Code')
        .filter(item => !restrictedItems.includes(item['Code']))

    return data;
}
