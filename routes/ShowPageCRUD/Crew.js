const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const crudUtils=require('./utils')
const numUtils=require('../../utils/numberUtils')
const oneDay=24*60*60*1000;

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals, user) {
    let show=await Show.findById(id).populate('weeks.crew.crewList')

    // Get accessProfile
    let apName=await crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile][section]

    // Generate grid data
    let week=show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)
    let data=initializeData(week.crew.crewList, show, week, accessProfile)
    let currentVersionSetCodes=await show.estimateVersions[show.accessMap[apName].estimateVersion].sets.map(s => s['Set Code'])

    args.reloadOnWeekChange=true;
    let allUsers=await User.find({});
    let dropdownNames=await allUsers.map(user => `${user['Name']} [${user['username']}]`)
    let allUsernames=await allUsers.map(user => user['username'])

    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show,
        section,
        args,
        sharedModals,
        pageModals,
        data,
        apName,
        user,
        currentVersionSetCodes,
        dropdownNames,
        allUsernames,
        accessProfile
    })
}

// Update crew
module.exports.update=async function (body, showId, user) {
    let message=["Success"]
    let show=await Show.findById(showId)
        .populate('weeks.crew.crewList')

    // Create new id if new week is being created
    const newWeekId=genUniqueId()

    // Get accessProfile
    let apName=await crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile].Crew

    // Get current Week
    let week=show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)

    // Save display settings to access profile
    accessProfile.displaySettings[apName][week._id]=body.displaySettings;
    show.markModified('accessProfiles');

    // Save extra Columns to week
    week.crew.extraColumns=body.extraColumns;
    show.markModified('positions.extraColumns');

    // Save tax Columns to week
    week.crew.taxColumns=body.taxColumns;
    show.markModified('positions.extraColumns');

    // Add/update user for each item
    let updatedList=[]
    let keepPositionMap={}
    const RFSkeys=['username', 'Position']
    for (item of body.data) {
        if (crudUtils.isValidItem(item, RFSkeys, accessProfile)&&!crudUtils.isRestrictedItem(item, accessProfile)) {
            let user=await User.findOne({ username: item['username'] })

            // Create new user if user does not exist
            if (!user) {
                user=new User();
                user.username=item['userrname']
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
            }

            // Update display keys
            let displayKeys=['Name', 'username']
            for (key of displayKeys) {
                if (!accessProfile.columnFilter.includes(key))
                    user[key]=item[key];
            }

            // Use existing show record if there is one, otherwise create a new show record
            let record=user.showrecords.find(r => r.showid==show._id.toString())
            if (!record) {
                record={
                    showid: show._id.toString(),
                    showname: show['Name'],
                    positions: [],
                    weeksWorked: {
                        [`${week.id}`]: {
                            extraColumnValues: {},
                            taxColumnValues: {},
                        }
                    }
                }
                user.showrecords.push(record)
            } else if (!record.weeksWorked[week._id]) {
                record.weeksWorked[week._id]={
                    extraColumnValues: {},
                    taxColumnValues: {},
                }
            }

            // Save extra column values, deferring to previous value if this column in restricted
            let previousValues=record.weeksWorked[week._id].extraColumnValues[item['Position']]||false
            record.weeksWorked[week._id].extraColumnValues[item['Position']]={}
            for (key of body.extraColumns) {
                if (!accessProfile.columnFilter.includes(key)) {
                    record.weeksWorked[week._id].extraColumnValues[item['Position']][key]=item[key]
                } else if (previousValues) {
                    record.weeksWorked[week._id].extraColumnValues[item['Position']][key]=previousValues[key]
                }
            }

            // Save extra column values, deferring to previous value if this column in restricted
            previousValues=record.weeksWorked[week._id].taxColumnValues[item['Position']]||false
            record.weeksWorked[week._id].taxColumnValues[item['Position']]={}
            for (key of body.taxColumns) {
                if (!accessProfile.columnFilter.includes(key)) {
                    record.weeksWorked[week._id].taxColumnValues[item['Position']][key]=item[key]
                } else if (previousValues) {
                    record.weeksWorked[week._id].taxColumnValues[item['Position']][key]=previousValues[key]
                }
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

            user.markModified('showrecords')
            user.markModified('showrecords.weeksWorked')
            await user.save()

            // Add user to updated lsit
            if (!updatedList.find(u => u._id.toString()==user._id.toString())) {
                updatedList.push(user)
            }

            // Save this item's position in keep position map so it will not be deleted later
            if (!keepPositionMap[user._id.toString()]) {
                keepPositionMap[user._id.toString()]=[item['Position']]
            } else {
                keepPositionMap[user._id.toString()].push(item['Position'])
            }

        }
    }

    // Delete days worked for user in this week for positions not saved in keep positions
    for (userid in keepPositionMap) {
        let user=await User.findById(userid)
        let record=user.showrecords.find(r => r.showid==show._id.toString())
        for (pos of record.positions) {
            if (!keepPositionMap[userid].includes(pos.code)) {
                record.positions=await deletePositionDaysInWeek(record, pos.code, week)
            }
        }
        user.markModified('showrecords')
        await user.save()
    }

    // Add old values for restricted items to the updated List. use initialize data to make items with old values for this week
    let oldShow=await Show.findById(show._id).populate('weeks.crew.crewList')
    let oldWeek=oldShow.weeks.find(w => w._id==week._id)
    let crewItems=initializeData(oldWeek.crew.crewList, oldShow, oldWeek)
    let restrictedItems=await crudUtils.getRestrictedItems(crewItems, accessProfile, 'username')
    for (item of restrictedItems) {
        updatedList.push(week.crew.crewList.find(c => c['username']==item))
    }

    week.crew.crewList=updatedList
    show.markModified('weeks')
    show.markModified('weeks.crew')
    show.markModified('weeks.crew.crewList')
    await show.save()

    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, newWeekId, apName)
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return { message: message };
}

