const express=require('express')
const path=require('path')
const tryCatch=require('../utils/tryCatch')
const ExpressError=require('../utils/ExpressError')
const { isLoggedIn, isShowOwner, hasShowAccess }=require('../utils/customMiddleware')
const sanitizeHtml=require('sanitize-html')
const fs=require('fs')
const multer=require('multer')
const { GridFsStorage }=require('multer-gridfs-storage')
const storage=new GridFsStorage({ url: process.env.DB_URL, options: { useUnifiedTopology: true } })
const upload=multer({ storage })
const router=express.Router({ mergeParams: true })
const { populateShow }=require('../utils/schemaUtils')
const Queue=require('bull')
const Show=require('../models/show')
const User=require('../models/user')
const crudUtils=require('../routes/ShowPageCRUD/utils')
const schemaUtils=require('../utils/schemaUtils')

const ShowPageCRUD={
    Estimate: require('./ShowPageCRUD/Estimate'),
    CostReport: require('./ShowPageCRUD/CostReport'),
    Purchases: require('./ShowPageCRUD/Purchases'),
    Rentals: require('./ShowPageCRUD/Rentals'),
    Rates: require('./ShowPageCRUD/Rates'),
    Crew: require('./ShowPageCRUD/Crew'),
    Timesheets: require('./ShowPageCRUD/Timesheets')
}

// Load a Show Page section
router.get('/', isLoggedIn, hasShowAccess, tryCatch(async (req, res, next) => {
    const apName=crudUtils.getAccessProfileName(req.user)
    const { id, section }=req.params;
    const query=req.query;
    let show=await Show.findById(id)

    let args={
        section: section,
        showid: id,
        server: req.app.get('server'),
        weekList: show.weeks.map(w => { return { _id: w._id, end: w.end } }),
        week: show.weeks.find(w => w._id==show.accessMap[apName].currentWeek),
        accessProfileName: show.accessMap[apName].profile,
        accessProfiles: show.accessProfiles,
        accessMap: show.accessMap,
        username: req.user.username
    };

    // Get shared and page-specific modals to include in rendered template. If no file at path do nothing with error
    let sharedModals=[]
    let pageModals=[]
    try {
        sharedModals=await fs.readdirSync(path.join(__dirname, `../views/ShowPage/SharedModals`));
        pageModals=await fs.readdirSync(path.join(__dirname, `../views/ShowPage/${section}/Modals`));
    } catch (e) { }

    // Render ShowPage section
    return ShowPageCRUD[sanitizeHtml(section)].get(id, section, query, args, res, sharedModals, pageModals, req.user)
}))

// Send list of dropdown names to browser
router.get('/getDropdownNames', isLoggedIn, hasShowAccess, tryCatch(async (req, res, next) => {
    const { id, section }=req.params;
    let show=await Show.findById(id)

    let crewIds=await crudUtils.getAllCrewIDs(id)
    let allCrew=await crudUtils.getAllCrewUsers(crewIds)
    let dropdownNames=await allCrew.map(user => `${user['Name']} [${user['username']}]`)

    // Add users from accessMap
    for (key in show.accessMap) {
        while (key.includes('-')) { key=key.replace('-', '.') }
        let usr=await User.findOne({ username: key })
        let usrDropdownName=`${usr['Name']} [${usr['username']}]`
        if (!dropdownNames.includes(usrDropdownName)) {
            dropdownNames.push(usrDropdownName)
        }
    }

    res.send({ dropdownNames })
}))

// Delete route for ShowPage sections
router.delete('/', isLoggedIn, hasShowAccess, tryCatch(async (req, res, next) => {
    let responseData=await ShowPageCRUD[sanitizeHtml(req.params.section)].delete(req.body, req.params.id);
    res.send(responseData);
}))

// Post (update) route for ShowPage sections
router.post('/', isLoggedIn, hasShowAccess, tryCatch(async (req, res, next) => {
    // Sanitize incoming data
    req.body=JSON.parse(sanitizeHtml(JSON.stringify(req.body)))
    let responseData=await ShowPageCRUD[sanitizeHtml(req.params.section)].update(req.body, req.params.id, req.user);
    res.send(responseData)
}))

// Put route for uploading new timesheet templates
router.put('/', isLoggedIn, hasShowAccess, upload.single('file'), tryCatch(async (req, res, next) => {
    const apName=crudUtils.getAccessProfileName(req.user)
    const show=await schemaUtils.populateShow(req.params.id)
    const accessProfile=show.accessProfiles[show.accessMap[apName].profile].Timesheets
    const cellValueMap=await crudUtils.parseValueMap(JSON.parse(req.body.items))
    const week=await show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)

    // Queue generation job for worker
    const tsGenQueue=new Queue('tsGenQueue', process.env.REDIS_URL)
    await tsGenQueue.add({
        show,
        accessProfile,
        apName,
        valueMap: cellValueMap,
        week,
        fileid: req.file.id,
        filename: req.file.filename,
        contentType: req.file.contentType
    })

    // Send file info back
    res.send({ file: req.file, body: req.body })
}))

module.exports=router;