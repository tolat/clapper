const express=require('express');
const path=require('path');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const passport=require('passport')
const Show=require('../models/show')
const User=require('../models/user')
const TempUser=require('../models/tempUser')
const nodemailer=require("nodemailer");

const router=express.Router({ mergeParams: true });

// Load email verification page after account creation
router.get('/', (req, res) => {
    const args={
        server: req.app.get('server'),
        text: 'Check your email for the account confirmation link!',
        button: ''
    };

    res.render('emailVerification', {
        title: 'Email Verification',
        args: args
    })
})

// Load email verification page with verification key
router.get('/:key', async (req, res) => {
    const args={
        text: 'Email confirmed!',
        button: `<div class="button-secondary cursor-pointer" style="color: white" onclick="location.href = '${process.env.SERVER}/login'">Return to login page</div>`
    };

    // Retrieve tempUser from db
    const key=req.params.key
    let tempUser=await TempUser.findOne({ verificationKey: key })

    // Create new user, check if user with username already exists. if it does, set user to that user.
    let user=new User()
    let existingUser=await User.findOne({ username: tempUser.username })
    if (existingUser) {
        // Copy data from existing user
        for (k of ['Name', 'username', 'Phone', 'Email', 'showrecords']) {
            user[k]=JSON.parse(JSON.stringify(existingUser[k]))
        }

        user._id=existingUser._id
        // Delete existing user
        await User.findByIdAndDelete(existingUser._id)
    } else {
        // Copy data from tetmporary user
        for (k of ['Name', 'username', 'Phone', 'Email']) {
            user[k]=tempUser[k]
        }

        // Delete temp user && existing user
        await TempUser.findByIdAndDelete(tempUser._id)
    }

    // Register user with password from tempuser
    newUser=await User.register(user, tempUser.password)

    res.render('emailVerification', {
        title: 'Email Verification',
        args: args,
    })
})

module.exports=router;