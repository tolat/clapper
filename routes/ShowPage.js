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
    const { id, section }=req.params;
    const query=req.query;
    let args={ section: section, server: req.app.get('server') };

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
router.put('/', isLoggedIn, upload.single('file'), tryCatch(async (req, res, next) => {
    let show=await populateShow(req.params.id)
    let cellValueMap=await parseValueMap(JSON.parse(req.body.items))
    let week=await show.weeks.find(w => w._id.toString()==show.currentWeek)

    // Queue generation job for worker
    const tsGenQueue=new Queue('tsGenQueue', process.env.REDIS_URL)
    await tsGenQueue.add({
        show,
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