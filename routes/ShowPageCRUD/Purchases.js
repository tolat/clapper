const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const crudUtils=require('./utils')
const numberUtils=require('../../utils/numberUtils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals, user) {
    show=await Show.findById(id)

    // Get accessProfile
    let apName=crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile][section]

    // Generate grid data
    let week=show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)
    let data=initializeData(show.purchases.purchaseList, show, args, week, accessProfile)

    // Generate array of all set codes in current estimate version
    let allSetCodes=show.estimateVersions[show.costReport.estimateVersion].sets.map(s => s['Set Code'])

    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show,
        section,
        args,
        sharedModals,
        pageModals,
        data,
        accessProfile,
        user,
        allSetCodes,
        apName
    })
}

// Update purchases
module.exports.update=async function (body, showId, user) {
    let show=await Show.findById(showId).populate('weeks.crew.crewList')

    // Get access profile
    let apName=crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile].Purchases

    // Get week 
    let week=show.weeks.find(w => w._id.toString()==show.accessMap[apName].currentWeek)

    // Save display settings to access profile
    accessProfile.displaySettings[apName][week._id.toString()]=body.displaySettings;
    show.markModified('accessProfiles');

    // Save extra Columns 
    show.purchases.extraColumns=body.extraColumns
    show.markModified('purchases.extraColumns')

    // Save tax Columns 
    show.purchases.taxColumns=body.taxColumns
    show.markModified('purchases.taxColumns')

    // Update Purchases
    let updatedList=[]
    for (item of body.data) {
        const RFSkeys=['Set Code', 'Department', 'PO Num', 'Date']
        if (crudUtils.isValidItem(item, RFSkeys, accessProfile)&&!crudUtils.isRestrictedItem(item, accessProfile)) {
            // Find existing purchase 
            let p=await show.purchases.purchaseList.find(purch => purch['PO Num']==item['PO Num'])

            // Create new purchase if non exists
            if (!p) {
                p={
                    extraColumnValues: {},
                    taxColumnValues: {},
                }
                show.purchases.purchaseList.push(p)
            }

            // Save display key data
            let displayKeys=['Set Code', 'Department', 'Date', 'PO Num', 'Invoice Num', 'Supplier', 'Amount', 'Description']
            for (key of displayKeys) {
                if (!accessProfile.columnFilter.includes(key))
                    p[key]=item[key];
            }

            // Save extra column values
            let previousValues=p.extraColumnValues
            p.extraColumnValues={};
            for (key of body.extraColumns) {
                !accessProfile.columnFilter.includes(key)? p.extraColumnValues[key]=item[key]:
                    p.extraColumnValues[key]=previousValues[key]
            }

            // Save tax column values
            previousValues=p.extraColumnValues
            p.taxColumnValues={}
            for (key of show.purchases.taxColumns) {
                !accessProfile.columnFilter.includes(key)? p.taxColumnValues[key]=item[key]:
                    p.taxColumnValues[key]=previousValues[key]
            }

            // Add position to updated List
            updatedList.push(p)
        }
    }

    // Add old values for restricted items to the updated List
    let restrictedItems=await crudUtils.getRestrictedItems(show.purchases.purchaseList, accessProfile, 'PO Num')
    for (item of restrictedItems) {
        updatedList.push(item)
    }

    show.purchases.purchaseList=updatedList
    show.markModified('purchases')
    await show.save()

    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, genUniqueId(), apName)
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return {}
}

// Creates grid data 
function initializeData(purchases, _show, _args, week, accessProfile) {
    let _taxColumns=_show.purchases.taxColumns
    let data=[];

    // Load purchases into items for the grid
    for (let i=0; i<purchases.length; i++) {
        let item={
            id: 'id_'+i,
            'Department': purchases[i]['Department'],
            'PO Num': purchases[i]['PO Num'],
            'Invoice Num': purchases[i]['Invoice Num'],
            'Supplier': purchases[i]['Supplier'],
            'Description': purchases[i]['Description'],
            'Amount': parseFloat((numberUtils.zeroNanToNull(purchases[i]['Amount'])||0)).toFixed(2),
        }

        // Add tax column values
        for (taxCol of _taxColumns) {
            item[taxCol]=numberUtils.zeroNanToNull(parseFloat(purchases[i].taxColumnValues[taxCol]))
        }

        // Set data item week to be the first week containing the purchase date
        let week=crudUtils.findFirstContainingWeek(purchases[i].Date, _show.weeks)
        week? item['Week']=_show.weeks.map(w => w._id).indexOf(week._id)+1:item['Week']=undefined

        // Initialize the purchase total (Tax + Amount)
        item=updatePurchaseTotal(item, _taxColumns);

        // Load set data into purchase
        let set=_show.estimateVersions[_show.costReport.estimateVersion].sets.find(s => s['Set Code']==purchases[i]['Set Code'])
        if (set) {
            item['Set Code']=set['Set Code'];
            item['Episode']=set['Episode'];
        } else {
            item['Set Code']='DELETED'
        }

        // Add date value or none if there is no date
        !purchases[i]['Date']? item['Date']='':
            item['Date']=(new Date(purchases[i]['Date'])).toLocaleDateString('en-US');

        // Add extra column values
        for (col of _show.purchases.extraColumns) {
            item[col]=purchases[i].extraColumnValues[col];
        }

        data.push(item);
    }

    // Apply access profile to data removing restricted items and values from restricted columns
    for (item of data) {
        for (column of accessProfile.columnFilter) {
            if (item[column]) {
                item[column]=undefined
            }
        }
    }
    let restrictedItems=crudUtils.getRestrictedItems(data, accessProfile, 'PO Num')
    data=data.filter(item => !restrictedItems.includes(item['PO Num']))

    return data;
}

// Update the total for this purchase
function updatePurchaseTotal(item, _taxColumns) {
    let tax=0
    for (taxCol of _taxColumns) {
        tax+=item[taxCol]||0
    }

    item['Total']=numberUtils.zeroNanToNull((parseFloat(item['Amount'])*(tax/100+1)).toFixed(2))||0;
    return item;
}
