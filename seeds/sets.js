// MAKE SURE THESE ARE SAME LENGTH
setDescriptionsA=[
    'Pacific',
    'Deadly',
    'Spooky',
    "Dad's",
    'Juniper',
    'East',
    "Tom's",
    'Old',
    'Dusty',
]

setDescriptionsB=[
    'Room',
    'Ocean',
    'Barn',
    'Ranch',
    'Stairwell',
    'Street',
    'House',
    'Courtyard',
    'Ridge'
]

module.exports.getDescription=() => {
    return `${setDescriptionsA[(Math.floor((Math.random()*10)%setDescriptionsA.length))]} ${setDescriptionsB[(Math.floor((Math.random()*10)%setDescriptionsB.length))]}`;
}