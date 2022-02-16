const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const crudUtils=require('./utils')
const numUtils=require('../../utils/numberUtils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals, user, dataOnly) {
    let show=await populateShow(id);

    // Get accessProfile
    let apName=await crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile]['Cost Report']
    let estimateVersion=show.accessMap[apName].estimateVersion

    // Temporary fix for renamed/deleted versions lingering in accessMap
    if (!show.estimateVersions[estimateVersion]) {
        estimateVersion=Object.keys(show.estimateVersions)[0]
        show.accessMap[apName].estimateVersion=estimateVersion
        show.markModified('accessMap')
        await show.save()
    }

    // Create a list of estimateVersion keys sorted by date
    let sortedVersionKeys=Object.keys(show.estimateVersions)
        .map(k => { show.estimateVersions[k].key=k; return show.estimateVersions[k] })
        .sort((a, b) => a.dateCreated>b.dateCreated? -1:1)
        .map(ev => ev.key)

    args.reloadOnWeekChange=true;
    args.latestVersion=sortedVersionKeys[0]
    args.version=estimateVersion
    args.extraColumns=show.costReport.extraColumns

    // Generate grid data
    let week=show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)
    let showCrew=await crudUtils.getAllCrewUsers(await crudUtils.getAllCrewIDs(show._id.toString()))
    let data=initializeData(show.estimateVersions[estimateVersion].sets, show, week, accessProfile, estimateVersion, showCrew)


    if (dataOnly) {
        res.send({ data })
    } else {
        res.render('ShowPage/Template', {
            title: `${show['Name']} - ${section}`,
            show,
            section,
            args,
            sharedModals,
            pageModals,
            data,
            apName,
            accessProfile,
            user,
            sortedVersionKeys,
            estimateVersion
        })
    }
}

// Update Cost Report
module.exports.update=async function (body, showId, user) {
    let show=await Show.findById(showId)

    // Get accessProfile
    let apName=await crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile]['Cost Report']
    let apOptions=show.accessProfiles[show.accessMap[apName].profile].options

    // Get current Week
    let week=show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)

    // Get current estimate version
    let estimateVersion=show.accessMap[apName].estimateVersion

    // Save display settings to access profile
    accessProfile.displaySettings[apName][estimateVersion][week._id]=body.displaySettings;
    show.markModified('accessProfiles');

    // Save extra Columns to show
    show.costReport.extraColumns=body.extraColumns;
    show.markModified('costReport.extraColumns');

    // Handle changing estimate versions
    if (apOptions['View Estimate Versions']||apOptions['Edit Estimate Versions']) {
        if (body.updateVersion) {
            if (!accessProfile.displaySettings[apName][body.updateVersion]) {
                accessProfile.displaySettings[apName][body.updateVersion]={
                    [`${week._id}`]: {}
                }
            }

            show.accessMap[apName].estimateVersion=body.updateVersion
            show.markModified('accessMap')
            show.markModified('accessProfiles')
        }
    }

    // Save total and budget to show
    show.costReport.toDate=body.totals['To Date'];
    show.costReport.budget=body.totals['Budget'];
    show.costReport.remaining=body.totals['Remaining'];

    // Save extra column values for cost report
    for (item of body.data) {
        if (item['Set Code']) {
            // Save extra column values if they are not restricted
            for (col of body.extraColumns) {
                if (!crudUtils.isRestrictedColumn(col, accessProfile)) {
                    if (!show.costReport.setExtraColumnMap[item['Set Code']])
                        show.costReport.setExtraColumnMap[item['Set Code']]={}
                    show.costReport.setExtraColumnMap[item['Set Code']][col]=item[col];
                }
            }
        }
    }

    show.markModified('costReport.setExtraColumnMap');
    show.markModified('costReport.setNumberMap');

    await show.save();

    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, genUniqueId(), apName)
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, show.weeks, apName)
    }

    return { message: 'Success' }
}

