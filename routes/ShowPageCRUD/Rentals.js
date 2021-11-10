const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const Purchase=require('../../models/purchase')
const crudUtils=require('./utils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals) {
    let show=await populateShow(id);

    args.reloadOnWeekChange=true
    args.allUsers=await User.find({})
    args.allShowCrew=await crudUtils.getAllCrewIDs(show._id)

    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show: show,
        section: section,
        args: args,
        sharedModals: sharedModals,
        pageModals: pageModals
    })
}

// Update rentals
module.exports.update=async function (body, showId) {
    let show=await Show.findById(showId)
        .populate('weeks.crew.crewList')
        .populate('positions.positionList')

    if (body.deletedWeek!=show.currentWeek) {
        // Get current week id (_cw) and index (_wk)
        let _wk=show.weeks.indexOf(show.weeks.find(w => w._id==show.currentWeek))

        // Set week tax columns for crew
        show.weeks[_wk].rentals.taxColumns=body.taxColumns

        // Save display settings 
        show.weeks[_wk].rentals.displaySettings=body.displaySettings;

        // Save extra Columns 
        show.weeks[_wk].rentals.extraColumns=body.extraColumns;

        show.markModified('weeks');
        await show.save();

        let rentals=[]
        for (item of body.data) {
            if (item['Day Rate']&&item['Set Code']&&item['Department']) {
                let rental={
                    'Description': item['Description'],
                    'Day Rate': item['Day Rate'],
                    'Set Code': item['Set Code'],
                    'Department': item['Department'],
                    'Days Rented': item['Days Rented'],
                    'Supplier': item['Supplier'],
                    'Code': item['Code'],
                    taxColumnValues: {},
                    extraColumnValues: {}
                }

                for (extraCol of show.weeks[_wk].rentals.extraColumns) {
                    rental.extraColumnValues[extraCol]=item[extraCol]
                }

                rentals.taxColumnValues={}
                for (taxCol of show.weeks[_wk].rentals.taxColumns) {
                    rental.taxColumnValues[taxCol]=item[taxCol]
                }

                rentals.push(rental)
            }
        }

        show.weeks[_wk].rentals.rentalList=rentals

        show.markModified('weeks')
        await show.save()
    }

    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, genUniqueId())
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return {}
}


