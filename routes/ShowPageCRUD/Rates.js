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

// Update rates
module.exports.update=async function (body, showId) {
    let show=await Show.findById(showId)
        .populate('crew.crewList')
        .populate('positions.positionList')

    // Save display settings to show
    show.positions.displaySettings=body.displaySettings;
    show.markModified('positions.displaySettings');

    // Save extra Columns to show
    show.positions.extraColumns=body.extraColumns;
    show.markModified('positions.extraColumns');

    // Set multipliers
    show.weeks.find(w => w._id.toString()==show.currentWeek).multipliers=body.multipliers;
    show.markModified('weeks');

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

    // Save items
    for (item of body.data) {
        if (item&&item['Name']&&item['Code']&&item['Department']&&item['Rate']) {
            let pos=await Position.findOne({ 'Code': item['Code'], showId: show._id.toString() })

            // New position if pos not found
            if (!pos) {
                pos=new Position();
                pos.extraColumnValues={};
                pos.show=show;
                pos.showId=show._id.toString()
                await pos.save();
                await show.positions.positionList.push(pos);
                show.markModified('positions.positionList');
                await show.save();
            }

            // Save position #
            pos['#']=item['#']

            // Set core position values
            for (key of pos.displayKeys) {
                pos[key]=item[key]
            }

            // Save extra column values
            pos.extraColumnValues={}
            for (key of body.extraColumns) {
                pos.extraColumnValues[key]=item[key]
            }

            pos.markModified(`extraColumnValues`)

            await pos.save();
        }
    }

    show=await Show.findById(show._id).populate('positions.positionList')

    // Delete positions that aren't in the grid
    for (pos of show.positions.positionList) {
        if (!body.data.find(item => item['Code']==pos['Code'])) {
            await Position.findByIdAndDelete(pos._id)
        }
    }

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
