const { json }=require('express');
const mongoose=require('mongoose');
const Schema=mongoose.Schema;

const SetSchema=new Schema({
    show: { type: Schema.Types.ObjectId, ref: 'Show' },
    '#': Number,
    'Set Code': String,
    'Episode': String,
    'Name': String,
    estimates: Object,
    estimateTotals: Object
}, { minimize: false })

SetSchema.virtual('displayKeys').get(function () {
    return ['Set Code', 'Episode', 'Name', '#'];
});


module.exports=mongoose.model('Set', SetSchema);
