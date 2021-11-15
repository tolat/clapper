const express=require('express');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const { isLoggedIn }=require('../utils/customMiddleware')

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
        __Owner: {
            'Cost Report': {
                columnFilter: [],
                dataFilter: {},
                displaySettings: { [`${apName}`]: {} }
            },
            'Estimate': {
                columnFilter: [],
                dataFilter: {},
                displaySettings: { [`${apName}`]: {} }
            },
            'Purchases': {
                columnFilter: [],
                dataFilter: {},
                displaySettings: { [`${apName}`]: {} }
            },
            'Rentals': {
                columnFilter: [],
                dataFilter: {},
                displaySettings: { [`${apName}`]: {} }
            },
            'Crew': {
                columnFilter: [],
                dataFilter: {},
                displaySettings: { [`${apName}`]: {} }
            },
            'Rates': {
                columnFilter: [],
                dataFilter: {},
                displaySettings: { [`${apName}`]: {} }
            },
            'Timesheets': {
                columnFilter: [],
                dataFilter: {},
                displaySettings: { [`${apName}`]: {} }
            }

        }
    }
    show.accessMap={
        [`${apName}`]: {
            profile: '__Owner',
            estimateVersion: false,
            currentWeek: show.currentWeek
        }
    }

    // Create first week
    let newWeek={
        _id: show.currentWeek,
        end: new Date(req.body.show.firstweekending+'T07:00'),
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
router.delete('/:id', isLoggedIn, tryCatch(async (req, res, next) => {
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