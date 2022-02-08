const { json }=require('express');
const mongoose=require('mongoose');
const Schema=mongoose.Schema;
const passportLocalMongoose=require('passport-local-mongoose')

const UserSchema=new Schema({
    'username': String,
    'Name': String,
    'Email': String,
    'Phone': String,
    status: String,
    created: Date,
    showrecords: [Object],
}, { minimize: false })

UserSchema.plugin(passportLocalMongoose)

UserSchema.virtual('fullname').get(function () {
    return `${this.firstname} ${this.lastname}`
});

UserSchema.virtual('displayKeys').get(function () {
    return ['Email', 'Phone', 'Name'];
});

module.exports=mongoose.model('User', UserSchema);