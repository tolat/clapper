const express=require('express');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const { isLoggedIn }=require('../utils/customMiddleware')

const router=express.Router({ mergeParams: true });

const Show=require('../models/show');
const User=require('../models/user');
const { genUniqueId }=require('../utils/numberUtils')

// Shows Load
router.get('/', isLoggedIn, tryCatch(async (req, res, next) => {
    // Get shows that user has access to
    const shows=await Show.find({
        $or: [
            {
                owner: req.user.username
            },
            {
                hasAccess: { $in: [req.user.username] }
            }
        ]
    })

    // Render shows page (homepage)
    res.render('shows', {
        title: 'Home',
        shows: shows,
        args: { server: req.app.get('server') }
    })
}))

// Create new show 
router.post('/', isLoggedIn, tryCatch(async (req, res, next) => {
    const show=await new Show(req.body.show)
    show.departments=show.departments.filter(d => d!='')
    show.estimateVersions={}
    show.currentWeek=genUniqueId()
    show.departmentColorMap={}
    show.owner=req.user.username
    show.accessProfiles=[
        {
            name: '__Owner',
            'Cost Report': {
                users: [req.user.username],
                columnFilter: [],
                dataFilter: {}
            },
            'Estimate': {
                users: [req.user.username],
                columnFilter: [],
                dataFilter: {}
            },
            'Purchases': {
                users: [req.user.username],
                columnFilter: [],
                dataFilter: {}
            },
            'Rentals': {
                users: [req.user.username],
                columnFilter: [],
                dataFilter: {}
            },
            'Crew': {
                users: [req.user.username],
                columnFilter: [],
                dataFilter: {}
            },
            'Rates': {
                users: [req.user.username],
                columnFilter: [],
                dataFilter: {}
            },
            'Timesheets': {
                users: [req.user.username],
                columnFilter: [],
                dataFilter: {}
            }

        }
    ]

    // Create first week
    let newWeek={
        _id: show.currentWeek,
        end: new Date(req.body.show.firstweekending+'T07:00'),
        number: 1,
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
            displaySettings: {},
            extraColumns: [],
            taxColumns: []
        },
        rentals: {
            rentalList: [],
            extraColumns: [],
            taxColumns: [],
            displaySettings: {}
        },
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