if (process.env.NODE_ENV!=='production') {
    require('dotenv').config()
}

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

tsGenQueue.on('global:completed', (job, result) => {
    console.log('DONE JOB!')
})

// Process tsGenQueue jobs
tsGenQueue.process(async (job, done) => {
    // Wait for template to be piped form the database
    await pipeTemplateFromDb(job).catch(e => done(e))

    // Generate timesheets
    await generateTimesheets(job.data.show, job.data.valueMap, job.data.week, job.data.filename, job.data.apName, job.data.accessProfile).catch(e => done(e))

    //Delete old file from GridFS
    await removeTemplateFromDB(job.data.filename).catch(e => done(e))

    // Write completed timesheets back to database
    await pipeCompletedTimesheetsToDb(job).catch(e => done(e))

    // Finish job 
    done(null, JSON.stringify({ filename: job.data.filename, fileid: job.data.fileid }))
})

// Delete uploaded tmeplate form db 
function removeTemplateFromDB(filename) {
    return new Promise(function (resolve, reject) {
        global.gfs.remove({ filename }, () => resolve())
    })
}

// Pipe completed timesheets xlsx file from local /uploads directory to the database
function pipeCompletedTimesheetsToDb(job) {
    return new Promise(function (resolve, reject) {
        const filepath=`${path.join(__dirname, '/uploads')}/${job.data.filename}.xlsx`

        // Stream completed timesheets to mongo 
        const readLocal=fs.createReadStream(filepath)
        const writeDB=global.gfs.createWriteStream({
            filename: job.data.filename,
            content_type: job.data.contentType
        })
        writeDB.on('finish', () => resolve())
        readLocal.on('open', function () { readLocal.pipe(writeDB) })
    })
}

// Pipe xlsx template from the database to local /uploads directory
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
async function generateTimesheets(show, valueMap, week, filename, apName, accessProfile) {
    // Get timesheet template workbook
    const filepath=`${path.join(__dirname, '/uploads')}/${filename}.xlsx`
    let workbook=new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filepath)
    let sheet=workbook.worksheets[0]
    let currentWeekDays=getDaysOfWeekEnding(week.end)
    const oneDay=24*60*60*1000;

    // Returns true if this user in in the crew list for given week
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

            // Add worksheet for this postion for this user to the timesheets workbook 
            let newSheet=workbook.addWorksheet(sheetName)

            // Save sheetName in position for use when populating values
            pos.sheetName=sheetName

            // Copy base sheet fields that don't throw error
            for (key in sheet) {
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
            let position=week.positions.positionList[pos.code]

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
            let hoursSetMap={}
            let setEpisodeMap={}
            let posDays=await Object.keys(pos.daysWorked).filter(dw => isInCurrentWeek(dw, user)).filter(dayKey => pos.daysWorked[dayKey])
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
                hoursSetMap[`${weekDay}-Set`]=pos.daysWorked[day].set

                let estimateVersion=show.estimateVersions[show.accessMap[apName].estimateVersion]
                let set=await estimateVersion.sets.find(s => s['Set Code']==pos.daysWorked[day].set)||{ Episode: "" }
                setEpisodeMap[`${weekDay}-Episode`]=set.Episode
            }

            console.log(2)
            // Assign variable values to cells in spreadsheet
            for (col in valueMap) {
                for (row in valueMap[col]) {
                    let cell=`${col}:${row}`
                    let value=valueMap[col][row]

                    // Load basic variables 
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
                        case 'Week-End':
                            sheet.getCell(cell).value=new Date(week.end).toString().slice(0, 10)
                            break;
                        case 'Crew-Position-Department':
                            sheet.getCell(cell).value=position.Department
                            break;
                    }

                    // Load hour variables 
                    if (Object.keys(mulHoursMap).includes(value)) {
                        let val=mulHoursMap[value]
                        if (isNaN(val)) { val=0 }
                        sheet.getCell(cell).value=val
                    }

                    // Load set variables 
                    if (Object.keys(hoursSetMap).includes(value)) {
                        let val=hoursSetMap[value]
                        if (isNaN(val)) { val=0 }
                        sheet.getCell(cell).value=val
                    }

                    // Load set episode variables 
                    if (Object.keys(setEpisodeMap).includes(value)) {
                        let val=hoursSetMap[value]
                        if (isNaN(val)) { val=0 }
                        sheet.getCell(cell).value=val
                    }

                    // Load weekday date variables
                    if (currentWeekDays.map(wd => wd.toString().slice(0, 3)+'-Date').includes(value)) {
                        let dayStr=currentWeekDays.map(wd => wd.toString().slice(0, 3)).filter(d => value.includes(d))[0]
                        let date=currentWeekDays.find(wd => wd.toString().includes(dayStr))
                        sheet.getCell(cell).value=date.toString().slice(0, 10)
                    }

                    // Load extracolumn variables
                    for (extraCol of week.crew.extraColumns) {
                        if (value==extraCol) {
                            try {
                                sheet.getCell(cell).value=record.weeksWorked[week._id].extraColumnValues[pos.code][value]
                            } catch (e) {
                                // Do nothing if error - value does not exist in db
                                console.log(e.message)
                            }
                        }
                    }

                    // Load tax column variables
                    for (taxCol of week.crew.taxColumns) {
                        if (value==taxCol) {
                            try {
                                sheet.getCell(cell).value=record.weeksWorked[week._id].taxColumnValues[pos.code][value]
                            } catch (e) {
                                // Do nothing if error - value does not exist in db
                                console.log(e.message)
                            }
                        }
                    }
                }
            }
        }
    }

    // Write final workbook to local file
    await workbook.xlsx.writeFile(filepath)
}

