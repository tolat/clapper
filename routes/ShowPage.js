const express=require('express')
const path=require('path')
const tryCatch=require('../utils/tryCatch')
const ExpressError=require('../utils/ExpressError')
const { isLoggedIn, isShowOwner }=require('../utils/customMiddleware')
const sanitizeHtml=require('sanitize-html')

const router=express.Router({ mergeParams: true })

const { populateShow }=require('../utils/schemaUtils')
const { genUniqueId }=require('../utils/numberUtils')
const fs=require('fs')

const Show=require('../models/show')
const User=require('../models/user')
const Set=require('../models/set')
const Purchase=require('../models/purchase')
const Position=require('../models/position')

// Load a Show Page section
router.get('/', isLoggedIn, isShowOwner, tryCatch(async (req, res, next) => {
    const { id, section }=req.params;
    const q=req.query;
    let show=await populateShow(id);
    let args={ section: section, server: req.app.get('server') };

    // Set appropriate data for the requested section
    switch (section) {
        case 'Estimate':
            show=await Show.findById(id).populate('sets');
            // Case: first estimate version
            if (!Object.keys(show.estimateVersions).length) { args.isFirstEstimate=true }
            // Case: requesting specific estimate version
            else if (q.version) {
                args.version=q.version;
                args.latestVersion=getLatestEstimateVersion(show);
                args.weekEnding=show.estimateVersions[q.version].weekEnding;
            }
            //Case: no specified version, default to the cost report's version
            else {
                let version=show.costReport.estimateVersion
                args.latestVersion=getLatestEstimateVersion(show)
                version? args.version=version:args.version=args.latestVersion
                args.weekEnding=show.estimateVersions[args.version].weekEnding;
            }
            break;
        case 'Purchases':
            show=await Show.findById(id)
                .populate('sets')
                .populate('purchases')
                .populate({
                    path: 'purchases.purchaseList',
                    populate: { path: 'set' }
                });
            break;
        case 'Crew':
            args.reloadOnWeekChange=true;
            args.allUsers=await User.find({});
            break;
        case 'Rentals':
            args.reloadOnWeekChange=true
            args.allUsers=await User.find({})
            args.allShowCrew=await getAllCrewIDs(show._id)
            break;
        case 'CostReport':
            args.reloadOnWeekChange=true;
            args.showCrew=await getAllCrewUsers(await getAllCrewIDs(show._id.toString()))
            break;
    }

    throw new ExpressError(
        `__dirname: ${__dirname}\n
        Path: ${path.join(__dirname, `../views/ShowPage/sharedModals`)}\n  
        `, 999)


    // Get shared and page-specific modals to include in rendered template
    let sharedModals=await fs.readdirSync(path.join(__dirname, `../views/ShowPage/sharedModals`));
    let pageModals=await fs.readdirSync(path.join(__dirname, `../views/ShowPage/${section}/Modals`));



    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show: show,
        section: section,
        args: args,
        sharedModals: sharedModals,
        pageModals: pageModals
    })
}))

// Delete route for ShowPage sections
router.delete('/', isLoggedIn, isShowOwner, tryCatch(async (req, res, next) => {
    let responseData=await global[`delete${req.params.section}`](req.body, req.params.id);
    res.send(responseData);
}))

// Post (update) route for ShowPage sections
router.post('/', isLoggedIn, isShowOwner, tryCatch(async (req, res, next) => {
    // Sanitize incoming data
    req.body=JSON.parse(sanitizeHtml(JSON.stringify(req.body)))
    let responseData=await global[`update${req.params.section}`](req.body, req.params.id);
    res.send(responseData);
}))

module.exports=router;



/* SHARED FUNCTIONS */

// Returns array of dates representing the current week
getDaysOfWeekEnding=(date) => {
    const oneDay=24*60*60*1000;
    let day=new Date(date);
    let days=[];
    for (let i=0; i<7; i++) {
        days.unshift(new Date(day-oneDay*i));
    }
    return days;
}

// Deletes all records of a week in all show's User showrecords
async function deleteWeek(weekId, show, newWeeks) {
    // Update show weeks 
    show.weeks=JSON.parse(JSON.stringify(newWeeks))
    await show.save()

    // Remove week from crew weeksWorked records
    let affectedCrew=await getAllCrewIDs(show._id)
    for (id of affectedCrew) {
        let user=await User.findById(id)
        delete user.showrecords.find(r => r.showid==show._id.toString()).weeksWorked[weekId]
        user.markModified('showrecords')
        await user.save()
    }


}

