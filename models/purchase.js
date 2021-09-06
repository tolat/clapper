const { json }=require('express');
const mongoose=require('mongoose');
const Schema=mongoose.Schema;

const PurchaseSchema=new Schema({
    'Set Code': String,
    '#': Number,
    'Department': String,
    'Date': Date,
    'PO Num': String,
    'Invoice Num': String,
    'Supplier': Schema.Types.Mixed,
    'Description': String,
    'Amount': Number,
    weekId: String,
    extraColumnValues: Object,
    taxColumnValues: Object
}, { minimize: false })

PurchaseSchema.virtual('displayKeys').get(function () {
    return ['#', 'Department', 'Date', 'PO Num', 'Invoice Num', 'Supplier', 'Description', 'Amount', 'Set Code'];
});

module.exports=mongoose.model('Purchase', PurchaseSchema);
