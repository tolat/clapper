const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const crudUtils=require('./utils')
const numberUtils=require('../../utils/numberUtils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals, user, dataOnly) {
    show=await Show.findById(id)

    // Get accessProfile
    let apName=crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile][section]

    args.version=show.accessMap[apName].estimateVersion

    // Generate grid data
    let week=show.weeks.find(w => w._id==show.accessMap[apName].currentWeek)
    let data=initializeData(show.purchases.purchaseList, show, args, week, accessProfile, args.version)

    // Generate array of all set codes in current estimate version
    let allSetCodes=show.estimateVersions[args.version].sets.map(s => s['Set Code'])

    // Create a list of estimateVersion keys sorted by date
    let sortedVersionKeys=Object.keys(show.estimateVersions)
        .map(k => { show.estimateVersions[k].key=k; return show.estimateVersions[k] })
        .sort((a, b) => a.dateCreated>b.dateCreated? -1:1)
        .map(ev => ev.key)

    args.extraColumns=show.purchases.extraColumns
    args.taxColumns=show.purchases.taxColumns

    // Just send back data if this is a data only request
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
            accessProfile,
            user,
            allSetCodes,
            apName,
            sortedVersionKeys
        })
    }
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
        const RFSkeys=['Set Code', 'Department', 'Date']
        if (crudUtils.isValidItem(item, RFSkeys, accessProfile)&&!crudUtils.isRestrictedItem(item, accessProfile)) {
            // Find existing purchase 
            let p=await show.purchases.purchaseList.find(purch => purch._id==item._id)

            // Create new purchase if none exists
            if (!p) {
                // Ensure unique purchase id
                let uniqueId=numberUtils.genUniqueId()
                while (show.purchases.purchaseList.find(purch => purch._id==uniqueId)) {
                    uniqueId=numberUtils.genUniqueId()
                }

                p={
                    _id: uniqueId,
                    extraColumnValues: {},
                    taxColumnValues: {},
                }
                show.purchases.purchaseList.push(p)
            }

            // Save display key data
            let displayKeys=['Set Code', 'Department', 'Date', 'PO Num', 'Invoice Num', 'Supplier', 'Amount', 'Description', '#']
            for (key of displayKeys) {
                if (!crudUtils.isRestrictedColumn(key, accessProfile))
                    p[key]=item[key];
            }

            // Save extra column values
            let previousValues=p.extraColumnValues
            p.extraColumnValues={};
            for (key in body.extraColumns) {
                !crudUtils.isRestrictedColumn(key, accessProfile)? p.extraColumnValues[key]=item[key]:
                    p.extraColumnValues[key]=previousValues[key]
            }

            // Save tax column values
            previousValues=p.extraColumnValues
            p.taxColumnValues={}
            for (key of show.purchases.taxColumns) {
                !crudUtils.isRestrictedColumn(key, accessProfile)? p.taxColumnValues[key]=item[key]:
                    p.taxColumnValues[key]=previousValues[key]
            }

            // Add position to updated List
            updatedList.push(p)
        }
    }

    // Add old values for restricted items to the updated List
    let restrictedItems=await crudUtils.getRestrictedItems(show.purchases.purchaseList, accessProfile, '_id')
    for (item of restrictedItems) {
        updatedList.push(show.purchases.purchaseList.find(p => p['_id']==item))
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
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks, apName)
    }

    return {}
}

// Creates grid data 
function initializeData(purchases, _show, _args, week, accessProfile, version) {
    let _taxColumns=_show.purchases.taxColumns
    let data=[];

    // Load purchases into items for the grid
    for (let i=0; i<purchases.length; i++) {
        let item={
            id: 'id_'+i,
            _id: purchases[i]._id,
            'Department': purchases[i]['Department'],
            'PO Num': purchases[i]['PO Num'],
            'Invoice Num': purchases[i]['Invoice Num'],
            'Supplier': purchases[i]['Supplier'],
            'Description': purchases[i]['Description'],
            '#': purchases[i]['#'],
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
        let set=_show.estimateVersions[version].sets.find(s => s['Set Code']==purchases[i]['Set Code'])
        if (set) {
            item['Set Code']=set['Set Code'];
            item['Episode']=set['Episode'];
        } else {
            item['Set Code']='NOT FOUND'
        }

        // Add date value or none if there is no date
        !purchases[i]['Date']? item['Date']='':
            item['Date']=(new Date(purchases[i]['Date'])).toLocaleDateString('en-US');

        // Add extra column values
        for (col in _show.purchases.extraColumns) {
            item[col]=purchases[i].extraColumnValues[col];
        }

        data.push(item);
    }


    let restrictedItems=crudUtils.getRestrictedItems(data, accessProfile, '_id')
    data=crudUtils.filterRestrictedColumnData(data, accessProfile, '_id')
        .filter(item => !restrictedItems.includes(item['_id']))

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
