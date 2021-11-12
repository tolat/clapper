const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const crudUtils=require('./utils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals) {
    let show=await populateShow(id);

    args.reloadOnWeekChange=true;
    args.showCrew=await crudUtils.getAllCrewUsers(await crudUtils.getAllCrewIDs(show._id.toString()))

    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show: show,
        section: section,
        args: args,
        sharedModals: sharedModals,
        pageModals: pageModals
    })
}

// Update Cost Report
module.exports.update=async function (body, showId) {
    let show=await Show.findById(showId).populate('sets');

    // Save display settings to show
    show.costReport.displaySettings=body.displaySettings;
    show.markModified('costReport.displaySettings');

    // Save extra Columns to show
    show.costReport.extraColumns=body.extraColumns;
    show.markModified('costReport.extraColumns');

    // Set weekending using the week ending before the change (this will be the original week ending of the page)
    let weekEnding=show.getCurrentWeekEnding.toLocaleDateString('en-US');
    if (show.currentweekending) { weekEnding=(new Date(show.currentweekending)).toLocaleDateString('en-US') }

    // Update show's current week ending if there is an update
    show.currentweekending=body.weekEnding;

    // Update estimate version for cost report
    show.costReport.estimateVersion=body.estimateVersion;
    show.markModified('costReport.estimateVersion');

    // Save total and budget to show
    show.costReport.toDate=body.totals['To Date'];
    show.costReport.budget=body.totals['Budget'];
    show.costReport.remaining=body.totals['Remaining'];


    for (item of body.data) {
        show.costReport.setNumberMap[item['Set Code']]=item['#'];

        for (col of body.extraColumns) {
            if (!show.costReport.setExtraColumnMap[item['Set Code']]) {
                show.costReport.setExtraColumnMap[item['Set Code']]={}
            }
            show.costReport.setExtraColumnMap[item['Set Code']][col]=item[col];
        }
    }
    show.markModified('costReport.setExtraColumnMap');
    show.markModified('costReport.setNumberMap');

    await show.save();

    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, genUniqueId())
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return { message: 'Success' }
}


