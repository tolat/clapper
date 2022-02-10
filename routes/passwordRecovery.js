const express=require('express');
const path=require('path');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');
const Show=require('../models/show')
const User=require('../models/user')
const nodemailer=require("nodemailer")
const numUtils=require('../utils/numberUtils')

const router=express.Router({ mergeParams: true });

// Load password recovery page 
router.get('/', (req, res) => {
    const args={
        server: req.app.get('server'),
        html: `<div id="login-container">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px;">
            <h3 style="margin: 0; color: white; font-style: italic;">Recover Password</h3>
        </div>
        <form id="login-form" action="/passwordRecovery" method="POST">
                <div class="mb-3">
                    <label for="exampleInputEmail1" class="form-label">Email address</label>
                    <input type="text" class="form-control" id="email" name="email" aria-describedby="emailHelp">
                </div>
                <button type="submit" class="btn btn-success">Send Link</button>
                <button type="button" class="btn button-secondary" onclick="location.href = '/login';"
                    style="margin-top: 15px; color: white;">Back to Login</button>
        </form>
    </div>`
    };

    res.render('passwordRecovery', {
        title: 'Password Recovery',
        args: args
    })
})

// Load password recovery page from recovery link 
router.get('/:recoveryKey', async (req, res) => {
    const args={
        server: req.app.get('server'),
        html: `<div id="login-container">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px;">
            <h1 style="margin: 0; color: white; font-style: italic;">Login</h1>
        </div>
        <form id="login-form" action="/passwordRecovery/${req.params.recoveryKey}" method="POST">
                <div class="mb-3">
                    <label for="exampleInputPassword1" class="form-label">New Password</label>
                    <input type="password" class="form-control" id="password" name="password">
                </div>
                <div class="mb-3">
                    <label for="exampleInputPassword1" class="form-label">Confirm New Password</label>
                    <input type="password" class="form-control" id="confirm-password" name="confirm-password">
                </div>
                <button type="submit" class="btn btn-success">Reset Password</button>
                <button type="button" class="btn button-secondary" onclick="location.href = '/login';"
                    style="margin-top: 15px; color: white;">Return to Login</button>
        </form>
    </div>`
    };
})

// Send password recovery link 
router.post('/', async (req, res) => {
    const args={
        server: req.app.get('server'),
        html: `<h3>Link sent!</h3><button type="button" class="btn button-secondary" onclick="location.href = '/login';"
        style="margin-top: 15px; color: white;">Back to Login</button>`
    };

    // Only send recovery email if user exists and is claimed
    let user=await User.find({ username: req.body.email })
    if (user&&user.status=='claimed') {
        // Assign user awaiting password recovery status wiht a random recovery key
        let recoveryKey=numUtils.stringToHash(Math.floor(Math.random()*1000000000))
        user.status=`awaiting-password-recovery-#${recoveryKey}`
        await user.save()

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
                to: 'torin.olat@gmail.com', //user.username,
                subject: "Recover clapper.ca password",
                html: `<a href='${process.env.SERVER}/passwordRecovery/${recoveryKey}'>Click to recover password</a>`,
            });
        } catch (e) {
            console.log(e)
            req.flash('error', e.message)
        }
    }

    res.render('passwordRecovery', {
        title: 'Password Recovery',
        args: args
    })
})


module.exports=router;