// Creates a new week for the show
async function createWeek(body, show, newWeekId) {
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
            let activeInNewWeek=await copyWeekFromRecord(body, show, record, newWeekId, user)

            // Add days worked for new week to each position of the record
            for (pos of record.positions) {
                if (activeInNewWeek.includes(pos)) {
                    for (day of getDaysOfWeekEnding(body.newWeek.end)) {
                        let dateKey=new Date(day).toLocaleDateString('en-US')
                        pos.daysWorked[dateKey]={ hours: null, set: null }
                    }
                }
            }

            user.markModified('showrecords')
            await user.save()
        }

        newWeek._id=newWeekId
        newWeek.number=body.newWeek.number
        newWeek.end=body.newWeek.end

        show.currentWeek=newWeekId
        await show.weeks.push(newWeek)
        await show.weeks.sort((a, b) => new Date(a.end).getTime()<new Date(b.end).getTime()? 1:-1)
        show.markModified('weeks')
    }
    await show.save()
}

async function copyWeekFromRecord(body, show, record, newWeekId, user) {
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

        for (day of getDaysOfWeekEnding(show.weeks.find(w => w.number==precedingWeekNum).end)) {
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

        for (day of getDaysOfWeekEnding(show.weeks.find(w => w._id.toString()==show.currentWeek).end)) {
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

async function getAllCrewIDs(showid) {
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

async function getAllCrewUsers(IDlist) {
    let userList=[]
    for (id of IDlist) {
        let user=await User.findById(id);
        userList.push(user)
    }

    return userList
}



/* ESTIMATE FUNCTIONS */

// Delete Estimate Version
deleteEstimate=async function (body, showId) {
    let v=body.version;
    let show=await Show.findById(showId).populate('sets');

    delete show.estimateVersions[v];
    show.markModified(`estimateVersions`);
    await show.save();

    for (set of show.sets) {
        let s=await Set.findById(set._id);
        delete s.estimates[v];
        delete s.estimateTotals[v];
        s.markModified(`estimates`);
        s.markModified(`estimateTotals`);
        await s.save();
    }

    return { latestVersion: getLatestEstimateVersion(show) }
}

// Save Estimate Version
updateEstimate=async function (body, showId) {
    let items=body.data;
    let ov=body.originalVersion;
    let v=body.version;
    let isNewVersion=body.isNewVersion;
    let isBlankVersion=body.isBlankVersion;
    let show=await Show.findById(showId).populate('sets');

    // First blank estimate case *** INITIALIZE REST OF SHOW OBJECTS ***
    if (!ov) {
        show.estimateVersions[v]={
            extraColumns: [],
            displaySettings: {},
            mandayRates: {},
            fringes: {},
            dateCreated: new Date(Date.now())
        }
        show.costReport={
            displaySettings: {},
            extraColumns: [],
            estimateVersion: v,
            setNumberMap: {},
            setExtraColumnMap: {},
        }
        show.markModified('costReport.estimateVersion');
        show.markModified(`estimateVersions`);
        await show.save();

        // Initialize first estimate for each set if ther are already sets (delete only estimate case)
        for (set of show.sets) {
            set.estimates={};
            set.estimates[v]={
                departmentValues: {},
                extraColumnValues: {}
            };
            set.estimateTotals={}
            set.estimateTotals[v]=0;
            set.markModified('estimates');
            set.markModified('estimateTotals');
            await set.save();
        }
        return { latestVersion: getLatestEstimateVersion(show) };
    }

    // Set the week ending for this estimate and save show
    show.estimateVersions[ov].weekEnding=body.weekEnding;
    show.markModified(`estimateVersions.${ov}.weekEnding`);

    // Update estimate version display settings (column order, grouping, collapsed groups, etc)
    show.estimateVersions[ov].displaySettings=body.displaySettings
    show.markModified(`estimateVersions.${ov}.displaySettings`);

    // Update Extra columns
    show.estimateVersions[ov].extraColumns=body.extraColumns;
    show.markModified(`estimateVersions.${ov}.extraColumns`);

    // Update Manday rates
    show.estimateVersions[ov].mandayRates=body.mandayRates;
    show.markModified(`estimateVersions.${ov}.mandayRates`);

    // Update fringes
    show.estimateVersions[ov].fringes=body.fringes;
    show.markModified(`estimateVersions.${ov}.fringes`);

    // Update departments
    show.departments=body.departments;

    // Update department colors
    show.departmentColorMap=body.departmentColorMap;

    // Update the show's estimate version record
    if (v!=ov) {
        show=await Show.findById(showId).populate('sets');
        show.estimateVersions[v]=show.estimateVersions[ov];
        if (isBlankVersion) { show.estimateVersions[ov].displaySettings={} }
        if (!isNewVersion) { delete show.estimateVersions[ov] }
        else { show.estimateVersions[v].dateCreated=new Date(Date.now()) }
        show.markModified(`estimateVersions`);
    }

    // Set new cost report version based on estimate page version
    show.costReport.estimateVersion=v

    // Save show
    await show.save();

    // Save Set Data
    for (item of items) {
        if (item&&item['Set Code']) {
            let set=show.sets.find(s => s['Set Code']==item['Set Code'])

            // Create new set if item doesn't correspond to an existing set
            if (!set) {
                set=await new Set();
                set.show=show;
                set.estimates={};
                set.estimateTotals={};
                for (ver of Object.keys(show.estimateVersions)) {
                    set.estimates[ver]={
                        departmentValues: {},
                        extraColumnValues: {}
                    }
                    set.estimateTotals[ver]={ total: 0, departmentTotals: {} }
                    for (d of show.departments) { set.estimateTotals[ver].departmentTotals[d]=0 }
                }
                set.markModified('estimates');
                set.markModified('estimateTotals');
                await set.save();
                await show.sets.push(set);
                await show.save();
            }

            // Update core display keys
            for (key of set.displayKeys) {
                set[key]=item[key];
            }

            // Update Estimate specific keys
            for (key of getDepartmentKeys(show)) {
                let value=item[key];
                if (isNaN(value)||value==0) { value=0 }
                set.estimates[ov].departmentValues[key]=value;
            }

            // Update extra column keys, deleting values for columns that don't exist anymore
            set.estimates[ov].extraColumnValues={}
            for (key of body.extraColumns) {
                set.estimates[ov].extraColumnValues[key]=item[key];
            }

            // Update estimate totals
            set.estimateTotals[ov]={
                total: item['Current']||0,
                departmentTotals: item.departmentTotals||{}
            }

            // Set all undefined department totals to 0
            for (dep of show.departments) {
                if (!set.estimateTotals[ov].departmentTotals[dep]) {
                    set.estimateTotals[ov].departmentTotals[dep]=0
                }
            }

            // Update estimate version and totals if this is a new version or a rename
            if (ov!=v) {
                set.estimates[v]=set.estimates[ov];
                set.estimateTotals[v]=set.estimateTotals[ov];
                // Set totals to 0 and estimate to blank if creating a blank version
                if (isBlankVersion) {
                    set.estimateTotals[v]={ total: 0, departmentTotals: {} }
                    for (d of show.departments) { set.estimateTotals[v].departmentTotals[d]=0 }
                    set.estimates[v]={
                        departmentValues: {},
                        extraColumnValues: {}
                    }
                    // Update Estimate specific keys
                    for (key of getDepartmentKeys(show)) {
                        set.estimates[v].departmentValues[key]=0;
                    }
                }
                // Delete old version and totals if this is a rename
                if (!isNewVersion) {
                    delete set.estimates[ov];
                    delete set.estimateTotals[ov];
                }
            }

            set.markModified(`estimates.${v}`);
            set.markModified(`estimates.${v}.extraColumnValues`);
            set.markModified(`estimateTotals.${v}`);
            set.markModified(`estimates.${ov}`);
            set.markModified(`estimates.${ov}.extraColumnValues`);
            set.markModified(`estimateTotals.${ov}`);
            await set.save();
        }
    }

    show=await Show.findById(show._id).populate('sets')

    // Delete sets that are no longer present in grid
    for (set of show.sets) {
        if (!items.find(item => item['Set Code']==set['Set Code'])) {
            await Set.findByIdAndDelete(set._id)
        }
    }

    // Get the most recent version (largest numbered version) and return it
    return { latestVersion: getLatestEstimateVersion(show) };
}

// Return the latest estimate verison
function getLatestEstimateVersion(show) {
    return Object.keys(show.estimateVersions).sort((a, b) => { return (parseFloat(b.replace('_', '.'))-parseFloat(a.replace('_', '.'))) })[0];
}

// Returns an array of keys that correspond to the grid's department value fields
function getDepartmentKeys(show) {
    let keys=[];
    for (d of show.departments) {
        keys.push(`${d} Man Days`);
        keys.push(`${d} Materials`);
        keys.push(`${d} Rentals`);
    }
    return keys;
}




/* CREW, RENTALS & PURCHASES FUNCTIONS */

// Update crew
updateCrew=async function (body, showId) {
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
                        taxColumnValues: {}
                    }
                    user.showrecords.push(record)
                }

                // Update user #
                record.weeksWorked[_cw]['#']=item['#'];

                // Update tax
                record.weeksWorked[_cw].taxColumnValues={}
                for (tax of show.weeks[_wk].crew.taxColumns) {
                    record.weeksWorked[_cw].taxColumnValues[tax]=item[tax]
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
                    let dateKey=new Date(day).toLocaleDateString('en-US');

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
                record.weeksWorked[_cw].extraColumnValues={}
                for (key of body.extraColumns) {
                    record.weeksWorked[_cw].extraColumnValues[key]=item[key];
                }

                // If creating new week, copy week worked from appropriate week 
                if (body.newWeek&&body.newWeek.isNewWeek) {
                    copyWeekFromRecord(body, show, record, newWeekId, user)
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
            }

            // Delete days worked for this week for any positions for this user that aren't active in the current week
            let record=crew.showrecords.find(r => r.showid==show._id.toString())
            for (pos of record.positions) {
                if (!body.data.find(item => item['username']==crew['username']&&item['Position']==pos.code)) {
                    for (day of body.currentWeekDays) {
                        let dateKey=new Date(day).toLocaleDateString('en-US');
                        delete pos.daysWorked[`${dateKey}`]
                    }
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
        await createWeek(body, show, newWeekId)
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return {};
}

// Update rentals
updateRentals=async function (body, showId) {
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
        await createWeek(body, show, genUniqueId())
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return {}
}

// Update purchases
updatePurchases=async function (body, showId) {
    let show=await Show.findById(showId)
        .populate('weeks.crew.crewList')
        .populate('purchases.purchaseList')

    // Save display settings
    show.purchases.displaySettings=body.displaySettings
    show.markModified('purchases.displaySettings')

    // Save extra Columns 
    show.purchases.extraColumns=body.extraColumns
    show.markModified('purchases.extraColumns')

    // Save tax Columns 
    show.purchases.taxColumns=body.taxColumns
    show.markModified('purchases.taxColumns')

    await show.save()

    // Update Purchases
    for (item of body.data) {
        if (item&&item['Set Code']&&item['Department']&&item['PO Num']) {
            let p=await Purchase.findOne({ 'PO Num': item['PO Num'] })
            // Find existing purchase 
            if (!p) {
                let set=await Set.findOne({ 'Set Code': item['Set Code'], show: show })
                p=await new Purchase({
                    extraColumnValues: {},
                    taxColumnValues: {},
                    set: set,
                    weekId: body.weeks[0]._id.toString()
                })
                await p.save()
                await show.purchases.purchaseList.push(p)
                show.markModified('purchases.purchaseList')
                await show.save()
            }

            // Save display key data
            for (key of p.displayKeys) {
                p[key]=item[key];
            }

            // Save extra column values
            p.extraColumnValues={};
            for (col of body.extraColumns) {
                p.extraColumnValues[col]=item[col]
            }
            p.markModified('extraColumnValues')

            // Save tax column values
            p.taxColumnValues={}
            for (taxCol of show.purchases.taxColumns) {
                p.taxColumnValues[taxCol]=item[taxCol]
            }
            p.markModified('taxColumnValues')

            await p.save();
        }
    }

    // Delete purchases that do not exist ** FIX THIS **
    for (p of show.purchases.purchaseList) {
        if (!body.data.find(item => item['PO Num']==p['PO Num'])) {
            await Purchase.findByIdAndDelete(p._id)
        }
    }
    show.markModified('purchases.purchaseList')
    await show.save()

    // Create new week if required
    if (body.newWeek) {
        await createWeek(body, show, genUniqueId())
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return {}
}




/* RATES FUNCTIONS */

// Update rates
updateRates=async function (body, showId) {
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
    show.positions.multipliers=body.multipliers;
    show.markModified('positions.multipliers');

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




/* COST REPORT FUNCTIONS */

// Update Cost Report
updateCostReport=async function (body, showId) {
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
        await createWeek(body, show, genUniqueId())
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return { success: true }
}



