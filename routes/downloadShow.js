const express=require('express');
const path=require('path');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const Show=require('../models/show')
const User=require('../models/user')
const Queue=require('bull')
const fs=require('fs')
const schemaUtils=require('../utils/schemaUtils')
const crudUtils=require('./ShowPageCRUD/utils')
const router=express.Router({ mergeParams: true });
String.prototype.replaceAll=crudUtils.replaceAll

// Load email verification page after account creation
router.post('/:showid', async (req, res) => {
    const show=await schemaUtils.populateShow(req.params.showid)
    const activeWorkbookName=`${show.Name}-${new Date().toISOString().slice(0, 19)}`
    let apName=await crudUtils.getAccessProfileName(req.user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile]

    // Filter out pages that uesr has no access to from body.activeData
    for (page in accessProfile) {
        if (!accessProfile[page].pageAccess) {
            page=page.replace(' ', '')
            delete req.body.activeData[page]
        }
    }

    // Queue .xlsx generation for timesheetworker
    const tsGenQueue=new Queue('tsGenQueue', process.env.REDIS_URL)
    await tsGenQueue.add({
        type: 'show-download',
        show,
        activeData: req.body.activeData,
        activeWorkbookName
    })

    res.send({ filename: activeWorkbookName })

})

module.exports=router;