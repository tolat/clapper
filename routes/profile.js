const express=require('express');
const tryCatch=require('../utils/tryCatch');
const ExpressError=require('../utils/ExpressError');

const router=express.Router({ mergeParams: true });

// Load profile page
router.get('/', (req, res) => {
    let args={ server: req.app.get('server') };

    res.render('profile', {
        title: 'Profile',
        args: args
    })
})

module.exports=router;