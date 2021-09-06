
const mongoose=require('mongoose');
const Show=require('../models/show');
const User=require('../models/user');
const Purchase=require('../models/purchase');
const Rental=require('../models/rental');
const Set=require('../models/set');
const Position=require('../models/position');
const { positions }=require('./positions');
const { showNames, genStartDate, departmentNames, genDateBetween }=require('./shows');
const { getDescription }=require('./sets');
const userSeeds=require('./users');
const { genInvoiceNo, genSupplier }=require('./purchases');
const { randInt }=require('../utils/numberUtils');

const oneDay=24*60*60*1000;

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
        const show=new Show({
            'Name': showNames[i],
            currentWeek: 1,
            departments: departmentNames,
            departmentColorMap: {},
            weeks: [{
                number: 1,
                end: genStartDate(),
                crew: {
                    displaySettings: {},
                    extraColumns: [],
                    taxColumns: ['GST', 'PST'],
                    crewList: []
                },
                rentals: {
                    displaySettings: {},
                    extraColumns: [],
                    taxColumns: ['GST', 'PST'],
                    rentalList: []
                }
            }],
            estimateVersions: {
                '100': {
                    extraColumns: ['Location', 'Notes'],
                    displaySettings: {},
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
                }
            },
            purchases: {
                displaySettings: {},
                extraColumns: [],
                purchaseList: []
            },
            positions: {
                displaySettings: {},
                extraColumns: [],
                rentalColumns: [],
                positionList: [],
                multipliers: {}
            },
            costReport: {
                displaySettings: {},
                extraColumns: [],
                estimateVersion: '100',
                setNumberMap: {},
                setExtraColumnMap: {},
            }
        })

        // Assign random colours to departments
        let hexVals=['a', 'b', 'c', 'd', 'e', 'f', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        for (d of show.departments) {
            let color='#';
            for (let i=0; i<6; i++) {
                color=color.concat(hexVals[randInt(0, hexVals.length)]);
            }
            show.departmentColorMap[d]=color;
        }
        await show.save();
    }
}

const seedPositions=async () => {
    const shows=await Show.find();
    for (show of shows) {
        for (position of positions) {
            pos=new Position({
                show: show,
                'Name': position.title,
                'Code': position.code,
                'Department': position.department,
                extraColumnValues: {},
                'Rate': randInt(25, 55),
            })
            await pos.save();
            await show.positions.positionList.push(pos);
            await show.save();
        }
    }
}

