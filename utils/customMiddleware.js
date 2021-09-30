const Show=require('../models/show')

module.exports.isLoggedIn=(req, res, next) => {
    req.session.returnTo=req.originalUrl
    if (!req.isAuthenticated()) {
        req.flash('error', 'You must be logged in to view this page.')
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

module.exports.allowAnyAccessOrigin=(req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    res.set('type', 'basic')
    next()
}