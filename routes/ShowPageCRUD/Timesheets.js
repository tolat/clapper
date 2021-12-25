const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const crudUtils=require('./utils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals) {
    let show=await populateShow(id);

    // Create a list of estimateVersion keys sorted by date
    let sortedVersionKeys=Object.keys(show.estimateVersions)
        .map(k => { show.estimateVersions[k].key=k; return show.estimateVersions[k] })
        .sort((a, b) => a.dateCreated>b.dateCreated? -1:1)
        .map(ev => ev.key)

    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show: show,
        section: section,
        args: args,
        sharedModals: sharedModals,
        pageModals: pageModals,
        sortedVersionKeys
    })
}

// Update Timesheets
module.exports.update=async function (body, showId) {
    let messages=[]
    let show=await populateShow(showId)
    let currentMap=await show.timesheets.timesheetMaps.find(m => m.name==show.timesheets.currentMap)

    if (show.timesheets.currentMap) {
        // Parse value map from grid and save new map values
        currentMap.cellValueMap=await crudUtils.parseValueMap(body.data)
        show.markModified('timesheets.timesheetMaps')

        // Save display settings to show
        currentMap.displaySettings=body.displaySettings;
        show.markModified('timesheets.timesheetMaps');
    }

    await show.save()

    // Create new map, either copying current map or blank new map
    if (body.newMapName) {
        if (body.isNewMap) {
            let newMap={}
            if (body.copyCurrentMap) {
                newMap=JSON.parse(JSON.stringify(currentMap))
                newMap.name=body.newMapName
            } else {
                newMap={
                    cellValueMap: {},
                    displaySettings: {},
                    extraColumns: [],
                    name: body.newMapName
                }
            }
            show.timesheets.timesheetMaps.push(newMap)
        } else {
            currentMap.name=body.newMapName
        }
        show.timesheets.currentMap=body.newMapName
        show.markModified('timesheets.timesheetMaps')
        await show.save()
    }

    // Delete map with name newMapName
    if (body.deleteMap) {
        const map=await show.timesheets.timesheetMaps.find(m => m.name==body.deleteMap)
        show.timesheets.timesheetMaps.splice(show.timesheets.timesheetMaps.indexOf(map), 1)
        if (show.timesheets.currentMap==body.deleteMap) {
            if (show.timesheets.timesheetMaps[0]) {
                show.timesheets.currentMap=show.timesheets.timesheetMaps[0].name
            } else {
                show.timesheets.currentMap=null
            }
        }
        show.markModified('timesheets.timesheetMaps')
        await show.save()
    }

    // Set current map as newMapName if opening a new map
    if (body.openMap) {
        show.timesheets.currentMap=body.openMap
        show.markModified('timesheets')
        await show.save()
    }

    // Create new week if required
    if (body.newWeek) {
        await crudUtils.createWeek(body, show, genUniqueId())
    }

    // Delete all records for deleted week if required
    if (body.deletedWeek) {
        await crudUtils.deleteWeek(body.deletedWeek, show, body.weeks)
    }

    return { messages: messages }
}




