const numUtils=require('../utils/numberUtils');

module.exports.firstnames=[
    'Mike',
    'Jim',
    'Bob',
    'Joe',
    'Mark',
    'Patrick',
    'Edward',
    'Susan',
    'Michelle',
    'Darlene',
    'Kaylie',
    'Peter',
    'Ryan',
    'Luke',
    'Sarah',
    'Jake',
    'Rajiv',
    'Harmit',
    'Jennifer',
    'Kayla',
    'Lindsay',
    'Tasha',
    'Dana',
    'Gregory',
    'Marla',
    'Camille',
    'Ralph',
    'Anna',
    'Isaac'
]

module.exports.lastnames=[
    'Patterson',
    'Daniels',
    'MacDonald',
    'Wyatt',
    'Hall',
    'Dwyer',
    'Perkins',
    'Halpert',
    'Scott',
    "O'Reilly",
    'Jenkins',
    'Cunningham',
    'Crosby',
    'Brisebois',
    'Lindholm',
    'Gagnon',
    'Granlund',
    'Stern',
    'McMichael',
    'Hickey',
    'Sanderson',
    'Paul',
]

module.exports.emails=[
    '@gmail.com',
    '@hotmail.com',
    '@yahoo.ca',
    '@google.ca'
]

module.exports.phoneAreaCodes=[
    '604',
    '778',
    '250'
]

module.exports.randomFirstName=() => {
    fn=module.exports.firstnames;
    return fn[Math.floor((Math.random()*10)%fn.length)];
}

module.exports.randomLastName=() => {
    fn=module.exports.lastnames;
    return fn[Math.floor((Math.random()*100)%fn.length)];
}

module.exports.randomPhone=() => {
    let num=module.exports.phoneAreaCodes[numUtils.randInt(0, module.exports.phoneAreaCodes.length)];
    for (let i=0; i<7; i++) {
        let digit=numUtils.randInt(0, 9).toString();
        num+=digit;
    }
    return num;
}

module.exports.getCurrentWeekEnding=(firstweekending) => {
    const oneDay=24*60*60*1000;
    const firstDate=new Date(Date.now());
    const secondDate=new Date(firstweekending);
    const msSinceFirstWeekEnd=Math.ceil((Math.round(Math.abs((firstDate-secondDate)/oneDay)))/7)*7*oneDay;
    return new Date(Date.parse(secondDate)+msSinceFirstWeekEnd);
}