// Creates grid data 
function initializeData(crew, _show, week, accessProfile=false) {
    let data=[];
    let count=0;

    // Load user data 
    for (let i=0; i<crew.length; i++) {
        let record=crew[i].showrecords.find(r => r.showid==_show._id.toString());
        for (pos of record.positions) {
            let currentWeekDays=getDaysOfWeek(week)
            if (daysWorkedInWeek(pos, currentWeekDays)) {
                let position=week.positions.positionList[pos.code]||pos.code=='NOT FOUND'
                let department=_show.departments.find(d => d==position['Department'])

                let item={
                    id: 'id_'+count,
                    userid: crew[i]._id,
                    'username': crew[i]['username'],
                    'Name': crew[i]['Name'],
                    'Position': pos.code,
                    'Date Joined': (new Date(record['Date Joined'])).toLocaleDateString('en-US'),
                    'Department': department,
                    editedfields: [],
                }

                // Load tax column values 
                let taxColumnValues=record.weeksWorked[week._id].taxColumnValues
                if (taxColumnValues[pos.code]) {
                    for (tax in taxColumnValues[pos.code]) {
                        item[tax]=numUtils.zeroNanToNull(taxColumnValues[pos.code][tax])
                    }
                }

                // Add extra column values
                for (col of week.crew.extraColumns) {
                    if (record.weeksWorked[week._id].extraColumnValues[pos.code]) {
                        item[col]=record.weeksWorked[week._id].extraColumnValues[pos.code][col];
                    }
                }

                // Load hours and setscodes for each day of this week ending
                item=loadUserHours(pos, item, currentWeekDays);

                // Set Rentals (payment due from rentals to this user for this week ending)
                item['Rentals']=numUtils.zeroNanToNull(calculateWeeklyRentals(item, week));

                // Calculate weekly pay total and load it
                item['Total']=numUtils.zeroNanToNull(calculateWeeklyTotal(item, week, currentWeekDays));

                data.push(item);

                count++;
            }
        }
    }

    // Apply access profile to filter data if it has been passed
    if (accessProfile) {
        // Apply access profile to data removing restricted items and values from restricted columns
        for (item of data) {
            for (column of accessProfile.columnFilter) {
                if (item[column]) {
                    item[column]=undefined
                }
            }
        }
        let restrictedItems=crudUtils.getRestrictedItems(data, accessProfile, 'id')
        data=data.filter(item => !restrictedItems.includes(item['id']))
    }

    return data;
}

