const Show=require('../models/show')

module.exports.isLoggedIn=(req, res, next) => {
    req.session.returnTo=req.originalUrl
    if (!req.isAuthenticated()) {
        req.flash('error', 'You must be logged in to view this page.')
        console.log('\n\n\nNOT AUTHENTICATED \n\n\n')
        console.trace()
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

module.exports.handleCORS=async (req, res, next) => {
    // allow requests from http version of secure origin
    let server=process.env.SERVER
    if (server.includes('https')) {
        server='http'+server.slice(5)
    }

    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Origin', server);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');

    // Send success if CORS checks options on pre-flight test
    'OPTIONS'==req.method? res.send(200):next()
}