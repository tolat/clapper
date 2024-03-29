const express=require('express');
const path=require('path');
const tryCatch=require('../utils/tryCatch');
const {handleGuestLogin} = require("../utils/customMiddleware");
const ExpressError=require('../utils/ExpressError');
const passport=require('passport')

const router=express.Router({ mergeParams: true });

// Load login page
router.get('/', (req, res) => {
    const args={ server: req.app.get('server') };

    res.render('login', {
        title: 'Login',
        args: args
    })
})


// Log in 
router.post('/', handleGuestLogin, passport.authenticate('local', { failureFlash: true, failureRedirect: '/login' }), (req, res) => {
    // Redirect to confirm email page if user has not been verified
    if (req.user.status.includes('awaiting-verification')) {
        res.redirect('/emailVerification')
    } else if (req.user.status=='unclaimed') {
        res.redirect('/createAccount')
    } else {
        req.flash('success', `Welcome back ${req.user.Name}.`)
        const redirectUrl=req.session.returnTo||'/shows'
        delete req.session.returnTo
        res.redirect(redirectUrl)
    }
})

module.exports=router;