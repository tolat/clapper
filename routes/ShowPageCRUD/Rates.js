const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const Purchase=require('../../models/purchase')
const crudUtils=require('./utils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals, user) {
    let show=await populateShow(id);

    // Get accessProfile
    let apName=user.username
    while (apName.includes(".")) { apName=apName.replace(".", "_") }
    let accessProfile=show.accessProfiles[show.accessMap[`${apName}`]][section]

    // Generate grid data
    let week=show.weeks.find(w => w._id.toString()==show.currentWeek)
    let data=initializeData(week.positions.positionList, show, args, week)


    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show,
        section,
        args,
        sharedModals,
        pageModals,
        accessProfile,
        data,
        user
    })
}

// Update rates ******APPLY ACCESS PROFILES********
module.exports.update=async function (body, showId, user) {
    let show=await Show.findById(showId).populate('crew.crewList')
    let week=show.weeks.find(w => w._id.toString()==show.currentWeek)

    // Get access profile
    let apName=user.username
    while (apName.includes(".")) { apName=apName.replace(".", "_") }
    let accessProfile=show.accessProfiles[show.accessMap[`${apName}`]].Estimate

    // Save display settings to show
    accessProfile.displaySettings[apName][week._id.toString()]=body.displaySettings;
    show.markModified('positions.displaySettings');

    // Save extra Columns to show
    week.positions.extraColumns=body.extraColumns;
    show.markModified('positions.extraColumns');

    // Set multipliers
    week.multipliers=body.multipliers;
    show.markModified('weeks');

    // Save items
    for (item of body.data) {
        if (item&&item['Name']&&item['Code']&&item['Department']&&item['Rate']) {
            let pos=week.positions.positionList[item['Code']]||{}
            week.positions.positionList[item['Code']]=pos

            // Set core position values
            for (key of ['Name', 'Department', 'Rate', 'Code']) {
                pos[key]=item[key]
            }

            // Save extra column values
            pos.extraColumnValues={}
            for (key of body.extraColumns) {
                pos.extraColumnValues[key]=item[key]
            }
        }
    }

    // Delete positions that aren't in the grid 
    for (posCode in week.positions.positionList) {
        if (!body.data.find(item => item['Code']==posCode)) {
            delete week.positions.positionList[posCode]
        }
    }

    await show.save();

    // Create new id if new week is being created
    const newWeekId=genUniqueId()

    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, newWeekId)
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks)
    }

    await show.save();

    return {};
}

// Creates grid data 
function initializeData(positions, _show, _args, _week) {
    let data=[];
    let posCodes=Object.keys(positions)

    for (let i=0; i<posCodes.length; i++) {
        let item={
            id: 'id_'+i,
            'Name': positions[posCodes[i]]['Name'],
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

    return data;
}
