const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const Purchase=require('../../models/purchase')

// Returns array of dates representing the current week
module.exports.getDaysOfWeekEnding=(date) => {
    const oneDay=24*60*60*1000;
    let day=new Date(date);
    let days=[];
    for (let i=0; i<7; i++) {
        days.unshift(new Date(day-oneDay*i));
    }
    return days;
}

// Deletes all records of a week in all show's User showrecords
module.exports.deleteWeek=async function (weekId, show, newWeeks) {
    // Update show weeks 
    show.weeks=JSON.parse(JSON.stringify(newWeeks))
    await show.save()

    // Remove week from crew weeksWorked records
    let affectedCrew=await this.getAllCrewIDs(show._id)
    for (id of affectedCrew) {
        let user=await User.findById(id)
        delete user.showrecords.find(r => r.showid==show._id.toString()).weeksWorked[weekId]
        user.markModified('showrecords')
        await user.save()
    }
}

// Creates a new week for the show
module.exports.createWeek=async function (body, show, newWeekId) {
    // Just update show's current week if not creating a new week
    if (!body.newWeek.isNewWeek) {
        show.currentWeek=show.weeks.find(w => w.number==body.newWeek.number)._id
    } else {
        // Shift other weeks up if new week is inserted before end of weeks
        if (show.weeks.find(w => w.number==body.newWeek.number)) {
            for (wk of show.weeks.filter(w => w.number>=body.newWeek.number)) {
                wk.number++
            }
        }

        // Create a new week for the show
        let newWeek={
            crew: {
                displaySettings: {},
                extraColumns: [],
                taxColumns: [],
                crewList: []
            },
            rentals: {
                displaySettings: {},
                extraColumns: [],
                taxColumns: [],
                rentalList: []
            }
        }

        // Copy week data from old week as specified
        if (body.newWeek.copyCrewFrom!='blank') {
            let oldWeek;
            // Copy week data over from preceding week
            if (body.newWeek.copyCrewFrom=='preceding') {
                let precedingWeekNum=body.newWeek.number-1
                if (precedingWeekNum<1) { precedingWeekNum=1 }
                oldWeek=await show.weeks.find(w => w.number==precedingWeekNum)
            }
            // Else copy week data over from current week
            else { oldWeek=await show.weeks.find(w => w._id==show.currentWeek) }

            newWeek=await JSON.parse(JSON.stringify(oldWeek))
        }

        // Set rentals for new week to 0
        for (rental of newWeek.rentals.rentalList) {
            rental['Days Rented']=0
        }

        // Add new week to each crew member's show record
        for (crew of newWeek.crew.crewList) {
            // copy user week data from specified other week record, or blank
            let user;
            if (!crew['username']) {
                user=await User.findById(crew.toString())
            } else {
                user=await User.findOne({ username: crew['username'] })
            }

            let record=user.showrecords.find(r => r.showid==show._id.toString())
            let activeInNewWeek=await this.copyWeekFromRecord(body, show, record, newWeekId, user)

            // Add days worked for new week to each position of the record
            for (pos of record.positions) {
                if (activeInNewWeek.includes(pos)) {
                    for (day of this.getDaysOfWeekEnding(body.newWeek.end)) {
                        let dateKey=new Date(day).toLocaleDateString('en-US')
                        if (!pos.daysWorked[dateKey]) {
                            pos.daysWorked[dateKey]={ hours: null, set: null }
                        }
                    }
                }
            }

            user.markModified('showrecords')
            await user.save()
        }

        newWeek._id=newWeekId
        newWeek.number=body.newWeek.number
        newWeek.end=body.newWeek.end
        newWeek.multipliers={
            0: {
                Mon: 1,
                Tue: 1,
                Wed: 1,
                Thu: 1,
                Fri: 1,
                Sat: 1,
                Sun: 1
            }
        }

        show.currentWeek=newWeekId
        await show.weeks.push(newWeek)
        await show.weeks.sort((a, b) => new Date(a.end).getTime()<new Date(b.end).getTime()? 1:-1)
        show.markModified('weeks')
    }
    await show.save()
}

module.exports.copyWeekFromRecord=async function (body, show, record, newWeekId, user) {
    let activeInNewWeek=[]
    let newWeekRecord={
        extraColumnValues: {},
        taxColumnValues: {}
    }
    // Copy crew week worked over from preceding week
    if (body.newWeek.copyCrewFrom=='preceding') {
        let precedingWeekNum=body.newWeek.number-1
        if (precedingWeekNum<1) { precedingWeekNum=1 }
        let precedingWeekId=await show.weeks.find(w => w.number==precedingWeekNum)._id
        if (record.weeksWorked[precedingWeekId]) {
            newWeekRecord=record.weeksWorked[precedingWeekId]
        }

        for (day of this.getDaysOfWeekEnding(show.weeks.find(w => w.number==precedingWeekNum).end)) {
            let dateKey=new Date(day).toLocaleDateString('en-US')
            for (pos of record.positions) {
                if (pos.daysWorked[dateKey]&&!activeInNewWeek.includes(pos)) {
                    activeInNewWeek.push(pos)
                }
            }
        }
    }
    // Else copy crew week worked over from current week
    else if (body.newWeek.copyCrewFrom=='current') {
        newWeekRecord=record.weeksWorked[show.currentWeek]

        for (day of this.getDaysOfWeekEnding(show.weeks.find(w => w._id.toString()==show.currentWeek).end)) {
            let dateKey=new Date(day).toLocaleDateString('en-US')
            for (pos of record.positions) {
                if (pos.daysWorked[dateKey]&&!activeInNewWeek.includes(pos)) {
                    activeInNewWeek.push(pos)
                }
            }
        }
    }

    // Save to record
    record.weeksWorked[newWeekId]=await JSON.parse(JSON.stringify(newWeekRecord))

    return activeInNewWeek
}

module.exports.getAllCrewIDs=async function (showid) {
    let tempShow=await Show.findById(showid);
    let allCrewMembers=[]

    for (week of tempShow.weeks) {
        for (c of week.crew.crewList) {
            let id
            c._id? id=c._id.toString():id=c.toString()
            !allCrewMembers.includes(id)? allCrewMembers.push(id):null
        }
    }

    return allCrewMembers
}

module.exports.getAllCrewUsers=async function (IDlist) {
    let userList=[]
    for (id of IDlist) {
        let user=await User.findById(id);
        userList.push(user)
    }

    return userList
}

module.exports.getRestrictedItems=function (data, accessProfile, itemIdentifier) {
    let restrictedItems=[]
    for (item of data) {
        for (column in accessProfile.dataFilter) {
            if (item[column]==accessProfile.dataFilter[column]) {
                restrictedItems.push(item[`${itemIdentifier}`])
            }
        }
    }
    return restrictedItems
}

