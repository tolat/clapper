const express=require('express');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');

const router=express.Router({ mergeParams: true });

const User=require('../models/user');
const { joiValidate, userValidationSchema }=require('../utils/validationSchemas')
const { parsePhoneNumber }=require('libphonenumber-js');

// Create Account Load
router.get('/', (req, res) => {
    let args={ server: req.app.get('server') };
    res.render('createAccount', {
        title: 'Create Account',
        args: args
    })
})

// Create account 
router.post('/', joiValidate(userValidationSchema), tryCatch(async (req, res) => {
    try {
        const user=new User(req.body.user);
        user.Name=`${req.body.user.firstname} ${req.body.user.lastname}`
        user.username=user.Email
        const regUser=await User.register(user, req.body.user.password)

        // Log new user in
        req.login(regUser, err => {
            if (err) return next(err)
            req.flash('success', 'Account successfully created!')
            res.redirect(`/shows`)
        })
    }
    catch (e) {
        req.flash('error', e.message)
        res.redirect('/createAccount')
    }
}))


module.exports=router;