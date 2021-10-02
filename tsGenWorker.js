const Queue=require('bull')
const ExcelJS=require('exceljs')
const fs=require('fs')

// Create consumer queue
const tsGenQueue=new Queue('tsGenQueue', process.env.REDIS_URL)

// Process tsGenQueue jobs
tsGenQueue.process((job) => {
    console.log(`\n\n\nConsuming job: ${job.id}\n\n\n`)

    console.log(`\n\n\nFilepath: ${job.data.filepath}\n\n\n`)

    // Make sure uploaded excel file exists before trying to generate timesheets
    let fileCreated=false
    while (!fileCreated) {
        try {
            fs.readFileSync(job.data.filepath)
            fileCreated=true
        } catch (e) {
            continue
        }
    }

    console.log(`\n\n\nFile created!\n\n\n`)

    // Generate timesheets
    generateTimesheets(job.data.show, job.data.valueMap, job.data.filepath, job.data.week)

    return true
})

// Generate timesheets using the file at filepath as the template workbook
async function generateTimesheets(show, valueMap, filepath, week) {
    // Set filepath and get timesheet template workbook
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

    // Write final workbook data to file 
    await workbook.xlsx.writeFile(filepath)
}

