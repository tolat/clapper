
const mongoose=require('mongoose');
const Show=require('../models/show');
const User=require('../models/user');
const { positions }=require('./positions');
const { showNames, genStartDate, departmentNames, genDateBetween }=require('./shows');
const { getDescription }=require('./sets');
const userSeeds=require('./users');
const { genInvoiceNo, genSupplier }=require('./purchases');
const { randInt, genUniqueId }=require('../utils/numberUtils');

const oneDay=24*60*60*1000;
const firstWeekId=genUniqueId()

// Connect to the database and handle connection errors
mongoose.connect('mongodb://localhost:27017/FilmApp_develop', {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true
});
const db=mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Database connected');
    console.log('SEEDING...');
});

const seedShows=async () => {
    for (let i=0; i<showNames.length; i++) {
        const firstWeekEnd=genStartDate()
        const show=new Show({
            'Name': showNames[i],
            departments: departmentNames,
            departmentColorMap: {
                'Construction': '#FF7575',
                'Paint': '#FFF475',
                'Greens': '#5FF283',
                'Metal Fab': '#5FC5F2',
                'Sculptors': '#FFFFFF'
            },
            weeks: [{
                _id: firstWeekId,
                end: firstWeekEnd,
                multipliers: {
                    0: {
                        Mon: 1,
                        Tue: 1,
                        Wed: 1,
                        Thu: 1,
                        Fri: 1,
                        Sat: 1,
                        Sun: 1
                    }
                },
                crew: {
                    extraColumns: [],
                    taxColumns: ['GST', 'PST'],
                    crewList: []
                },
                rentals: {
                    displaySettings: {},
                    extraColumns: [],
                    taxColumns: ['GST', 'PST'],
                    rentalList: []
                },
                positions: {
                    extraColumns: [],
                    positionList: {}
                }
            }],
            estimateVersions: {
                '100': {
                    extraColumns: ['Location', 'Notes'],
                    mandayRates: {
                        'Construction': 550,
                        'Paint': 300,
                        'Greens': 300,
                        'Metal Fab': 450,
                        'Sculptors': 400
                    },
                    fringes: {
                        'Holidays': 5,
                        'Overtime': 2.5
                    },
                    weekEnding: false,
                    dateCreated: firstWeekEnd,
                    sets: []
                }
            },
            purchases: {
                extraColumns: [],
                taxColumns: ['GST', 'PST'],
                purchaseList: []
            },
            costReport: {
                extraColumns: [],
                setExtraColumnMap: {},
            },
            timesheets: {
                timesheetMaps: [{
                    name: "Sample",
                    cellValueMap: {
                        "C": {
                            "3": "Show-Name",
                            "5": "Crew-Name"
                        },
                        "P": {
                            "5": "Crew-Position",
                        },
                        "W": {
                            "4": "Crew-Position-Rate"
                        }
                    },
                    displaySettings: {},
                }],
                currentMap: "Sample"
            },
            accessMap: {
                'pigsinpyjamas@yahoo-ca': {
                    profile: 'Test Access',
                    currentWeek: firstWeekId,
                    estimateVersion: '100'
                },
                'torin-olat@gmail-com': {
                    profile: 'Owner',
                    currentWeek: firstWeekId,
                    estimateVersion: '100'
                }
            },
            accessProfiles: {
                "Test Access": {
                    name: 'Test Access',
                    'Cost Report': {
                        columnFilter: [],
                        dataFilter: {},
                        displaySettings: {
                            'pigsinpyjamas@yahoo-ca': {
                                100: {
                                    [`${firstWeekId}`]: {}
                                }
                            }
                        }
                    },
                    'Estimate': {
                        columnFilter: ['Location', 'Notes'],
                        dataFilter: { 'Episode': ['200'] },
                        displaySettings: {
                            'pigsinpyjamas@yahoo-ca': {
                                100: {}
                            }
                        }
                    },
                    'Purchases': {
                        columnFilter: ['Invoice Num'],
                        dataFilter: { 'Set Code': ['103'] },
                        displaySettings: {
                            'pigsinpyjamas@yahoo-ca': {
                                [`${firstWeekId}`]: {}
                            }
                        }
                    },
                    'Rentals': {
                        columnFilter: ['Supplier'],
                        dataFilter: { 'Department': ['Construction'] },
                        displaySettings: {
                            'pigsinpyjamas@yahoo-ca': {
                                [`${firstWeekId}`]: {}
                            }
                        }
                    },
                    'Crew': {
                        columnFilter: ['Email'],
                        dataFilter: { 'Department': ['Construction', 'Metal Fab', 'Sculptors', 'Greens'] },
                        displaySettings: {
                            'pigsinpyjamas@yahoo-ca': {
                                [`${firstWeekId}`]: {}
                            }
                        }
                    },
                    'Rates': {
                        columnFilter: ['Rate'],
                        dataFilter: { Department: ['Construction'] },
                        displaySettings: {
                            'pigsinpyjamas@yahoo-ca': {
                                [`${firstWeekId}`]: {}
                            }
                        }
                    },
                    'Timesheets': {
                        columnFilter: [],
                        dataFilter: {},
                        displaySettings: {}
                    }
                },
                Owner: {
                    name: 'Owner',
                    'Cost Report': {
                        columnFilter: [],
                        dataFilter: {},
                        displaySettings: {
                            'torin-olat@gmail-com': {
                                100: {
                                    [`${firstWeekId}`]: {}
                                }
                            }
                        }
                    },
                    'Estimate': {
                        columnFilter: [],
                        dataFilter: {},
                        displaySettings: {
                            'torin-olat@gmail-com': {
                                100: {}
                            }
                        }
                    },
                    'Purchases': {
                        columnFilter: [],
                        dataFilter: {},
                        displaySettings: {
                            'torin-olat@gmail-com': {
                                [`${firstWeekId}`]: {}
                            }
                        }
                    },
                    'Rentals': {
                        columnFilter: [],
                        dataFilter: {},
                        displaySettings: {
                            'torin-olat@gmail-com': {
                                [`${firstWeekId}`]: {}
                            }
                        }
                    },
                    'Crew': {
                        columnFilter: [],
                        dataFilter: {},
                        displaySettings: {
                            'torin-olat@gmail-com': {
                                [`${firstWeekId}`]: {}
                            }
                        }
                    },
                    'Rates': {
                        columnFilter: [],
                        dataFilter: {},
                        displaySettings: {
                            'torin-olat@gmail-com': {
                                [`${firstWeekId}`]: {}
                            }
                        }
                    },
                    'Timesheets': {
                        columnFilter: [],
                        dataFilter: {},
                        displaySettings: { 'torin-olat@gmail-com': {} }
                    }

                }
            },
        })

        await show.save();
    }
}

