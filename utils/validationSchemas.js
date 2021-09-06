const Joi=require('joi');
const myCustomJoi=Joi.extend(require('joi-phone-number'));
const ExpressError=require('../utils/ExpressError');

module.exports.joiValidate=(schema) => {
    console.log('in validation function');
    return (req, res, next) => {
        const { error }=schema.validate(req.body);
        if (error) {
            const msg=error.details.map(el => el.message).join(',');
            throw new ExpressError(msg, 400);
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


