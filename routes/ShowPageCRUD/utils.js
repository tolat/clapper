const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const oneDay=24*60*60*1000;

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
    show.weeks.splice(show.weeks.indexOf(show.weeks.find(w => w._id==weekId)), 1)
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
module.exports.createWeek=async function (body, show, newWeekId, apName) {
    show=await Show.findById(show._id)
    let currentWeekId=show.accessMap[apName].currentWeek
    // Just update show's current week if not creating a new week
    if (!body.newWeek.isNewWeek) {
        show.accessMap[apName].currentWeek=body.newWeek.weekId
    } else {
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
            },
            positions: {
                extracolumns: [],
                positionList: {}
            },
            multipliers: {
                0: {
                    Fri: 1,
                    Mon: 1,
                    Sat: 1,
                    Sun: 1,
                    Thu: 1,
                    Tue: 1,
                    Wed: 1
                }
            }
        }

        // Copy week data from old week as specified
        if (body.newWeek.copyCrewFrom!='blank') {
            let oldWeek;
            // Copy week data over from preceding week
            if (body.newWeek.copyCrewFrom=='preceding') {
                oldWeek=await show.weeks.find(w => w._id==findPrecedingWeek(body.newWeek.weekEnd, show.weeks))
            }
            // Else copy week data over from current week
            else {
                oldWeek=await show.weeks.find(w => w._id==currentWeekId)
            }

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
            !crew['username']? user=await User.findById(crew.toString()):
                user=await User.findOne({ username: crew['username'] })

            let record=user.showrecords.find(r => r.showid==show._id.toString())
            let activeInNewWeek=await this.copyWeekFromRecord(body, show, record, newWeekId, user, currentWeekId)

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

        show.accessMap[apName].currentWeek=newWeekId
        await show.weeks.push(newWeek)
        await show.weeks.sort((a, b) => new Date(a.end).getTime()<new Date(b.end).getTime()? -1:1)
        await show.markModified('weeks')
    }
    show.markModified('accessMap')
    await show.save()
}

// Find first week in weeks that precedes weekEnd
function findPrecedingWeek(weekEnd, weeks) {
    let endTime=(new Date(weekEnd)).getTime()
    for (week of weeks) {
        let time=(new Date(week.end)).getTime()
        if (time<endTime) {
            return week._id
        }
    }
}

module.exports.copyWeekFromRecord=async function (body, show, record, newWeekId, user, currentWeekId) {
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
        newWeekRecord=record.weeksWorked[currentWeekId]

        for (day of this.getDaysOfWeekEnding(show.weeks.find(w => w._id.toString()==currentWeekId).end)) {
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

// Returns an array of identifiers corresponding to items that are restricted by accessProfile (itemIdentifier key is user defined as )
module.exports.getRestrictedItems=function (data, accessProfile, itemIdentifier) {
    let restrictedItems=[]
    for (item of data) {
        for (column in accessProfile.dataFilter) {
            if (accessProfile.dataFilter[column].includes(item[column])) {
                restrictedItems.push(item[`${itemIdentifier}`])
            }
        }
    }
    return restrictedItems
}

// Returns true if item has values restricted by the accessProfile
module.exports.isRestrictedItem=function (item, accessProfile) {
    for (column in accessProfile.dataFilter) {
        if (accessProfile.dataFilter[column].includes(item[column])) {
            return true
        }
    }
    return false
}

// Checks if item has valid required-for-save fields filled
module.exports.isValidItem=function (item, RFSkeys, _accessProfile) {
    if (!item) { return false }
    for (key of RFSkeys) {
        if (!item[key]) {
            if (_accessProfile.columnFilter.includes(key)) {
                return true
            }
            return false
        }
    }
    return true
}

// Get key for accessProfiles and accessMap for agiven user or username
module.exports.getAccessProfileName=function (user=false, username=false) {
    if (user) {
        let uName=user.username
        while (uName.includes(".")) {
            uName=uName.replace(".", "-")
        }
        return uName
    } else {
        while (username.includes(".")) {
            username=username.replace(".", "-")
        }
        return username
    }
}

// Get the week from the show given a date
module.exports.findFirstContainingWeek=function (day, weeks) {
    const oneDay=24*60*60*1000;
    let dateMS=new Date(day).getTime()
    for (week of weeks) {
        let weekEndMS=new Date(week.end).getTime()
        if (dateMS<=weekEndMS&&dateMS>=(weekEndMS-7*oneDay)) {
            return week
        }
    }
    return false
}

module.exports.calculateDailyLaborCost=function (multipliers, hours, rate, day) {
    let total=0;

    // Sort multipliers
    let multiplierKeys=Object.keys(multipliers).sort((a, b) => { return a-b });

    // Calculate the multiplied hours and total payout in each multiplier interval
    let totalNonUnitHours=0;
    for (let i=0; i<multiplierKeys.length; i++) {
        let multipliedHours=0;

        if (multiplierKeys[i+1]&&hours>multiplierKeys[i+1]) {
            multipliedHours=multiplierKeys[i+1]-multiplierKeys[i];
        } else if (hours>multiplierKeys[i]) {
            multipliedHours=hours-multiplierKeys[i]
        }

        total+=multipliedHours*multipliers[multiplierKeys[i]][day]*rate;
        totalNonUnitHours+=multipliedHours;
    }
    total+=(hours-totalNonUnitHours)*rate;

    return total;
}

module.exports.isInCurrentWeek=function (day, user, _week) {
    let dateMS=new Date(day).getTime()
    let weekEndMS=new Date(_week.end).getTime()
    if (dateMS<=weekEndMS&&dateMS>=(weekEndMS-7*oneDay)) {
        if (_week.crew.crewList.find(c => c.username==user.username)) {
            return true
        }
    }
}