const seedPositions=async () => {
    const shows=await Show.find();
    for (show of shows) {
        for (position of positions) {
            pos={
                'Name': position.title,
                'Department': position.department,
                'Rate': randInt(25, 55),
                extraColumnValues: {},
            }
            show.weeks[0].positions.positionList[position.code]=pos
        }
        await show.markModified('weeks')
        await show.save();
    }
}

const seedSets=async () => {
    const shows=await Show.find();
    for (show of shows) {
        for (let i=1; i<6; i++) {
            for (let j=1; j<10; j++) {
                let set={
                    'Set Code': `${i}0${j}`,
                    'Episode': `${i}00`,
                    'Name': getDescription(),
                    departmentValues: {
                        'Construction Man Days': Math.floor(Math.random()*10),
                        'Construction Materials': Math.floor(Math.random()*1000),
                        'Construction Rentals': Math.floor(Math.random()*1000),

                        'Paint Man Days': Math.floor(Math.random()*10),
                        'Paint Materials': Math.floor(Math.random()*1000),
                        'Paint Rentals': Math.floor(Math.random()*1000),

                        'Greens Man Days': Math.floor(Math.random()*10),
                        'Greens Materials': Math.floor(Math.random()*1000),
                        'Greens Rentals': Math.floor(Math.random()*1000),

                        'Metal Fab Man Days': Math.floor(Math.random()*10),
                        'Metal Fab Materials': Math.floor(Math.random()*1000),
                        'Metal Fab Rentals': Math.floor(Math.random()*1000),

                        'Sculptors Man Days': Math.floor(Math.random()*10),
                        'Sculptors Materials': Math.floor(Math.random()*1000),
                        'Sculptors Rentals': Math.floor(Math.random()*1000),
                    },
                    extraColumnValues: {
                        'Location': '',
                        'Notes': '',
                    }
                }

                await show.estimateVersions['100'].sets.push(set);
                show.markModified('estimateVersions')
                await show.save();
            }
        }
        console.log(`done sets for ${show['Name']}`);
    }
}

