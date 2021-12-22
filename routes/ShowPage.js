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
    let apName=crudUtils.getAccessProfileName(req.user)
    let { id, section }=req.params;
    let query=req.query;
    let show=await Show.findById(id)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile]

    // Set accessProfiles to empty object if user is not alllowed to view access profiles
    let accessProfiles=show.accessProfiles
    let accessMap=show.accessMap
    if (!accessProfile.options['View Access Profiles']) {
        accessProfiles={}
        accessMap={}
    }

    // Set args
    let args={
        section: section,
        showid: id,
        server: req.app.get('server'),
        weekList: show.weeks.map(w => { return { _id: w._id, end: w.end } }),
        week: show.weeks.find(w => w._id==show.accessMap[apName].currentWeek),
        accessProfileName: show.accessMap[apName].profile,
        accessProfiles,
        accessMap,
        username: req.user.username,
        accessLevel: accessProfile.accessLevel,
        apOptions: accessProfile.options
    };

    // Get shared and page-specific modals to include in rendered template. If no file at path do nothing with error
    let sharedModals=[]
    let pageModals=[]
    try {
        sharedModals=await fs.readdirSync(path.join(__dirname, `../views/ShowPage/SharedModals`));
        pageModals=await fs.readdirSync(path.join(__dirname, `../views/ShowPage/${section}/Modals`));
    } catch (e) {
        // Do Nothing
    }

    // Render ShowPage section if user has access to that page, otherwise redirect to original url
    let pageName=section
    if (pageName=='CostReport') { pageName='Cost Report' }
    let accessiblePages=crudUtils.showPages.filter(pn => show.accessProfiles[show.accessMap[apName].profile][pn].pageAccess)
    if (!accessiblePages[0]) { res.redirect('back') }
    else if (!accessiblePages.includes(pageName)) {
        section=accessiblePages[0].replace(' ', '')
    }
    return ShowPageCRUD[sanitizeHtml(section)].get(id, section, query, args, res, sharedModals, pageModals, req.user)

}))

// Send list of dropdown names to browser
router.get('/getDropdownNames', isLoggedIn, hasShowAccess, tryCatch(async (req, res, next) => {
    const { id, section }=req.params;
    let show=await Show.findById(id)

    let users=await User.find({})
    let dropdownNames=await users.map(user => `${user['Name']} [${user['username']}]`)

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

// Update access profiles route
router.post('/updateAccessProfiles', isLoggedIn, hasShowAccess, tryCatch(async (req, res, next) => {
    // Sanitize incoming data
    req.body=JSON.parse(sanitizeHtml(JSON.stringify(req.body)))
    let show=await Show.findById(req.params.id)
    const apName=crudUtils.getAccessProfileName(req.user)

    // Only save profiles if this user has the ability to edit accessprofiles
    let userAp=show.accessProfiles[show.accessMap[apName].profile]
    if (userAp.options['Edit Access Profiles']) {
        // Save access Profiles
        for (key in req.body.accessProfiles) {
            // Save existing access profile if it is a lower clearance level than user's profile
            if (show.accessProfiles[key]) {
                if (show.accessProfiles[key].accessLevel>userAp.accessLevel) {
                    show.accessProfiles[key]=req.body.accessProfiles[key]
                }
            } else {
                // Set minimum new access profile level to one above user's ap level
                if (req.body.accessProfiles[key].accessLevel<=userAp.accessLevel) {
                    req.body.accessProfiles[key].accessLevel=userAp.accessLevel+1
                }
                show.accessProfiles[key]=req.body.accessProfiles[key]
            }
        }

        // Delete deleted profiles
        for (key in show.accessProfiles) {
            if (!req.body.accessProfiles[key]) {
                delete show.accessProfiles[key]
            }
        }

        // Save access map. only users assigned to access profiles with lower clearance can be saved.
        for (uName in req.body.accessMap) {
            // Delete deleted maps
            if (req.body.accessMap[uName].profile=='_*DELETED*_'&&show.accessMap[uName]) {
                delete show.accessMap[uName]
                continue;
            }

            // Skip this uName if there is no access profile with the specified .profile name
            let profile=show.accessProfiles[req.body.accessMap[uName].profile]
            if (!profile) { continue }

            // Update profile for user with uName only if trying to change it to a profile that is a lower clearance level than that of user making request
            if (profile.accessLevel>userAp.accessLevel) {
                show.accessMap[uName]=req.body.accessMap[uName]

                //  Make sure there is a displaySettings object in every accessProfile showpage 
                //  that has a value for each week and estimate version for user with uName
                for (page of crudUtils.showPages) {
                    let displaySettings=show.accessProfiles[req.body.accessMap[uName].profile][page].displaySettings
                    if (!displaySettings[uName]) { displaySettings[uName]={} }
                    for (estVer in show.estimateVersions) {
                        for (week of show.weeks) {
                            let weekId=week._id
                            if (page=='Cost Report') {
                                if (!displaySettings[uName][estVer]) {
                                    displaySettings[uName][estVer]={}
                                }
                                if (!displaySettings[uName][estVer][weekId]) {
                                    displaySettings[uName][estVer][weekId]={}
                                }
                            } else if (page=='Estimate') {
                                if (!displaySettings[uName][estVer]) {
                                    displaySettings[uName][estVer]={}
                                }
                            } else {
                                if (!displaySettings[uName][weekId]) {
                                    displaySettings[uName][weekId]={}
                                }
                            }
                        }
                    }
                }
            }
        }


        // NEED TO DELETE PROFILES THAT NO LONGER EXIST
    }

    show.markModified('accessMap')
    show.markModified('accessProfiles')
    await show.save()

    res.send({ success: 'true' })
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