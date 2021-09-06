const { randInt }=require('../utils/numberUtils');

module.exports.showNames=['The Matrix',
    'Ghostbusters',
    'The Wire'];

module.exports.genStartDate=() => {
    let now=new Date();
    let r=randInt(0, 7);
    return new Date().setDate(now.getDate()-(30*r)-30);
}

module.exports.genDateBetween=(start, end=new Date()) => {
    let range=end-start;
    let r=randInt(0, range);

    return new Date(start.getTime()+r);
}

module.exports.departmentNames=['Construction', 'Paint', 'Greens', 'Metal Fab', 'Sculptors'];
