const Show=require('../models/show')
const User=require('../models/user')

module.exports.populateShow=async (id) => {
    let show=await Show.findById(id).populate('weeks.crew.crewList')
    return show;
}

module.exports.clearUnverifiedUsers=async () => {
    let users=await User.find({ $or: [{ status: 'awaiting-verification-delete' }, { status: 'awaiting-verification-keep' }] })
    let now=new Date().getTime()
    for (user of users) {
        // Only change users that are expired
        if ((now-user.created)>process.env.CLEAR_UNVERIFIED_USER_INTERVAL) {
            if (user.status=='awaiting-verification-delete') {
                console.log(`\n\nDelete user ${user.username} who was awaiting verification`)
                await User.findByIdAndDelete(user._id)
            } else {
                user.status='unclaimed'
                await user.save()
            }
        }
    }
}