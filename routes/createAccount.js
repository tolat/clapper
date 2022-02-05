const express=require('express');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const router=express.Router({ mergeParams: true });
const User=require('../models/user');
const TempUser=require('../models/tempUser');
const { joiValidate, userValidationSchema }=require('../utils/validationSchemas')
const { parsePhoneNumber }=require('libphonenumber-js');
const numUtils=require('../utils/numberUtils')
const nodemailer=require("nodemailer");

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
        let tempUser=new TempUser(req.body.user);
        tempUser.Name=`${req.body.user.firstname} ${req.body.user.lastname}`
        tempUser.username=tempUser.Email
        tempUser.created=new Date(Date.now())
        tempUser.verificationKey=numUtils.stringToIntHash(tempUser.username)
        await tempUser.save()

        // Send verification email
        let transporter=nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true, // true for 465, false for other ports
            auth: {
                user: 'clapper.noreply@gmail.com',
                pass: `${process.env.VERIFICATION_EMAIL_PASSWORD}`
            },
        });

        let info=await transporter.sendMail({
            from: '"clapper.ca-noreply" <clapper.noreply@gmail.com>',
            to: "torin.olat@gmail.com",
            subject: "Confirm clapper.ca email",
            html: `<a href='${process.env.SERVER}/emailVerification/${tempUser.verificationKey}'>Click to confirm email</a>`,
        });

        // Redirect to email verification page
        res.redirect('/emailVerification')
    }
    catch (e) {
        req.flash('error', e.message)
        res.redirect('/createAccount')
    }
}))


module.exports=router;