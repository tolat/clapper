module.exports.randInt=(min, max) => {
    return Math.floor(Math.random()*(max-min)+min);
}

module.exports.genUniqueId=() => {
    return '_'+Math.random().toString(36).substr(2, 9);
}