const express=require('express');
const path=require('path');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const Show=require('../models/show')
const User=require('../models/user')

const router=express.Router({ mergeParams: true });

// Load email verification page after account creation
router.get('/', (req, res) => {
    const args={
        server: req.app.get('server'),
        text: 'Check your email for the account confirmation link!',
        button: `<div class="button-secondary cursor-pointer" style="color: white" onclick="">Resend link</div>`
    };

    res.render('emailVerification', {
        title: 'Email Verification',
        args: args
    })
})

// Load email verification page with user id and try to validate the user
router.get('/:userid', async (req, res) => {
    const args={
        text: 'Email confirmed!',
        button: `<div class="button-secondary cursor-pointer" style="color: white" onclick="location.href = '${process.env.SERVER}/login'">Return to login page</div>`
    };

    let user=await User.findById(req.params.userid)
    // Handle expired verification link
    if (!user||user.status=='unclaimed') {
        req.flash('error', 'Verification link expired. Please create account again')
        res.render('createAccount', {
            title: 'Create Account',
            args: {
                server: req.app.get('server')
            },
        })
        return
    }

    // Handle a click on a link for an already claimed user
    if (user.status=='claimed') {
        res.redirect('/login')
        return
    }

    user.status='claimed'
    await user.save()

    res.render('emailVerification', {
        title: 'Email Verification',
        args,
    })
})

module.exports=router;