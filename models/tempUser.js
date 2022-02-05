const { json }=require('express');
const mongoose=require('mongoose');
const Schema=mongoose.Schema;
const passportLocalMongoose=require('passport-local-mongoose')

const TempUserSchema=new Schema({
    'username': String,
    'Name': String,
    'Email': String,
    'Phone': String,
    showrecords: [Object],
    created: Date,
    verificationKey: String,
    password: String
}, { minimize: false })

TempUserSchema.virtual('fullname').get(function () {
    return `${this.firstname} ${this.lastname}`
});

TempUserSchema.virtual('displayKeys').get(function () {
    return ['Email', 'Phone', 'Name'];
});

module.exports=mongoose.model('TempUser', TempUserSchema);