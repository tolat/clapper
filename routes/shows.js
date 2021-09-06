const express=require('express');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const { isLoggedIn }=require('../utils/customMiddleware')

const router=express.Router({ mergeParams: true });

const Show=require('../models/show');
const { genUniqueId }=require('../utils/numberUtils')

// Shows Load
router.get('/', isLoggedIn, tryCatch(async (req, res, next) => {
    const shows=await Show.find({ owner: req.user.username });
    res.render('shows', {
        title: 'Home',
        shows: shows,
        args: { server: req.app.get('server') }
    })
}))

// Shows create new show 
router.post('/', isLoggedIn, tryCatch(async (req, res, next) => {
    const show=await new Show(req.body.show)
    show.departments=show.departments.filter(d => d!='')
    show.estimateVersions={}
    show.positions.multipliers={}
    show.currentWeek=genUniqueId()
    show.departmentColorMap={}
    show.owner=req.user.username

    let newWeek={
        _id: show.currentWeek,
        end: new Date(req.body.show.firstweekending+'T00:00'),
        number: 1,
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
        }
    }

    show.weeks.push(newWeek)
    show.markModified('weeks')
    await show.save()

    res.redirect(`/shows/${show.id}/Estimate`);
}))

// Delete show with id
router.delete('/:id', isLoggedIn, tryCatch(async (req, res, next) => {
    await Show.findByIdAndDelete(req.params.id)
    res.send({ success: true })
}))


module.exports=router;