const seedSets=async () => {
    const shows=await Show.find();
    for (show of shows) {
        for (let i=1; i<6; i++) {
            for (let j=1; j<10; j++) {
                let set=new Set({
                    show: show,
                    'Set Code': `${i}0${j}`,
                    'Episode': `${i}00`,
                    'Name': getDescription(),
                    estimates: {
                        '100': {
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
                    },
                    estimateTotals: {
                        '100': {
                            total: 0,
                            departmentTotals: {
                                'Construction': 1,
                                'Paint': 2,
                                'Greens': 3,
                                'Metal Fab': 4,
                                'Sculptors': 5
                            }
                        }
                    }
                })

                // Calculate estimate department totals and overall total
                let total=0;
                for (d of show.departments) {
                    let rate=show.estimateVersions['100'].mandayRates[d];
                    let manDays=set.estimates['100'].departmentValues[`${d} Man Days`];
                    let materials=set.estimates['100'].departmentValues[`${d} Materials`];
                    let rentals=set.estimates['100'].departmentValues[`${d} Rentals`];
                    let dTotal=(manDays*rate*1.075)+materials+rentals;
                    set.estimateTotals['100'].departmentTotals[d]=dTotal;
                    total+=dTotal;
                }

                set.estimateTotals['100'].total=total;
                set.markModified('estimateTotals');

                await set.save();
                await show.sets.push(set);
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
        user['Email']=`${user['Name']}${userSeeds.emails[randInt(0, userSeeds.emails.length)]}`;
        await user.save();
    }

    // Assign 30 random users to each show in week 1
    let users=await User.find();
    const shows=await Show.find();
    for (s of shows) {
        let show=await Show.findById(s._id).populate('positions.positionList').populate('sets');
        let startIdx=randInt(0, users.length);
        for (let i=startIdx; i<startIdx+30; i++) {
            let user=users[i%users.length];
            let joinDate=genDateBetween(new Date(show.weeks[0].end.getTime()-(7*oneDay)), show.weeks[0].end);

            // Create record for this show
            let record={
                showid: show._id,
                showname: show['Name'],
                'Date Joined': joinDate,
                // Weeks worked
                weeksWorked: {
                    1: {
                        extraColumnValues: {},
                        taxColumnValues: {
                            'GST': 0,
                            'PST': 0
                        },
                    }
                },
                // Each position has its own days worked 
                positions: [{
                    code: show.positions.positionList[randInt(0, show.positions.positionList.length)]['Code'],
                    daysWorked: {}
                }]
            }

            // Add days worked for first/only seeded position
            for (let j=0; j<6; j++) {
                let date=new Date(show.weeks[0].end.getTime()-(j*oneDay));
                record.positions[0].daysWorked[date.toLocaleDateString('en-US')]={
                    hours: randInt(1, 12),
                    set: show.sets[randInt(0, show.sets.length)]['Set Code'],
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
    const shows=await Show.find().populate('sets');
    for (show of shows) {
        const sets=show.sets;
        const depts=show.departments;
        for (set of sets) {
            for (let i=0; i<2; i++) {
                let purchDate=genDateBetween(new Date(show.weeks[0].end.getTime()-(7*oneDay)), show.weeks[0].end);
                const purch=new Purchase({
                    set: set,
                    'Department': depts[randInt(0, depts.length)],
                    'Date': purchDate,
                    'PO Num': genInvoiceNo(),
                    'Invoice Num': genInvoiceNo(),
                    'Supplier': genSupplier(),
                    'Amount': randInt(0, 5000),
                    'Description': genSupplier(),
                    'Tax (%)': randInt(0, 10),
                    'Week': 1,
                    extraColumnValues: {}
                })
                await purch.save();
                await show.purchases.purchaseList.push(purch);
                await show.save();
            }
        }
        console.log(`${show['Name']} has ${show.purchases.purchaseList.length} purchases`);
    }
}

const seedRentals=async () => {
    const shows=await Show.find().populate('sets').populate('weeks.crew.crewList').populate('positions.positionList')
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

        for (let i=0; i<rentalNames.length; i++) {
            let set=show.sets[randInt(0, show.sets.length)];

            let rental={
                'Set Code': set['Set Code'],
                'Day Rate': Math.floor(randInt(10, 300)/10)*10,
                'Description': rentalNames[i],
                'Days Rented': randInt(0, 7),
                'Code': rentalPositions[i],
                tax: {
                    'GST': randInt(0, 1)*5,
                    'PST': randInt(0, 1)*7,
                },
            }

            for (user of crewList) {
                let record=user.showrecords.find(r => r.showid==show._id.toString())
                if (record) {
                    let position=record.positions.find(p => p.code==rentalPositions[i])
                    if (position) {
                        rental['Supplier']=user['Name']
                        rental.supplierid=user._id
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

    await Position.deleteMany({});
    await seedPositions();
    console.log('done positions..');

    await Set.deleteMany({});
    await seedSets();
    console.log('done sets..');

    await User.deleteMany({});
    await seedUsers();
    console.log('done users..');

    await Purchase.deleteMany({});
    await seedPurchases();
    console.log('done purchases..');

    await Rental.deleteMany({});
    await seedRentals();
    console.log('done rentals..');

    console.log('DONE!');
    return;
}

const awaitSeed=async () => {
    await seedDB();
}

awaitSeed();




