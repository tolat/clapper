const mongoose=require('mongoose');
const Schema=mongoose.Schema;

const workerQueueSchema=new Schema({
    queue: [{
        args: Object
    }]
})

module.exports=mongoose.model('workerQueue', workerQueueSchema);