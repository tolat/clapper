const { populateShow }=require('../../utils/schemaUtils')
const { genUniqueId }=require('../../utils/numberUtils')
const Show=require('../../models/show')
const User=require('../../models/user')
const crudUtils=require('./utils')

// Render ShowPage section
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals) {
    let show=await populateShow(id);

    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show: show,
        section: section,
        args: args,
        sharedModals: sharedModals,
        pageModals: pageModals
    })
}

// Update Timesheets
module.exports.update=async function (body, showId) {
    let messages=[]
    let show=await populateShow(showId)
    let currentMap=await show.timesheets.timesheetMaps.find(m => m.name==show.timesheets.currentMap)

    if (show.timesheets.currentMap) {
        // Parse value map from grid and save new map values
        currentMap.cellValueMap=await parseValueMap(body.data)
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

// Parse cell-value map for timesheet generation from slickgrid data
function parseValueMap(items) {
    let cellValueMap={}
    let sheetCols='a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.aa.ab.ac.ad.ae.af.ag.ah.ai.aj.ak.al.am.an.ao.ap.aq.ar.as.at.au.av.aw.ax.ay.az.ba.bb.bc.bd.be.bf.bg.bh.bi.bj.bk.bl.bm.bn.bo.bp.bq.br.bs.bt.bu.bv.bw.bx.by.bz'.split('.').map(x => { return x.toUpperCase() })

    // ADD EXTRA COLUMN VALUES HERE

    for (item of items) {
        for (col of sheetCols) {
            if (item[col]) {
                if (!cellValueMap[col]) { cellValueMap[col]={} }
                cellValueMap[col][item.id]=item[col]
            }
        }
    }

    return cellValueMap
}





