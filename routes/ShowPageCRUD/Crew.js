const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const crudUtils=require('./utils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals) {
    let show=await populateShow(id);

    args.reloadOnWeekChange=true;
    args.allUsers=await User.find({});

    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show: show,
        section: section,
        args: args,
        sharedModals: sharedModals,
        pageModals: pageModals
    })
}

// Update crew
module.exports.update=async function (body, showId) {
    let message=["Success"]
    let show=await Show.findById(showId)
        .populate('weeks.crew.crewList')
        .populate('positions.positionList')

    // Create new id if new week is being created
    const newWeekId=genUniqueId()

    // Update this week's settings and crew list if not deleting this week
    if (body.deletedWeek!=show.currentWeek) {
        // Get current week id (_cw) and index (_wk)
        let _wk=show.weeks.indexOf(show.weeks.find(w => w._id==show.currentWeek))
        let _cw=show.currentWeek

        // Set week tax columns for crew
        show.weeks[_wk].crew.taxColumns=body.taxColumns

        // Save display settings 
        show.weeks[_wk].crew.displaySettings=body.displaySettings;

        // Save extra Columns 
        show.weeks[_wk].crew.extraColumns=body.extraColumns;

        show.markModified('weeks')
        await show.save()

        // Map to keep track of which duplicate-sensitive values that are cleared on 
        // each save and re-defined using grid data have been cleared on this save
        let clearedWeeklyValuesMap={}

        // Add/update user for each item
        for (item of body.data) {
            if (item&&item['username']&&item['Position']) {
                let user=await User.findOne({ username: item['username'] })
                // Load user and save to week's crew list or creat new one
                if (user) {
                    if (!show.weeks[_wk].crew.crewList.find(u => u['username']==item['username'])) {
                        show.weeks[_wk].crew.crewList.push(user);
                        show.markModified('weeks');
                        await show.save();
                    }
                } else {
                    user=new User();
                    user.showrecords=[{
                        positions: [],
                        weeksWorked: {},
                        showid: show._id.toString(),
                        showname: show['Name']
                    }]
                    user.showrecords[0].weeksWorked[_cw]={
                        extraColumnValues: {},
                        taxColumnValues: {}
                    }

                    user.markModified('showrecords');
                    await user.save();
                    await show.weeks[_wk].crew.crewList.push(user);
                    show.markModified('weeks')
                    await show.save();
                }

                // Update basic User properties
                user['Name']=item['Name'];
                user['Phone']=item['Phone'];
                user['Email']=item['Email'];
                user['username']=item['username']

                // Use existing record if there is one, otherwise create a new record
                let record=user.showrecords.find(r => r.showid==show._id.toString())
                if (!record) {
                    record={
                        showid: show._id.toString(),
                        showname: show['Name'],
                        positions: [],
                        weeksWorked: {
                        }
                    }
                    record.weeksWorked[_cw]={
                        extraColumnValues: {},
                        taxColumnValues: {},
                        '#': null
                    }
                    user.showrecords.push(record)
                } else if (!record.weeksWorked[_cw]) {
                    record.weeksWorked[_cw]={
                        extraColumnValues: {},
                        taxColumnValues: {},
                        '#': null
                    }
                }

                // Update user #
                record.weeksWorked[_cw]['#']=item['#'];

                // Update tax
                if (!clearedWeeklyValuesMap[user.username]) {
                    clearedWeeklyValuesMap[user.username]={}
                }
                if (!clearedWeeklyValuesMap[user.username].taxColumnValues) {
                    record.weeksWorked[_cw].taxColumnValues={}
                    clearedWeeklyValuesMap[user.username].taxColumnValues=true
                }
                for (tax of show.weeks[_wk].crew.taxColumns) {
                    if (!record.weeksWorked[_cw].taxColumnValues[item['Position']]) {
                        record.weeksWorked[_cw].taxColumnValues[item['Position']]={}
                    }
                    record.weeksWorked[_cw].taxColumnValues[item['Position']][tax]=item[tax]
                }

                // Update date joined
                let date=new Date(item['Date Joined']);
                if (date!='Invalid Date') { record['Date Joined']=date }
                else { record['Date Joined']=new Date(Date.now()) }

                // Update position
                let recordPosition=record.positions.find(p => p.code==item['Position'])
                if (!recordPosition) {
                    recordPosition={
                        code: item['Position'],
                        daysWorked: {}
                    }
                    record.positions.push(recordPosition)
                }

                // Update the hours and set for each day worked
                for (day of body.currentWeekDays) {
                    let dayString=new Date(day).toString().slice(0, 3);
                    let dateKey=day

                    // If no day exists in the daysWorked record, create one
                    if (!recordPosition.daysWorked[`${dateKey}`]) {
                        recordPosition.daysWorked[`${dateKey}`]={}
                    }
                    recordPosition.daysWorked[`${dateKey}`]={
                        hours: parseFloat(item[`${dayString}`]),
                        set: item[`${dayString}_set`]
                    }
                }

                // Save extra column values
                if (!clearedWeeklyValuesMap[user.username]) {
                    clearedWeeklyValuesMap[user.username]={}
                }
                if (!clearedWeeklyValuesMap[user.username].extraColumnValues) {
                    record.weeksWorked[_cw].extraColumnValues={}
                    clearedWeeklyValuesMap[user.username].extraColumnValues=true
                }
                for (key of body.extraColumns) {
                    record.weeksWorked[_cw].extraColumnValues[item['Position']]={}
                    record.weeksWorked[_cw].extraColumnValues[item['Position']][key]=item[key];
                }

                // If creating new week, copy week worked from appropriate week 
                if (body.newWeek&&body.newWeek.isNewWeek) {
                    crudUtils.copyWeekFromRecord(body, show, record, newWeekId, user)
                }

                user.markModified('showrecords')
                user.markModified('showrecords.weeksWorked')
                await user.save()
            }
        }

        // Remove crew members not shown from week, or delete days worked records from crewmembers if they have been delete in the grid
        for (crew of show.weeks[_wk].crew.crewList) {
            crew=await User.findById(crew._id.toString())

            // Remove crew member from crew week's crew list if they aren't in the grid
            if (!body.data.find(item => item['username']==crew['username'])) {
                show.weeks[_wk].crew.crewList=show.weeks[_wk].crew.crewList.filter(item => item['username']!=crew['username'])
                for (rental of show.weeks[_wk].rentals.rentalList) {
                    if (rental.Supplier==crew.username) {
                        show.weeks[_wk].rentals.rentalList=show.weeks[_wk].rentals.rentalList.filter(r => r!=rental)
                    }
                }
                show.markModified('weeks.rentals')
            }

            // Delete days worked for this week for any positions for this user that aren't active in the current week
            let record=crew.showrecords.find(r => r.showid==show._id.toString())
            for (pos of record.positions) {
                if (!body.data.find(item => item['username']==crew['username']&&item['Position']==pos.code)) {
                    // Delete days worked in this week for this position
                    for (day of body.currentWeekDays) {
                        delete pos.daysWorked[day]
                    }

                    // Delete this week's rentals for this position
                    for (rental of show.weeks[_wk].rentals.rentalList) {
                        if (rental.Supplier==crew.username&&rental.Code==pos.code) {
                            show.weeks[_wk].rentals.rentalList=show.weeks[_wk].rentals.rentalList.filter(r => r!=rental)
                        }
                    }
                    show.markModified('weeks.rentals')
                }
            }

            crew.markModified('showrecords')
            await crew.save()
        }

        show.markModified('weeks')
        await show.save()
    }

    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, newWeekId)
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return { message: message };
}