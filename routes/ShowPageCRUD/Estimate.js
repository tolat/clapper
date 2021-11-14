const { populateShow }=require('../../utils/schemaUtils')
const Show=require('../../models/show')
const { sortByNumber, zeroNanToNull }=require('../../utils/numberUtils')
const crudUtils=require('./utils')

// Render Estimate page
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals, user) {
    let show=await populateShow(id);

    // Initialize data for grid based on user access profile
    let apName=await crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile][section]

    // Create a list of estimateVersion keys sorted by date
    let sortedVersionKeys=Object.keys(show.estimateVersions)
        .map(k => { show.estimateVersions[k].key=k; return show.estimateVersions[k] })
        .sort((a, b) => a.dateCreated>b.dateCreated? -1:1)
        .map(ev => ev.key)

    // Case: first estimate version
    if (!Object.keys(show.estimateVersions).length) { args.isFirstEstimate=true }
    // Case: requesting specific estimate version
    else if (query.version) {
        args.version=query.version;
        args.weekEnding=show.estimateVersions[query.version].weekEnding;
    }
    //Case: no specified version, default to the cost report's version
    else {
        let version=show.accessMap[apName].estimateVersion
        version? args.version=version:args.version=sortedVersionKeys[0]
        args.weekEnding=show.estimateVersions[args.version].weekEnding;
    }

    // Initialize data for the grid, applying the access profile
    let data=[]
    if (args.version) {
        data=await initializeData(show.estimateVersions[`${args.version}`].sets, show, args, args.version, accessProfile)
    }

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
        apName,
        sortedVersionKeys
    })
}

// Delete Estimate Version
module.exports.delete=async function (body, showId) {
    let v=body.version;
    let show=await Show.findById(showId)

    delete show.estimateVersions[v];
    show.markModified(`estimateVersions`);
    await show.save();

    return { latestVersion: getLatestVersion(show) }
}

// Save Estimate Version
module.exports.update=async function (body, showId, user) {
    let items=body.data;
    let ov=body.originalVersion;
    let v=body.version;
    let isNewVersion=body.isNewVersion;
    let isBlankVersion=body.isBlankVersion;
    let show=await Show.findById(showId)

    // Get access profile
    let apName=await crudUtils.getAccessProfileName(user)
    let accessProfile=show.accessProfiles[show.accessMap[apName].profile].Estimate

    // First blank estimate case 
    if (!ov) {
        show.estimateVersions[v]={
            extraColumns: [],
            displaySettings: {},
            mandayRates: {},
            fringes: {},
            dateCreated: new Date(Date.now()),
            sets: []
        }

        show.accessMap[apName].estimateVersion=`${v}`
        show.markModified('accessMap')
        show.markModified('estimateVersions');
        await show.save();
        return { latestVersion: getLatestVersion(show) };
    }

    // Update estimate version display settings for this access profile (column order, grouping, collapsed groups, etc)
    accessProfile.displaySettings[apName][ov]=body.displaySettings
    show.markModified(`accessProfiles`);

    // Update Extra columns
    show.estimateVersions[ov].extraColumns=body.extraColumns;
    show.markModified(`estimateVersions.${ov}.extraColumns`);

    // Update Manday rates
    show.estimateVersions[ov].mandayRates=body.mandayRates;
    show.markModified(`estimateVersions.${ov}.mandayRates`);

    // Update fringes
    show.estimateVersions[ov].fringes=body.fringes;
    show.markModified(`estimateVersions.${ov}.fringes`);

    // Update departments
    show.departments=body.departments;

    // Update department colors
    show.departmentColorMap=body.departmentColorMap;

    // Set this user's active version
    show.accessMap[apName].estimateVersion=`${v}`
    show.markModified('accessMap')

    // Save show
    await show.save();

    // Save Set Data
    let sets=show.estimateVersions[ov].sets
    let updatedList=[]
    const RFSkeys=['Set Code']
    for (item of items) {
        if (crudUtils.isValidItem(item, RFSkeys, accessProfile)&&!crudUtils.isRestrictedItem(item, accessProfile)) {
            let set=sets.find(s => s['Set Code']==item['Set Code'])

            // Create new set if item doesn't correspond to an existing set
            if (!set) {
                set={
                    departmentValues: {},
                    extraColumnValues: {}
                }
                sets.push(set);
                await show.save();
            }

            // Update unrestricted core display keys
            for (key of ['Set Code', 'Episode', 'Name']) {
                if (!accessProfile.columnFilter.includes(key)) {
                    set[key]=item[key];
                }
            }

            // Update unrestricted Estimate specific keys
            for (key of getDepartmentKeys(show)) {
                if (!accessProfile.columnFilter.includes(key)) {
                    let value=item[key];
                    if (isNaN(value)||value==0) { value=0 }
                    set.departmentValues[key]=value;
                }
            }

            // Update extra column keys, deleting values for columns that don't exist anymore
            let previousValues=set.extraColumnValues
            set.extraColumnValues={}
            for (key of body.extraColumns) {
                // Set extra column value for this key if it isn't restricted. if it is, then set it to the previous values
                !accessProfile.columnFilter.includes(key)? set.extraColumnValues[key]=item[key]:
                    set.extraColumnValues[key]=previousValues[key];
            }

            // Add set to updated list
            updatedList.push(set)
        }
    }

    // Add old values for restricted items to the updated List
    let restrictedItems=await crudUtils.getRestrictedItems(show.estimateVersions[ov].sets, accessProfile, 'Set Code')
    for (item of restrictedItems) {
        updatedList.push(item)
    }

    show.estimateVersions[ov].sets=updatedList

    // Handle new version or version rename
    if (v!=ov) {
        show.estimateVersions[v]=JSON.parse(JSON.stringify(show.estimateVersions[ov]))
        if (isBlankVersion) {
            accessProfile.displaySettings[apName][`${v}`]={}
            for (set of show.estimateVersions[v].sets) {
                for (key in set.departmentValues) {
                    set.departmentValues[key]=null
                }
                set.extraColumnValues={}
            }
            show.estimateVersions[v].extraColumns=[]
        }
        if (!isNewVersion) { delete show.estimateVersions[ov] }
        else { show.estimateVersions[v].dateCreated=new Date(Date.now()) }
    }

    await show.markModified('estimateVersions')
    await show.save()

    // Get the most recent version (largest numbered version) and return it
    return { latestVersion: getLatestVersion(show) };
}

