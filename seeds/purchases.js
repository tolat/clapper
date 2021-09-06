const { randInt }=require('../utils/numberUtils');

const suppliersA=[
    "Jim's",
    'Windsor',
    'East Coast',
    "Mike's",
    'Pacific'
]

const suppliersB=[
    'Sheetrock',
    'Tools',
    'Metal',
    'Supplies',
    'Hardware'
]

module.exports.genSupplier=() => {
    return `${suppliersA[randInt(0, suppliersA.length)]} ${suppliersB[randInt(0, suppliersB.length)]}`
}

module.exports.genInvoiceNo=() => {
    let num='';
    for (let i=0; i<6; i++) {
        num+=randInt(0, 9).toString();
    }
    return num;
}

