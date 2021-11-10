const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const Purchase=require('../../models/purchase')
const crudUtils=require('./utils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals) {
    show=await Show.findById(id)
        .populate('sets')
        .populate('purchases')
        .populate({
            path: 'purchases.purchaseList',
            populate: { path: 'set' }
        });

    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show: show,
        section: section,
        args: args,
        sharedModals: sharedModals,
        pageModals: pageModals
    })
}

// Update purchases
module.exports.update=async function (body, showId) {
    let show=await Show.findById(showId)
        .populate('weeks.crew.crewList')
        .populate('purchases.purchaseList')

    // Save display settings
    show.purchases.displaySettings=body.displaySettings
    show.markModified('purchases.displaySettings')

    // Save extra Columns 
    show.purchases.extraColumns=body.extraColumns
    show.markModified('purchases.extraColumns')

    // Save tax Columns 
    show.purchases.taxColumns=body.taxColumns
    show.markModified('purchases.taxColumns')

    await show.save()

    // Update Purchases
    let deleteList=[...show.purchases.purchaseList]
    show.purchases.purchaseList=[]
    for (item of body.data) {
        if (item&&item['Set Code']&&item['Department']&&item['PO Num']&&item['Date']) {
            // Find existing purchase 
            let p=await Purchase.findOne({ 'PO Num': item['PO Num'], showId: show._id.toString() })
            if (!p) {
                let set=await Set.findOne({ 'Set Code': item['Set Code'], show: show })
                p=await new Purchase({
                    extraColumnValues: {},
                    taxColumnValues: {},
                    set: set,
                    weekId: body.weeks[0]._id.toString(),
                    showId: show._id.toString()
                })
                await p.save()
            }
            await show.purchases.purchaseList.push(p)
            show.markModified('purchases.purchaseList')
            await show.save()

            // If deleteList contains 
            let purch=deleteList.find(purch => purch['PO Num']==p['PO Num'])
            if (purch) {
                let idx=deleteList.indexOf(purch)
                deleteList.splice(idx, 1)
            }

            // Save display key data
            for (key of p.displayKeys) {
                p[key]=item[key];
            }

            // Save extra column values
            p.extraColumnValues={};
            for (col of body.extraColumns) {
                p.extraColumnValues[col]=item[col]
            }
            p.markModified('extraColumnValues')

            // Save tax column values
            p.taxColumnValues={}
            for (taxCol of show.purchases.taxColumns) {
                p.taxColumnValues[taxCol]=item[taxCol]
            }
            p.markModified('taxColumnValues')

            await p.save();
        }
    }

    // delete purchases on purchase list that weren't in grid
    for (p of deleteList) {
        await Purcahse.findByIdAndDelete(p._id)
    }

    show.markModified('purchases.purchaseList')
    await show.save()

    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, genUniqueId())
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return {}
}