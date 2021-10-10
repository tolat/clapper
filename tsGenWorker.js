const Queue=require('bull')
const ExcelJS=require('exceljs')
const fs=require('fs')
const path=require('path')
const GridStream=require('gridfs-stream')
const mongoose=require('mongoose')

// Connect to the database and handle connection errors
mongoose.connect(process.env.DB_URL, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true
});
let db=mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Timesheet worker process connected to database')
    // Initialize gridstrem on global variable so we can read and write files from mongodb gridfs
    global.gfs=GridStream(db.db, mongoose.mongo)
});

// Create consumer queue
const tsGenQueue=new Queue('tsGenQueue', process.env.REDIS_URL)

// Process tsGenQueue jobs
tsGenQueue.process(async (job, done) => {
    // Wait for template to be piped form the database
    console.log('piping from db')
    await pipeTemplateFromDb(job)

    console.log('generating')
    // Generate timesheets
    await generateTimesheets(job.data.show, job.data.valueMap, job.data.week, job.data.filename)

    console.log('deleting old upload')
    // Delete old file from GridFS
    await removeTemplateFromDB(job.data.filename)

    console.log('piping completed to db')
    // Write completed timesheets back to database
    await pipeCompletedTimesheetsToDb(job)

    done(null, JSON.stringify({ filename: job.data.filename, fileid: job.data.fileid }))
})

function removeTemplateFromDB(filename) {
    return new Promise(function (resolve, reject) {
        global.gfs.remove({ filename }, () => resolve())
    })
}

function pipeCompletedTimesheetsToDb(job) {
    return new Promise(function (resolve, reject) {
        // Stream completed timesheets to mongo 
        const filepath=`${path.join(__dirname, '/uploads')}/${job.data.filename}.xlsx`
        const readLocal=fs.createReadStream(filepath)
        const writeDB=global.gfs.createWriteStream({
            filename: job.data.filename,
            content_type: job.data.contentType
        })

        writeDB.on('finish', () => resolve())
        writeDB.on('error', function (err) { console.log(`STREAM ERROR: ${err}`) })
    })
}

function pipeTemplateFromDb(job) {
    return new Promise(function (resolve, reject) {
        // Create streams and read file from mongo to local uploads directory and add .xlsx extension
        const readDB=global.gfs.createReadStream({ _id: job.data.fileid })
        const filepath=`${path.join(__dirname, '/uploads')}/${job.data.filename}.xlsx`
        const writeLocal=fs.createWriteStream(filepath)
        writeLocal.on('finish', () => resolve())
        writeLocal.on('error', () => reject())
        readDB.pipe(writeLocal)
    })
}

// Returns array of dates representing the current week
function getDaysOfWeekEnding(date) {
    const oneDay=24*60*60*1000;
    let day=new Date(date);
    let days=[];
    for (let i=0; i<7; i++) {
        days.unshift(new Date(day-oneDay*i));
    }
    return days;
}

