const express=require('express');
const path=require('path');
const tryCatch=require('../utils/tryCatch');
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
router.post('/', passport.authenticate('local', { failureFlash: true, failureRedirect: '/login' }), (req, res) => {
    req.flash('success', `Welcome back ${req.user.Name}.`)
    const redirectUrl=req.session.returnTo||'/shows'
    delete req.session.returnTo
    res.redirect(redirectUrl)
})

module.exports=router;