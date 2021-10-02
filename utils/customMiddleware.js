const Show=require('../models/show')

module.exports.isLoggedIn=(req, res, next) => {
    console.log(req.session)
    console.log(req.user)
    req.session.returnTo=req.originalUrl
    if (!req.isAuthenticated()) {
        req.flash('error', 'You must be logged in to view this page.')
        console.log("\n\n\n NOT AUTHENTICATED \n\n\n")
        return res.redirect('/login')
    }
    next()
}

module.exports.isShowOwner=async (req, res, next) => {
    const showid=req.params.id
    let show=await Show.findById(showid)
    if (show.owner!=req.user.username) {
        req.flash('error', `You do not have access to the show: ${show.Name}`)
        if (!req.isAuthenticated()) {
            return res.redirect('/login')
        } else {
            return res.redirect('/shows')
        }
    }
    next()
}
