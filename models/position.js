const mongoose=require('mongoose');
const Schema=mongoose.Schema;

const PositionSchema=new Schema({
    show: { type: Schema.Types.ObjectId, ref: 'Show' },
    showId: String,
    '#': Number,
    'Name': String,
    'Department': String,
    'Code': String,
    'Rate': String,
    extraColumnValues: Object,
}, { minimize: false })

PositionSchema.virtual('displayKeys').get(function () {
    return ['Name', 'Department', 'Code', 'Rate', 'Unique'];
});

module.exports=mongoose.model('Position', PositionSchema);