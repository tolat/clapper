const Show=require('../models/show');
const User=require('../models/user');
const Purchase=require('../models/purchase');
const Set=require('../models/set');
const Position=require('../models/position');

module.exports.populateShow=async (id) => {
    let show=await Show.findById(id)
        .populate('sets')
        .populate('weeks.crew.crewList')
        .populate('positions.positionList')
        .populate('purchases')
        .populate({
            path: 'purchases.purchaseList',
            populate: { path: 'set' }
        })

    return show;
}