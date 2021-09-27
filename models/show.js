const mongoose=require('mongoose');
const Schema=mongoose.Schema;
const User=require('./user')

const ShowSchema=new Schema({
    'Name': String,
    'Production Company': String,
    owner: String,
    weeks: [{
        _id: String,
        number: Number,
        end: Date,
        multipliers: Object,
        crew: {
            displaySettings: Object,
            extraColumns: [String],
            taxColumns: [String],
            crewList: [{ type: Schema.Types.ObjectId, ref: 'User' }]
        },
        rentals: {
            displaySettings: Object,
            extraColumns: [String],
            taxColumns: [String],
            rentalList: [Object],
        },
    }],
    purchases: {
        displaySettings: Object,
        extraColumns: [String],
        taxColumns: [],
        purchaseList: [{ type: Schema.Types.ObjectId, ref: 'Purchase' }]
    },
    currentWeek: String,
    estimateVersions: Object,
    sets: [{ type: Schema.Types.ObjectId, ref: 'Set' }],
    departments: [String],
    departmentColorMap: Object,
    positions: {
        displaySettings: Object,
        extraColumns: [String],
        positionList: [{ type: Schema.Types.ObjectId, ref: 'Position' }],
        rentalColumns: [String]
    },
    costReport: {
        displaySettings: Object,
        extraColumns: [String],
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
    }
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

