const Show=require('../models/show')
const User=require('../models/user')

module.exports.populateShow=async (id) => {
    let show=await Show.findById(id).populate('weeks.crew.crewList')
    return show;
}

module.exports.clearUnverifiedUsers=async () => {
    let users=await User.find({ status: { $regex: 'awaiting-verification' } })
    let now=new Date().getTime()
    for (user of users) {
        // Only change users that have outlived their awiaiting verification time
        if ((now-user.created)>process.env.CLEAR_UNVERIFIED_USER_INTERVAL) {
            if (user.status=='awaiting-verification-delete') {
                await User.findByIdAndDelete(user._id)
            } else {
                user.status='unclaimed'
                await user.save()
            }
        }
    }
}

module.exports.clearAwaitingPasswordRecovery=async () => {
    let users=await User.find({ status: { $regex: 'awaiting-password-recovery' } })
    let now=new Date().getTime()
    for (user of users) {
        user.status='claimed'
        await user.save()
    }
}