// Creates grid data 
function initializeData(sets, show, week, accessProfile, estimateVersion, showCrew) {
    let data=[];
    let mandayRates=show.estimateVersions[estimateVersion].mandayRates
    let fringes=show.estimateVersions[estimateVersion].fringes
    let totalFringe=1
    if (Object.keys(fringes)[0]) {
        totalFringe=Object.keys(fringes).map(k => { return numUtils.zeroNanToNull(parseFloat(fringes[k]))||1 }).reduce((p, c) => p+c)/100+1
    }

    for (let i=0; i<sets.length; i++) {
        let item={
            id: 'id_'+i,
            setid: sets[i]._id,
            // Core features
            ['Set Code']: sets[i]['Set Code'],
            ['Episode']: sets[i]['Episode'],
            ['Name']: sets[i]['Name'],
        }

        // Get set for item
        let set=sets.find(s => s['Set Code']==item['Set Code']);

        // Initialize overall totals
        let costs=calculateCosts(item, show, week, showCrew);

        // Set total cost keys to 0
        let costKeys=['To Date', 'This Week', 'Labor', 'Man Days', 'Materials', 'Rentals'];
        item['Budget']=numUtils.zeroNanToNull(parseFloat(calculateBudget(set, totalFringe, mandayRates, show.departments)).toFixed(2));

        // Initialize cost keys to 0
        for (key of costKeys) { item[key]=0 }

        // Add department split-out costs
        for (d of show.departments) {
            let labor=costs[0][d].total;
            let materials=costs[1][d].total;
            let rentals=costs[2][d].total;
            let week=costs[0][d].week+costs[1][d].week+costs[2][d].week;
            let mandays=costs[0][d].mandays

            item[`${d}_week`]=numUtils.zeroNanToNull(week.toFixed(2));
            item[`${d}_todate`]=numUtils.zeroNanToNull((labor+materials+rentals).toFixed(2));
            item[`${d}_budget`]=numUtils.zeroNanToNull(calculateDepartmentBudget(d, mandayRates, set, totalFringe).toFixed(2))
            item[`${d}_labor`]=numUtils.zeroNanToNull(labor.toFixed(2));
            item[`${d}_materials`]=numUtils.zeroNanToNull(materials.toFixed(2));
            item[`${d}_rentals`]=numUtils.zeroNanToNull(rentals.toFixed(2));
            item[`${d}_mandays`]=numUtils.zeroNanToNull(mandays.toFixed(2));

            // Calculate precent remaining
            let pctRemaining=((item[`${d}_budget`]-item[`${d}_todate`])/item[`${d}_budget`]*100);
            if (isNaN(pctRemaining)) { pctRemaining=0 }
            item[`${d}_pctremaining`]=numUtils.zeroNanToNull(pctRemaining.toFixed(0));

            item['Labor']+=labor;
            item['Man Days']+=mandays;
            item['Materials']+=materials;
            item['Rentals']+=rentals;
            item['This Week']+=week;
            item['To Date']+=labor+materials+rentals;
        }

        // Calculate and set overall remaining 
        if (!item['Budget']&&item['To Date']>0&&item['To Date']!=null) {
            item['Remaining']=-item['To Date']
        } else {
            item['Remaining']=numUtils.zeroNanToNull((parseFloat(item['Budget'])-parseFloat(item['To Date'])).toFixed(2));
        }

        // Calculate and set overall % remaining
        if (item['Budget']!=0) { item['% Remaining']=numUtils.zeroNanToNull((item['Remaining']/item['Budget']*100).toFixed(0)) }

        // Set total costs to 2 decimal places and set to null if 0 or Nan
        for (key of costKeys) {
            item[key]=numUtils.zeroNanToNull(parseFloat(item[key]).toFixed(2));
        }

        // Add extra column values
        for (col of show.costReport.extraColumns) {
            let map=show.costReport.setExtraColumnMap[item['Set Code']];
            if (map) { item[col]=map[col] }
        }

        data.push(item);
    }

    let restrictedItems=crudUtils.getRestrictedItems(data, accessProfile, 'id')
    data=crudUtils.filterRestrictedColumnData(data, accessProfile, 'id')
        .filter(item => !restrictedItems.includes(item['id']))

    return data;
}

