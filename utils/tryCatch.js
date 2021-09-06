// Async try/catch wrapper function
module.exports=fn => {
    return function (req, res, next) {
        fn(req, res, next).catch(e => next(e))
    }
}

