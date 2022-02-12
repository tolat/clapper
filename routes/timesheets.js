const express=require('express');
const ExpressError=require('../utils/ExpressError');
const { isLoggedIn }=require('../utils/customMiddleware')
const path=require('path');
const tryCatch=require('../utils/tryCatch');
const router=express.Router({ mergeParams: true });
const fs=require('fs')
const Queue=require('bull')
const tsGenQueue=new Queue('tsGenQueue', process.env.REDIS_URL)

// Listen to Bull queue for completed timesheet generation 
tsGenQueue.on('global:completed', async (job, result) => {
    // Print error to console if error
    if (result.statusCode) {
        console.log(`Error:${result.statusCode}\n\n${result.message}\n`)
        return
    }

    // Handle completed timesheet generation job
    if (job.type=='timesheet-generation') {

        const resultObj=JSON.parse(JSON.parse(result))

        // Pipe in completed timesheets form DB
        await pipeCompletedTimesheetsFromDB(resultObj)

        // Make this file as completed
        global.generatedTimesheets.push(resultObj.filename)

        // Clear generated timesheets from db (they were only uploaded for generation)
        await removeGeneratedTimesheetsFromDB(resultObj.filename)
    }
})

//Helper to clear generated timesheets from db 
function removeGeneratedTimesheetsFromDB(filename) {
    return new Promise(function (resolve, reject) {
        global.gfs.remove({ filename }, () => resolve())
    })
}

// Helper to return a promise that resolves when timesheets are piped in from db
function pipeCompletedTimesheetsFromDB(resultObj) {
    return new Promise(function (resolve, reject) {
        const readDB=global.gfs.createReadStream({ filename: resultObj.filename })
        const filepath=`${path.join(__dirname, '../uploads')}/${resultObj.filename}.xlsx`
        const writeLocal=fs.createWriteStream(filepath)
        writeLocal.on('finish', () => resolve())
        writeLocal.on('error', () => reject())
        readDB.pipe(writeLocal)
    })
}

// Check if timesheets have been generated for :filenamme template
router.get('/checkgenerated/:filename', isLoggedIn, tryCatch(async (req, res, next) => {
    // Tell client if timesheets for :filename have been generated
    if (global.generatedTimesheets.includes(req.params.filename)) {
        res.send({ filename: req.params.filename })
    } else {
        res.send({ filename: false })
    }
}))

// Download :filename from uploads folder route
router.get('/uploads/:filename', isLoggedIn, async (req, res, next) => {
    let filepath=path.join(__dirname, `uploads/${req.params.filename}`)
    const file=await fs.readFileSync(filepath)
    res.send(file)
})

module.exports=router;
