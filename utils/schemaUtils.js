const Show=require('../models/show');

module.exports.populateShow=async (id) => {
    let show=await Show.findById(id).populate('weeks.crew.crewList')
    return show;
}