const seedUsers=async () => {
    // Create 100 users
    for (let i=0; i<100; i++) {
        const user=new User({
            'Name': `${userSeeds.randomFirstName()} ${userSeeds.randomLastName()}`,
            'Phone': userSeeds.randomPhone()
        })
        let email=`${user['Name'].toLowerCase().replace(" ", "")}${userSeeds.emails[randInt(0, userSeeds.emails.length)]}`;
        while (await User.findOne({ Email: email })) {
            email=`${user['Name'].toLowerCase().replace(" ", "")}_${randInt(0, 10)}${userSeeds.emails[randInt(0, userSeeds.emails.length)]}`;
        }
        user['Email']=email
        user['username']=email
        await user.save();
    }

    // Assign 30 random users to each show in week 1
    let users=await User.find();
    const shows=await Show.find();
    for (s of shows) {
        let show=await Show.findById(s._id)
        let startIdx=randInt(0, users.length);
        for (let i=startIdx; i<startIdx+30; i++) {
            let user=users[i%users.length];
            let joinDate=genDateBetween(new Date(show.weeks[0].end.getTime()-(7*oneDay)), show.weeks[0].end);
            let posCodes=Object.keys(show.weeks[0].positions.positionList)

            // Create record for this show
            let record={
                showid: show._id,
                showname: show['Name'],
                'Date Joined': joinDate,
                // Weeks worked
                weeksWorked: {},
                // Each position has its own days worked 
                positions: [{
                    code: posCodes[randInt(0, posCodes.length)],
                    daysWorked: {}
                }]
            }

            // Set first week worked
            record.weeksWorked[firstWeekId]={
                extraColumnValues: {},
                taxColumnValues: {
                    'GST': 0,
                    'PST': 0
                },
            }

            let sets=show.estimateVersions[`100`].sets

            // Add days worked for first/only seeded position
            for (let j=0; j<6; j++) {
                let date=new Date(show.weeks[0].end.getTime()-(j*oneDay));
                record.positions[0].daysWorked[date.toLocaleDateString('en-US')]={
                    hours: randInt(1, 12),
                    set: sets[randInt(0, sets.length)]['Set Code'],
                };
            }

            await user.showrecords.push(record);
            user.markModified('showrecords');
            await user.save();
            await show.weeks[0].crew.crewList.push(user);
            show.markModified('crew.crewList');
            await show.save();
        }
        console.log(`${show['Name']}\n Started on week ending ${show.weeks[0].end.toString().slice(0, 15)} with ${show.weeks[0].crew.crewList.length} crew`);
    }
}

const seedPurchases=async () => {
    const shows=await Show.find()
    for (show of shows) {
        const sets=show.estimateVersions['100'].sets;
        const depts=show.departments;
        for (set of sets) {
            for (let i=0; i<2; i++) {
                let purchDate=genDateBetween(new Date(show.weeks[0].end.getTime()-(7*oneDay)), show.weeks[0].end);
                const purch={
                    'Set Code': set['Set Code'],
                    'Department': depts[randInt(0, depts.length)],
                    'Date': purchDate,
                    'PO Num': genInvoiceNo(),
                    'Invoice Num': genInvoiceNo(),
                    'Supplier': genSupplier(),
                    'Amount': randInt(0, 5000),
                    'Description': genSupplier(),
                    extraColumnValues: {},
                    taxColumnValues: { GST: 5, PST: 7 }
                }
                await show.purchases.purchaseList.push(purch);
                await show.save();
            }
        }
        console.log(`${show['Name']} has ${show.purchases.purchaseList.length} purchases`);
    }
}

const seedRentals=async () => {
    const shows=await Show.find().populate('weeks.crew.crewList')
    for (show of shows) {
        let rentalNames=[
            'Construction Coordinator Kit',
            'Paint Coordinator Kit',
            'Greensperson Kit',
            'Sculptor Kit',
            'Construction Foreman Kit',
        ];
        let rentalPositions=[
            'CC',
            'PC',
            'GP',
            'S',
            'CF',
        ];
        let crewList=show.weeks[0].crew.crewList;
        let sets=show.estimateVersions['100'].sets

        for (let i=0; i<rentalNames.length; i++) {
            let set=sets[randInt(0, sets.length)];

            let rental={
                'Set Code': set['Set Code'],
                'Day Rate': Math.floor(randInt(10, 300)/10)*10,
                'Rental Name': rentalNames[i],
                'Days Rented': randInt(0, 7),
                'Code': rentalPositions[i],
                taxColumnValues: {
                    'GST': randInt(0, 1)*5,
                    'PST': randInt(0, 1)*7,
                },
                extraColumnValues: {}
            }
            rental['Department']=show.weeks[0].positions.positionList[rental['Code']]['Department']

            for (user of crewList) {
                let record=user.showrecords.find(r => r.showid==show._id.toString())
                if (record) {
                    let position=record.positions.find(p => p.code==rentalPositions[i])
                    if (position) {
                        rental['Supplier']=user['username']
                        break
                    }
                }
            }

            await show.weeks[0].rentals.rentalList.push(rental);
            await show.save();
        }
        console.log(`${show['Name']} has ${show.weeks[0].rentals.rentalList.length} rentals`);
    }
}

const seedDB=async () => {
    await Show.deleteMany({});
    await seedShows();
    console.log('done shows..');

    await seedPositions();
    console.log('done positions..');

    await seedSets();
    console.log('done sets..');

    await User.deleteMany({});
    await seedUsers();
    console.log('done users..');

    await seedPurchases();
    console.log('done purchases..');

    await seedRentals();
    console.log('done rentals..');

    console.log('DONE!');

    // Create first master user
    let mUser=new User({
        Name: "Torin O'Regan-Latarius",
        username: "torin.olat@gmail.com",
        Email: "torin.olat@gmail.com",
        Phone: "6047235351"
    })
    await User.register(mUser, 'Password1')

    // Create second user fore access profile testing
    let ptUser=new User({
        Name: "Kit Clark",
        username: "pigsinpyjamas@yahoo.ca",
        Email: "pigsinpyjamas@yahoo.ca",
        Phone: "18004206969"
    })
    await User.register(ptUser, 'Password1')


    return;
}

const awaitSeed=async () => {
    await seedDB();
}

awaitSeed();




