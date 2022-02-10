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
    // Args for valid password resset link
    let args={
        server: req.app.get('server'),
        html: `<div id="login-container">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px;">
            <h3 style="margin: 0; color: white; font-style: italic;">Reset Password</h3>
        </div>
        <form id="login-form" class="needs-validation" action="/passwordRecovery/${req.params.recoveryKey}" method="POST">
                <div class="mb-3">
                    <label for="InputPassword" class="form-label">Password</label>
                    <input type="password" class="form-control" id="InputPassword" name="password" required>
                    <div class="invalid-feedback" style="font-weight: bold;" id="password-validity-feedback"></div>
                </div>
                <div class="mb-3">
                    <label for="VerifyPassword" class="form-label">Re-Enter Password</label>
                    <input type="password" class="form-control" id="VerifyPassword" required>
                    <div class="invalid-feedback" style="font-weight: bold;" id="confirm-password-validity-feedback">
                     Passwords do not match.
                    </div>
                </div>
                <button type="submit" class="btn btn-success">Reset Password</button>
                <button type="button" class="btn button-secondary" onclick="location.href = '/login';"
                    style="margin-top: 15px; color: white;">Cancel</button>
        </form>
    </div>`
    };

    // Redirect to login if passwork recovery key link is expired
    let user=await User.findOne({ status: `awaiting-password-recovery-${req.params.recoveryKey}` })
    if (!user) {
        req.flash('warning', 'Password recovery link expired.')
        res.redirect('/login')
    } else {
        res.render('passwordRecovery', {
            title: 'Password Recovery',
            args: args
        })
    }
})

router.post('/:recoveryKey', async (req, res) => {
    // Copy user data into new user and set new password if user with recoveryKey exists
    let user=await User.findOne({ status: `awaiting-password-recovery-${req.params.recoveryKey}` })
    if (user) {
        let userCopy=await new User()
        userCopy.username=user.username
        userCopy.Phone=user.Phone
        userCopy.Email=user.Email
        userCopy.Name=user.Name
        userCopy.created=user.created
        userCopy._id=user._id.toString()
        userCopy.showrecords=JSON.parse(JSON.stringify(user.showrecords))
        userCopy.status='claimed'
        await User.findByIdAndDelete(user._id)
        await User.register(userCopy, req.body.password)
        req.flash('success', 'Password updated successfully!')
    } else {
        req.flash('warning', 'Password recovery link expired.')
    }

    res.redirect('/login')
})

// Send password recovery link 
router.post('/', async (req, res) => {
    let args={
        server: req.app.get('server'),
        html: `<h3>Link sent!</h3><button type="button" class="btn button-secondary" onclick="location.href = '/login';"
        style="margin-top: 15px; color: white;">Back to Login</button>`
    };

    // Only send recovery email if user exists and is claimed
    let user=await User.findOne({ username: req.body.email })
    if (user&&user.status=='claimed') {
        // Assign user awaiting password recovery status wiht a random recovery key
        let recoveryKey=numUtils.stringToIntHash(Math.floor(Math.random()*1000000000).toString())
        user.status=`awaiting-password-recovery-${recoveryKey}`
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
                to: user.username,
                subject: "Recover clapper.ca password",
                html: `<a href='${process.env.SERVER}/passwordRecovery/${recoveryKey}'>Click to recover password</a>`,
            });
        } catch (e) {
            console.log(e)
            req.flash('error', e.message)
            args={
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
        }

        res.render('passwordRecovery', {
            title: 'Password Recovery',
            args: args
        })
    } else {
        req.flash('warning', 'User with given email address either does not exist or has not been claimed.')
        res.redirect('/login')
    }
})


module.exports=router;