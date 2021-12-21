const express=require('express');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const { isLoggedIn, isShowOwner }=require('../utils/customMiddleware')

const router=express.Router({ mergeParams: true });

const Show=require('../models/show');
const User=require('../models/user');
const { genUniqueId }=require('../utils/numberUtils')
const crudUtils=require('./ShowPageCRUD/utils')

// Shows Load
router.get('/', isLoggedIn, tryCatch(async (req, res, next) => {
    // Get shows that user has access to
    let shows=await Show.find({})
    let apName=await crudUtils.getAccessProfileName(req.user)

    shows=await shows.filter(show => Object.keys(show.accessMap).includes(apName))

    // Render shows page (homepage)
    res.render('shows', {
        title: 'Home',
        shows,
        args: { server: req.app.get('server') },
        apName
    })
}))

// Create new show 
router.post('/', isLoggedIn, tryCatch(async (req, res, next) => {
    const show=await new Show(req.body.show)
    show.departments=show.departments.filter(d => d!='')
    show.estimateVersions={}
    show.currentWeek=genUniqueId()
    show.departmentColorMap={}

    // Create accessProfiles and accessMap
    let apName=await crudUtils.getAccessProfileName(req.user)
    show.accessProfiles={
        Owner: {
            accessLevel: 0,
            options: {
                'View Weeks': true,
                'Edit Weeks': true,
                'View Estimate Versions': true,
                'Edit Estimate Versions': true,
                'View Access Profiles': true,
                'Edit Access Profiles': true,
                'View Fringes': true,
                'Edit Fringes': true,
                'View Manday Rates': true,
                'Edit Manday Rates': true,
                'View Multipliers': true,
                'Edit Multipliers': true,
            },
            'Cost Report': {
                pageAccess: true,
                columnFilter: { type: 'b', filter: [] },
                dataFilter: { type: 'b', filter: {} },
                editColumnFilter: { type: 'b', filter: [] },
                editDataFilter: { type: 'b', filter: {} },
                displaySettings: { [`${apName}`]: {} }
            },
            'Estimate': {
                pageAccess: true,
                columnFilter: { type: 'b', filter: [] },
                dataFilter: { type: 'b', filter: {} },
                editColumnFilter: { type: 'b', filter: [] },
                editDataFilter: { type: 'b', filter: {} },
                displaySettings: { [`${apName}`]: {} }
            },
            'Purchases': {
                pageAccess: true,
                columnFilter: { type: 'b', filter: [] },
                dataFilter: { type: 'b', filter: {} },
                editColumnFilter: { type: 'b', filter: [] },
                editDataFilter: { type: 'b', filter: {} },
                displaySettings: { [`${apName}`]: {} }
            },
            'Rentals': {
                pageAccess: true,
                columnFilter: { type: 'b', filter: [] },
                dataFilter: { type: 'b', filter: {} },
                editColumnFilter: { type: 'b', filter: [] },
                editDataFilter: { type: 'b', filter: {} },
                displaySettings: { [`${apName}`]: {} }
            },
            'Crew': {
                pageAccess: true,
                columnFilter: { type: 'b', filter: [] },
                dataFilter: { type: 'b', filter: {} },
                editColumnFilter: { type: 'b', filter: [] },
                editDataFilter: { type: 'b', filter: {} },
                displaySettings: { [`${apName}`]: {} }
            },
            'Rates': {
                pageAccess: true,
                columnFilter: { type: 'b', filter: [] },
                dataFilter: { type: 'b', filter: {} },
                editColumnFilter: { type: 'b', filter: [] },
                editDataFilter: { type: 'b', filter: {} },
                displaySettings: { [`${apName}`]: {} }
            },
            'Timesheets': {
                pageAccess: true,
                columnFilter: { type: 'b', filter: [] },
                dataFilter: { type: 'b', filter: {} },
                editColumnFilter: { type: 'b', filter: [] },
                editDataFilter: { type: 'b', filter: {} },
                displaySettings: { [`${apName}`]: {} }
            }
        }
    }
    show.accessMap={
        [`${apName}`]: {
            profile: 'Owner',
            estimateVersion: false,
            currentWeek: show.currentWeek
        }
    }

    // Create first week
    let newWeek={
        _id: show.currentWeek,
        end: new Date(req.body.show.firstweekending+`GMT${req.body.show.tzone}`),
        multipliers: {
            0: {
                Mon: 1,
                Tue: 1,
                Wed: 1,
                Thu: 1,
                Fri: 1,
                Sat: 1,
                Sun: 1
            }
        },
        crew: {
            crewList: [],
            extraColumns: [],
            taxColumns: []
        },
        rentals: {
            rentalList: [],
            extraColumns: [],
            taxColumns: [],
        },
        positions: {
            extraColumns: [],
            positionList: {}
        }
    }

    show.timesheets.currentMap=undefined
    show.weeks.push(newWeek)
    show.markModified('weeks')
    await show.save()

    res.redirect(`/shows/${show.id}/Estimate`);
}))

// Delete show with id
router.delete('/:id', isLoggedIn, isShowOwner, tryCatch(async (req, res, next) => {
    // Delete all user records of show
    let messages=[]
    let show=await (await Show.findById(req.params.id))
    for (week of show.weeks) {
        for (crew of week.crew.crewList) {
            let user=await User.findById(crew)
            let record=user.showrecords.find(r => r.showid==show._id.toString())
            if (record) {
                // Delete showrecord
                user.showrecords=user.showrecords.filter(r => r.showid!=record.showid)
                delete record
            }
            await user.save()
        }
    }

    // Delete show
    await Show.findByIdAndDelete(req.params.id)

    res.send({ success: true, messages: messages })
}))


module.exports=router;