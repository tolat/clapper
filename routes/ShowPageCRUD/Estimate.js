const { populateShow }=require('../../utils/schemaUtils')
const Show=require('../../models/show')
const Set=require('../../models/set')
const { sortByNumber, zeroNanToNull }=require('../../utils/numberUtils')

// Render Estimate page
module.exports.get=async function (id, section, query, args, res, sharedModals, pageModals, user) {
    let show=await populateShow(id);

    // Case: first estimate version
    if (!Object.keys(show.estimateVersions).length) { args.isFirstEstimate=true }
    // Case: requesting specific estimate version
    else if (query.version) {
        args.version=query.version;
        args.latestVersion=getLatestVersion(show);
        args.weekEnding=show.estimateVersions[query.version].weekEnding;
    }
    //Case: no specified version, default to the cost report's version
    else {
        let version=show.costReport.estimateVersion
        args.latestVersion=getLatestVersion(show)
        version? args.version=version:args.version=args.latestVersion
        args.weekEnding=show.estimateVersions[args.version].weekEnding;
    }

    // Initialize data for grid based on user access profile
    let accessProfile=show.weeks.find(w => w._id.toString()==show.currentWeek).accessProfiles.find(ap => ap[section].users.includes(user.username))[section]
    let init=await initializeData(show.sets, show, args, args.version, accessProfile)

    res.render('ShowPage/Template', {
        title: `${show['Name']} - ${section}`,
        show,
        section,
        args,
        sharedModals,
        pageModals,
        gridData: init.data,
        restrictedItems: init.restrictedItems,
        columnFilter: accessProfile.columnFilter
    })
}

// Delete Estimate Version
module.exports.delete=async function (body, showId) {
    let v=body.version;
    let show=await Show.findById(showId).populate('sets');

    delete show.estimateVersions[v];
    show.markModified(`estimateVersions`);
    await show.save();

    for (set of show.sets) {
        let s=await Set.findById(set._id);
        delete s.estimates[v];
        delete s.estimateTotals[v];
        s.markModified(`estimates`);
        s.markModified(`estimateTotals`);
        await s.save();
    }

    return { latestVersion: getLatestVersion(show) }
}