// Return the latest estimate verison
function getLatestVersion(show) {
    return Object.keys(show.estimateVersions).sort((a, b) => { return (parseFloat(b.replace('_', '.'))-parseFloat(a.replace('_', '.'))) })[0];
}

// Returns an array of keys that correspond to the grid's department value fields
function getDepartmentKeys(show) {
    let keys=[];
    for (d of show.departments) {
        keys.push(`${d} Man Days`);
        keys.push(`${d} Materials`);
        keys.push(`${d} Rentals`);
    }
    return keys;
}

// Creates grid data 
function initializeData(sets, _show, _args, _version, accessProfile) {
    let data=[];

    if (sets[0]) {
        for (let i=0; i<sets.length; i++) {
            let item={
                id: 'id_'+i,
                // Core features
                'Set Code': sets[i]['Set Code'],
                'Episode': sets[i]['Episode'],
                'Name': sets[i]['Name'],
            }

            // Version specific features
            // Add Department specific features
            for (key in sets[i].departmentValues) {
                item[key]=zeroNanToNull(parseFloat(sets[i].departmentValues[key]).toFixed(2));
            }
            // Calculate department-specific labor
            for (d of _show.departments) {
                item[`${d} Labor`]=zeroNanToNull(parseFloat(item[`${d} Man Days`]*_show.estimateVersions[_version].mandayRates[d]).toFixed(2));
            }
            // Add Extra Column Values
            for (key in sets[i].extraColumnValues) {
                item[key]=sets[i].extraColumnValues[key]
            }
            data.push(item);
        }
    }

    // Apply access profile to data removing restricted items and values from restricted columns
    for (item of data) {
        for (column of accessProfile.columnFilter) {
            if (item[column]) {
                item[column]=undefined
            }
        }
    }
    let restrictedItems=crudUtils.getRestrictedItems(data, accessProfile, 'Set Code')
    data=data.filter(item => !restrictedItems.includes(item['Set Code']))

    return data;
}

