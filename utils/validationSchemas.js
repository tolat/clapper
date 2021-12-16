const Joi=require('joi');
const myCustomJoi=Joi.extend(require('joi-phone-number'));
const ExpressError=require('../utils/ExpressError');

module.exports.joiValidate=(schema) => {
    return (req, res, next) => {
        const { error }=schema.validate(req.body);
        if (error) {
            req.flash('error', error.message)
            res.redirect('/createAccount')
        } else {
            next();
        }
    }
}

module.exports.userValidationSchema=Joi.object({
    user: Joi.object({
        firstname: Joi.string().required(),
        lastname: Joi.string().required(),
        Email: Joi.string().email().required(),
        Phone: myCustomJoi.string().phoneNumber().required(),
        password: Joi.string().required()
    }).required()
});


