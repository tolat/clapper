const express=require('express');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const router=express.Router({ mergeParams: true });
const User=require('../models/user');
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
        // Create new user, mark them as awaiting verification
        let user=new User(req.body.user);
        user.Name=`${req.body.user.firstname} ${req.body.user.lastname}`
        user.username=user.Email
        user.created=new Date()
        user.status='awaiting-verification-delete'
        user.showrecords={}

        // Check for existing user
        let existingUser=await User.findOne({ username: user.username })
        if (existingUser) {
            // Check if existing user is awaiting verification
            if (existingUser.status.includes('awaiting-verification')) {
                req.flash('error', 'A user with that email is already awaiting verification')
                res.render('emailVerification', {
                    title: 'Email Verification',
                    args: {
                        server: req.app.get('server'),
                        text: 'Check your email for the account confirmation link!',
                        button: `<div class="button-secondary cursor-pointer" style="color: white" onclick="">Resend email</div>`
                    }
                })
                return
            }

            // Check if existing user is unclaimed. Copy data into new user if it is
            if (existingUser.status=='unclaimed') {
                user._id=existingUser._id.toString()
                user.showrecords=JSON.parse(JSON.stringify(existingUser.showrecords))
                user.status='awaiting-verification-keep'
                await User.findByIdAndDelete(user._id)
            }
        }

        await User.register(user, req.body.user.password)

        // Send verification email
        let transporter=nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true, // true for 465, false for other ports
            auth: {
                user: `${process.env.VERIFICATION_EMAIL}`,
                pass: `${process.env.VERIFICATION_EMAIL_PASSWORD}`
            },
        });

        // Try sending verification email to client
        try {
            let info=await transporter.sendMail({
                from: `"clapper.ca-noreply" <${process.env.VERIFICATION_EMAIL}>`,
                to: user.username,
                subject: "Confirm clapper.ca email",
                html: `<a href='${process.env.SERVER}/emailVerification/${user._id.toString()}'>Click to confirm email</a>`,
            });
        } catch (e) {
            console.log(e)
            req.flash('error', e.message)
        }

        // Redirect to email verification page
        res.redirect('/emailVerification')
    }
    catch (e) {
        req.flash(`error`, e.message)
        res.redirect('/createAccount')
    }
}))


module.exports=router;