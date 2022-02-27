const mongoose=require('mongoose');
const Schema=mongoose.Schema;
const User=require('./user')

const ShowSchema=new Schema({
    'Name': String,
    'Production Company': String,
    owner: String,
    weeks: [{
        _id: String,
        end: Date,
        multipliers: Object,
        crew: {
            extraColumns: Object,
            taxColumns: [String],
            crewList: [{ type: Schema.Types.ObjectId, ref: 'User' }]
        },
        rentals: {
            displaySettings: Object,
            extraColumns: Object,
            taxColumns: [String],
            rentalList: [Object],
        },
        positions: {
            extraColumns: Object,
            positionList: Object
        },
    }],
    purchases: {
        extraColumns: Object,
        taxColumns: [],
        purchaseList: [Object]
    },
    estimateVersions: Object,
    departments: [String],
    departmentColorMap: Object,
    costReport: {
        displaySettings: Object,
        extraColumns: Object,
        estimateVersion: String,
        setNumberMap: Object,
        setExtraColumnMap: Object,
        budget: String,
        toDate: String,
        remaining: String,
    },
    timesheets: {
        timesheetMaps: [{
            name: String,
            cellValueMap: Object,
            displaySettings: Object,
        }],
        currentMap: String
    },
    accessMap: Object,
    accessProfiles: Object
}, { minimize: false })

ShowSchema.virtual('displayKeys').get(function () {
    return ['Name', 'Production Company'];
});

ShowSchema.virtual('getCurrentWeekEnding').get(function () {
    const oneDay=24*60*60*1000;
    const firstDate=new Date(Date.now());
    const secondDate=new Date(this.firstweekending);
    const msSinceFirstWeekEnd=Math.ceil((Math.round(Math.abs((firstDate-secondDate)/oneDay)))/7)*7*oneDay;
    return new Date(Date.parse(secondDate)+msSinceFirstWeekEnd);
});

ShowSchema.virtual('getAllCrewMembers').get(async function () {
    let allCrew={}
    for (week of this.weeks) {
        for (user of week.crew.crewList) {
            if (!user.showrecords) {
                user=await User.findById(user.toString())
            }

            if (await user.showrecords.find(r => r.showid==this._id.toString())) {
                if (!allCrew[user._id]) {
                    allCrew[user._id]=true
                }
            }
        }
    }
    return allCrew
});


module.exports=mongoose.model('Show', ShowSchema);