// Calculates the total spent on a set to date (labour, materials, and rentals)
function calculateCosts(item, _show, _week, _showCrew) {
    /* Add cost of crew labor for this set */
    // Initialize labor variable
    let departmentLabor={};
    for (d of _show.departments) { departmentLabor[d]={ week: 0, total: 0, mandays: 0 } }

    // Calculate
    for (user of _showCrew) {
        let record=user.showrecords.find(r => r.showid==_show._id.toString());
        for (recordPosition of record.positions) {
            let position=_week.positions.positionList[recordPosition.code]||{}
            for (day of Object.keys(recordPosition.daysWorked).filter(d => recordPosition.daysWorked[d])) {
                let week=crudUtils.findFirstContainingWeek(day, _show.weeks)
                // Only count day worked if it has the same set code as the item and it falls in a valid week 
                if (recordPosition.daysWorked[day].set==item['Set Code']&&week) {
                    let multipliers=week.multipliers;
                    let hours=recordPosition.daysWorked[day].hours||0
                    let rate=position['Rate']||0
                    let dayOfWeek=new Date(day).toString().slice(0, 3);
                    let tax=0
                    for (taxCol of week.crew.taxColumns) {
                        if (record.weeksWorked[week._id].taxColumnValues[recordPosition.code]) {
                            tax+=parseFloat(record.weeksWorked[week._id].taxColumnValues[recordPosition.code][taxCol])||0
                        }
                    }

                    let cost=crudUtils.calculateDailyLaborCost(multipliers, hours, rate, dayOfWeek)*(tax/100+1);

                    // Add cost to correct department total and week cost 
                    for (k in departmentLabor) {
                        if (position['Department']==k) {
                            departmentLabor[k].total+=cost;
                            if (recordPosition.daysWorked[day].hours>0) {
                                departmentLabor[k].mandays++;
                            }
                            if (crudUtils.isInCurrentWeek(day, user, _week)) {
                                departmentLabor[k].week+=cost;
                            }
                        }
                    }
                }
            }
        }
    }

    /* Add rentals for this set */
    // Initialize rentals variable
    let departmentRentals={};
    for (d of _show.departments) { departmentRentals[d]={ week: 0, total: 0 } }

    // Calculate
    for (week of _show.weeks) {
        for (rental of week.rentals.rentalList) {
            if (rental['Set Code']==item['Set Code']) {
                // Don't count this rental if the supplier is not in the current week's crew list
                if (rental['Supplier']&&!week.crew.crewList.find(c => c['username']==rental['Supplier'])) { continue }

                let department=rental['Department']
                let daysRented=rental['Days Rented']||0
                let rate=rental['Day Rate']
                let tax=0
                for (taxCol of week.rentals.taxColumns) {
                    tax+=rental.taxColumnValues[taxCol]||0
                }

                let cost=(rate*daysRented)*(tax/100+1);

                for (k in departmentRentals) {
                    if (department==k) {
                        departmentRentals[k].total+=cost;
                        if (week._id==_week._id) {
                            departmentRentals[k].week+=cost;
                        }
                    }
                }
            }
        }
    }

    /* Add purchases for this set */
    // Initialize purchases variable
    let departmentPurchases={};
    for (d of _show.departments) { departmentPurchases[d]={ week: 0, total: 0 } }

    // Calculate
    for (p of _show.purchases.purchaseList) {
        if (p['Set Code']==item['Set Code']) {
            let cost=p['Amount'];
            let tax=0;
            for (tCol of _show.purchases.taxColumns) {
                let tVal=p.taxColumnValues[tCol]
                if (tVal) { tax+=tVal }
            }

            cost*=(tax/100+1);

            // Add cost to correct department
            for (key in departmentPurchases) {
                if (p['Department']==key) {
                    departmentPurchases[key].total+=cost;

                    if (crudUtils.findFirstContainingWeek(p.Date, _show.weeks)._id==_week._id) {
                        departmentPurchases[key].week+=cost;
                    }
                }
            }
        }
    }

    return [departmentLabor, departmentPurchases, departmentRentals];
}

// Gets the total funds allocated to a set
function calculateBudget(set, totalFringe, mandayRates, departments) {
    let budget=0

    for (d of departments) {
        budget+=calculateDepartmentBudget(d, mandayRates, set, totalFringe)
    }

    return budget

}

function calculateDepartmentBudget(d, mandayRates, set, totalFringe) {
    let mandayRate=numUtils.zeroNanToNull(parseFloat(mandayRates[d]))||0
    let mandays=numUtils.zeroNanToNull(parseFloat(set.departmentValues[`${d} Man Days`]))||0
    let materials=numUtils.zeroNanToNull(parseFloat(set.departmentValues[`${d} Materials`]))||0
    let rentals=numUtils.zeroNanToNull(parseFloat(set.departmentValues[`${d} Rentals`]))||0

    return mandays*mandayRate*totalFringe+materials+rentals
}