// Save Estimate Version
module.exports.update=async function (body, showId, user) {
    let items=body.data;
    let ov=body.originalVersion;
    let v=body.version;
    let isNewVersion=body.isNewVersion;
    let isBlankVersion=body.isBlankVersion;
    let show=await Show.findById(showId).populate('sets');
    let accessProfile=show.weeks.find(w => w._id.toString()==show.currentWeek).accessProfiles
        .find(ap => ap['Estimate'].users.includes(user.username))['Estimate']

    // First blank estimate case *** INITIALIZE REST OF SHOW OBJECTS ***
    if (!ov) {
        show.estimateVersions[v]={
            extraColumns: [],
            displaySettings: {},
            mandayRates: {},
            fringes: {},
            dateCreated: new Date(Date.now())
        }
        show.costReport={
            displaySettings: {},
            extraColumns: [],
            estimateVersion: v,
            setNumberMap: {},
            setExtraColumnMap: {},
        }
        show.markModified('costReport.estimateVersion');
        show.markModified(`estimateVersions`);
        await show.save();

        // Initialize first estimate for each set if ther are already sets (delete only estimate case)
        for (set of show.sets) {
            set.estimates={};
            set.estimates[v]={
                departmentValues: {},
                extraColumnValues: {}
            };
            set.estimateTotals={}
            set.estimateTotals[v]=0;
            set.markModified('estimates');
            set.markModified('estimateTotals');
            await set.save();
        }
        return { latestVersion: getLatestVersion(show) };
    }

    // Set the week ending for this estimate and save show
    show.estimateVersions[ov].weekEnding=body.weekEnding;
    show.markModified(`estimateVersions.${ov}.weekEnding`);

    // Update estimate version display settings (column order, grouping, collapsed groups, etc)
    show.estimateVersions[ov].displaySettings=body.displaySettings
    show.markModified(`estimateVersions.${ov}.displaySettings`);

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

    // Update the show's estimate version record
    if (v!=ov) {
        show=await Show.findById(showId).populate('sets');
        show.estimateVersions[v]=show.estimateVersions[ov];
        if (isBlankVersion) { show.estimateVersions[ov].displaySettings={} }
        if (!isNewVersion) { delete show.estimateVersions[ov] }
        else { show.estimateVersions[v].dateCreated=new Date(Date.now()) }
        show.markModified(`estimateVersions`);
    }

    // Set new cost report version based on estimate page version
    show.costReport.estimateVersion=v

    // Save show
    await show.save();

    // Save Set Data
    for (item of items) {
        if (item&&item['Set Code']) {
            let set=show.sets.find(s => s['Set Code']==item['Set Code'])

            // Create new set if item doesn't correspond to an existing set
            if (!set) {
                set=await new Set();
                set.show=show;
                set.estimates={};
                set.estimateTotals={};
                for (ver of Object.keys(show.estimateVersions)) {
                    set.estimates[ver]={
                        departmentValues: {},
                        extraColumnValues: {}
                    }
                    set.estimateTotals[ver]={ total: 0, departmentTotals: {} }
                    for (d of show.departments) { set.estimateTotals[ver].departmentTotals[d]=0 }
                }
                set.markModified('estimates');
                set.markModified('estimateTotals');
                await set.save();
                await show.sets.push(set);
                await show.save();
            }

            // Update unrestricted core display keys
            for (key of set.displayKeys) {
                if (!accessProfile.columnFilter.includes(key)) {
                    set[key]=item[key];
                }
            }

            // Update unrestricted Estimate specific keys
            for (key of getDepartmentKeys(show)) {
                if (!accessProfile.columnFilter.includes(key)) {
                    let value=item[key];
                    if (isNaN(value)||value==0) { value=0 }
                    set.estimates[ov].departmentValues[key]=value;
                }
            }

            // Update extra column keys, deleting values for columns that don't exist anymore
            let previousValues=JSON.parse(JSON.stringify(set.estimates[ov].extraColumnValues))
            set.estimates[ov].extraColumnValues={}
            for (key of body.extraColumns) {
                // Set extra column value for this key if it isn't restricted. if it is, then set it to the previous values
                if (!accessProfile.columnFilter.includes(key)) {
                    set.estimates[ov].extraColumnValues[key]=item[key];
                } else {
                    set.estimates[ov].extraColumnValues[key]=previousValues[key];
                }
            }

            // Update estimate totals
            // Only set this if there are no restricted columns
            if (!accessProfile.columnFilter[0]) {
                set.estimateTotals[ov]={
                    total: item['Current']||0,
                    departmentTotals: item.departmentTotals||{}
                }
            }


            // Set all undefined department totals to 0
            if (!accessProfile.columnFilter[0]) {
                for (dep of show.departments) {
                    if (!set.estimateTotals[ov].departmentTotals[dep]) {
                        set.estimateTotals[ov].departmentTotals[dep]=0
                    }
                }
            }

            // Update estimate version and totals if this is a new version or a rename
            if (ov!=v) {
                set.estimates[v]=set.estimates[ov];
                set.estimateTotals[v]=set.estimateTotals[ov];
                // Set totals to 0 and estimate to blank if creating a blank version
                if (isBlankVersion) {
                    set.estimateTotals[v]={ total: 0, departmentTotals: {} }
                    for (d of show.departments) { set.estimateTotals[v].departmentTotals[d]=0 }
                    set.estimates[v]={
                        departmentValues: {},
                        extraColumnValues: {}
                    }
                    // Update Estimate specific keys
                    for (key of getDepartmentKeys(show)) {
                        set.estimates[v].departmentValues[key]=0;
                    }
                }
                // Delete old version and totals if this is a rename
                if (!isNewVersion) {
                    delete set.estimates[ov];
                    delete set.estimateTotals[ov];
                }
            }

            set.markModified(`estimates.${v}`);
            set.markModified(`estimates.${v}.extraColumnValues`);
            set.markModified(`estimateTotals.${v}`);
            set.markModified(`estimates.${ov}`);
            set.markModified(`estimates.${ov}.extraColumnValues`);
            set.markModified(`estimateTotals.${ov}`);
            await set.save();
        }
    }

    show=await Show.findById(show._id).populate('sets')

    // Delete sets that are no longer present in grid and are not restricted by an access profile
    for (set of show.sets) {
        if (!items.find(item => item['Set Code']==set['Set Code'])&&!body.restrictedItems.includes(set['Set Code'])) {
            await Set.findByIdAndDelete(set._id)
        }
    }

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
                '#': sets[i]['#'],
                setid: sets[i]._id,
                // Core features
                'Set Code': sets[i]['Set Code'],
                'Episode': sets[i]['Episode'],
                'Name': sets[i]['Name'],
                departmentTotals: {}
            }

            // Version specific features
            if (sets[i].estimates[_args.version]&&sets[i].estimates[_args.version].departmentValues) {
                // Add Department specific features
                for (key of Object.keys(sets[i].estimates[_args.version].departmentValues)) {
                    item[key]=zeroNanToNull(parseFloat(sets[i].estimates[_args.version].departmentValues[key]).toFixed(2));
                }
                // Calculate department-specific labor
                for (d of _show.departments) {
                    item[`${d} Labor`]=zeroNanToNull(parseFloat(item[`${d} Man Days`]*_show.estimateVersions[_version].mandayRates[d]).toFixed(2));
                }
                // Add Extra Column Values
                for (key of _show.estimateVersions[_args.version].extraColumns) {
                    item[key]=sets[i].estimates[_args.version].extraColumnValues[key]
                }
            }
            data.push(item);
        }
    }

    // Sort data by #
    data=sortByNumber(data, _args);

    let restrictedItems=[]
    // Apply access profile to data removing restricted items and values from restricted columns
    // Mark all restricted items as restricted by adding them to restrictedItems. Then delete after this for loop using data.filter
    for (item of data) {
        for (column in accessProfile.dataFilter) {
            if (item[column]==accessProfile.dataFilter[column]) {
                restrictedItems.push(item['Set Code'])
            }
        }

        for (column of accessProfile.columnFilter) {
            if (item[column]) {
                item[column]=undefined
            }
        }
    }

    for (column in accessProfile.dataFilter) {
        data=data.filter(item => item[column]!=accessProfile.dataFilter[column])
    }

    return { data, restrictedItems };
}

