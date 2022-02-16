const express=require('express');
const path=require('path');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const Show=require('../models/show')
const User=require('../models/user')
const Queue=require('bull')
const fs=require('fs')
const schemaUtils=require('../utils/schemaUtils')

const router=express.Router({ mergeParams: true });

// Load email verification page after account creation
router.post('/:showid', async (req, res) => {
    const show=await schemaUtils.populateShow(req.params.showid)

    // Queue .xlsx generation for timesheetworker
    const tsGenQueue=new Queue('tsGenQueue', process.env.REDIS_URL)
    await tsGenQueue.add({
        type: 'show-download',
        show,
        activeData: req.body.activeData
    })

    res.send({ success: 'success!' })

})

module.exports=router;