// Generate timesheets using the file at filepath as the template workbook
async function generateTimesheets(show, valueMap, week, filename) {
    console.log(`\n\nFilename: ${filename}`)
    console.log(`/uploads: ${fs.readdirSync(path.join(__dirname, '/uploads/'))}\n\n`)

    // Get timesheet template workbook
    const filepath=`${path.join(__dirname, '/uploads')}/${filename}.xlsx`
    let workbook=new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filepath)
    let sheet=workbook.worksheets[0]
    let currentWeekDays=getDaysOfWeekEnding(week.end)
    const oneDay=24*60*60*1000;

    function isInCurrentWeek(day, user) {
        let dateMS=new Date(day).getTime()
        let weekEndMS=new Date(week.end).getTime()
        if (dateMS<=weekEndMS&&dateMS>=(weekEndMS-7*oneDay)) {
            if (week.crew.crewList.find(c => c.username==user.username)) {
                return true
            }
        }
    }

    // Create worksheet copies
    for (user of week.crew.crewList) {
        let record=user.showrecords.find(r => r.showid==show._id.toString())
        for (pos of record.positions) {
            // Make sure sheet name is under 31 chars (excel limitation)
            let sheetName=`${user.username} - ${pos.code}`
            if (sheetName.length>31) {
                let postAt=sheetName.slice(sheetName.indexOf('@'))
                let preAt=sheetName.slice(0, sheetName.indexOf('@'))
                let overshoot=sheetName.length-28
                preAt='('+preAt.slice(0, preAt.length-overshoot-1)+')'
                let newName=preAt.concat(postAt)
                sheetName=newName
            }

            let newSheet=workbook.addWorksheet(sheetName)

            // Save sheetName in position for use when populating values
            pos.sheetName=sheetName

            // Copy base sheet fields that don't throw error
            for (key of Object.keys(sheet)) {
                try { Object.assign(newSheet[`${key}`], sheet[`${key}`]) } catch (e) { }
            }

            // Copy base sheet column widths
            for (let i=0; i<sheet._columns.length; i++) {
                newSheet.getColumn(i+1).width=sheet._columns[i].width
            }
        }
    }

    // Reload workbook after saving worksheet copies
    await workbook.xlsx.writeFile(filepath)
    await workbook.xlsx.readFile(filepath)

    // Populate worksheet copies with data
    for (user of week.crew.crewList) {
        let record=user.showrecords.find(r => r.showid==show._id.toString())

        for (pos of record.positions) {
            let position=show.positions.positionList.find(p => p.Code==pos.code)

            let sheet=await workbook.getWorksheet(pos.sheetName)

            // Create list of unique multipliers for this week
            let uniqueMuls=[0]
            for (mul in week.multipliers) {
                for (day of currentWeekDays) {
                    let dayAbbrv=day.toString().slice(0, 3)
                    let mulVal=week.multipliers[mul][dayAbbrv]
                    if (!uniqueMuls.includes(mulVal)) {
                        uniqueMuls.push(mulVal)
                    }
                }
            }

            // Create map of all multiplier values to hours worked in that interval
            let mulHoursMap={}
            let posDays=await Object.keys(pos.daysWorked).filter(dw => isInCurrentWeek(dw, user))
            for (day of posDays) {
                let weekDay=new Date(day).toDateString('en-US').slice(0, 3)
                let hours=pos.daysWorked[day].hours
                let mulKeys=Object.keys(week.multipliers)

                for (let i=0; i<mulKeys.length; i++) {
                    let mul=week.multipliers[mulKeys[i]][weekDay]
                    let mulHours=0
                    if (hours>mulKeys[i]) {
                        mulHours=hours-mulKeys[i]
                    }
                    if (mulKeys[i+1]&&hours>mulKeys[i+1]) {
                        mulHours=mulKeys[i+1]-mulKeys[i]
                    }

                    mulHoursMap[`${weekDay}-Hours-${mul}x`]=mulHours
                }
                mulHoursMap[`${weekDay}-Hours-Total`]=hours
            }

            // Assign variable values to cells in spreadsheet
            for (col in valueMap) {
                for (row in valueMap[col]) {
                    let cell=`${col}:${row}`
                    let value=valueMap[col][row]

                    // Load basic variables into spreadsheet
                    switch (value) {
                        case 'Show-Name':
                            sheet.getCell(cell).value=show.Name
                            break;
                        case 'Crew-Name':
                            sheet.getCell(cell).value=user.Name
                            break;
                        case 'Crew-Phone':
                            sheet.getCell(cell).value=user.Phone
                            break;
                        case 'Crew-Position':
                            sheet.getCell(cell).value=pos.code
                            break;
                        case 'Crew-Position-Rate':
                            sheet.getCell(cell).value=position.Rate
                            break;
                    }

                    // Load hour variable values into spreadsheet
                    if (Object.keys(mulHoursMap).includes(value)) {
                        let val=mulHoursMap[value]
                        if (isNaN(val)) { val=0 }
                        sheet.getCell(cell).value=val
                    }
                }
            }
        }
    }

    // Write final workbook to local file
    await workbook.xlsx.writeFile(filepath)

    console.log('At end of generation function')
}