// Returns true if pos has days worked in the current week
function daysWorkedInWeek(pos, _currentWeekDays) {
    for (day of _currentWeekDays) {
        let dateKey=new Date(day).toLocaleDateString('en-US');
        if (pos.daysWorked[`${dateKey}`]) {
            return true
        }
    }
    return false
}

// Returns array of dates representing the current week
function getDaysOfWeek(_week) {
    let day=new Date(_week.end);

    let days=[];
    for (let i=0; i<7; i++) {
        days.unshift(new Date(day-oneDay*i));
    }

    return days;
}

// Load user's weekly hours into item
function loadUserHours(recordPosition, item, _currentWeekDays) {
    for (day of _currentWeekDays) {
        let dayString=day.toString().slice(0, 3);
        let dayWorked=recordPosition.daysWorked[day.toLocaleDateString('en-US')];
        if (dayWorked) {
            item[dayString]=numUtils.zeroNanToNull(dayWorked.hours)
            item[`${dayString}_set`]=dayWorked.set
        }
    }

    return item;
}

// Calculates weekly rental amounts for item if item has a userid. Otherwise returns 0.
function calculateWeeklyRentals(item, _week) {
    let rentalAmount=0;
    if (item['username']&&item['Position']) {
        let rentals=_week.rentals.rentalList.filter(r => r['Supplier']&&r['Supplier']==item['username']&&r['Code']==item['Position'])
        for (rental of rentals) {
            let tax=0;
            for (t of _week.rentals.taxColumns) {
                tax+=parseFloat(rental.taxColumnValues[t])||0
            }
            rentalAmount+=parseFloat(rental['Day Rate'])*parseFloat(rental['Days Rented'])*(tax/100+1)
        }
    }
    return rentalAmount.toFixed(2);
}

// Calculate weekly total for a user
function calculateWeeklyTotal(item, _week, _currentWeekDays) {
    // Return 0 if item does not have a position
    if (!item['Position']||item['Position']=='NOT FOUND') { return 0 }

    let total=0;
    let pos=_week.positions.positionList[item['Position']]
    // Return 0 if no position found (errant position code)
    if (!pos) { return 0 }
    let rate=parseFloat(pos['Rate'])

    for (date of _currentWeekDays) {
        let day=date.toString().slice(0, 3);
        let hours=numUtils.zeroNanToNull(parseFloat(item[day]))||0
        total+=calculateDailyLaborCost(_week.multipliers, hours, rate, day);
    }

    // Add tax and rentals to make final total
    let rentals=numUtils.zeroNanToNull(parseFloat(item['Rentals']))||0
    let tax=0;
    for (t of _week.crew.taxColumns) {
        tax+=numUtils.zeroNanToNull(parseFloat(item[t]))||0
    }

    return (total*(tax/100+1)+rentals).toFixed(2);
}

// Calculates the daily labor cost given multipliers, hours, rate, and day
function calculateDailyLaborCost(multipliers, hours, rate, day) {
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

// Deletes daysworked for a position in specified week
function deletePositionDaysInWeek(record, code, week) {
    let newPositions=[]
    for (pos of record.positions) {
        if (pos.code==code) {
            for (day in pos.daysWorked) {
                if (dateIsInWeek(day, week)) {
                    pos.daysWorked[day]=undefined
                }
            }
        }
        newPositions.push(pos)
    }
    return newPositions
}

// Returns true if date is in week
function dateIsInWeek(date, week) {
    let dateMS=new Date(date).getTime()
    let weekEndMS=new Date(week.end).getTime()

    return dateMS<=weekEndMS&&dateMS>=(weekEndMS-7*oneDay)
}
