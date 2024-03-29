const Show=require('../models/show')
const crudUtils=require('../routes/ShowPageCRUD/utils')

module.exports.isLoggedIn=(req, res, next) => {
    req.session.returnTo=req.originalUrl
    if (!req.isAuthenticated()) {
        req.flash('error', 'You must be logged in to view this page.')
        console.log('\n\n\nNOT AUTHENTICATED \n\n\n')
        return res.redirect('/login')
    }
    next()
}

module.exports.isAdmin=(req, res, next) => {
    if (!process.env.ADMINS.includes(req.user.username)) {
        req.flash('error', 'You must be an administrator to access this route.')
        return res.redirect('/login')
    }
    next()
}

module.exports.isShowOwner=async (req, res, next) => {
    const showid=req.params.id
    const apName=crudUtils.getAccessProfileName(req.user)
    let show=await Show.findById(showid)
    if (show.accessMap[apName].profile!='Owner') {
        req.flash('error', `You cannot delete the show: ${show.Name}`)
        if (!req.isAuthenticated()) {
            return res.send({ redirect: `${process.env.SERVER}/login` })
        } else {
            return res.send({ redirect: `${process.env.SERVER}/shows` })
        }
    }
    next()
}

module.exports.hasShowAccess=async (req, res, next) => {
    const showid=req.params.id
    let show=await Show.findById(showid)

    // Get to access profile key
    let apName=crudUtils.getAccessProfileName(req.user)

    if (!Object.keys(show.accessMap).includes(apName)) {
        req.flash('error', `You do not have access to the show: ${show.Name}`)
        if (!req.isAuthenticated()) {
            return res.send({ redirect: `${process.env.SERVER}/login` })
        } else {
            return res.send({ redirect: `${process.env.SERVER}/shows` })
        }
    }
    next()
}

module.exports.handleCORS=async (req, res, next) => {
    // allow requests from http version of secure origin
    let server=process.env.SERVER

    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Origin', server);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');

    // Send success if CORS checks options on pre-flight test
    'OPTIONS'==req.method? res.send(200):next()
}

module.exports.handleGuestLogin = async (req, res, next) =>{
    if(req.body.username == "GUEST_LOGIN"){
        req.body.username = "torin.olat@gmail.com"
        req.body.password = "Password1"
    }
   
    next()
}