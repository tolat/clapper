module.exports.randInt=(min, max) => {
    return Math.floor(Math.random()*(max-min)+min);
}

module.exports.genUniqueId=() => {
    return '_'+Math.random().toString(36).substr(2, 9);
}

// Sort data bu number property
module.exports.sortByNumber=function (data, args) {
    console.log(args)
    return data.sort((a, b) => { return module.exports.stableSort(a, b, true, '#', 'Set Code', args) });
}

module.exports.stableSort=function (a, b, sortAsc, field, tiebreak='Set Code', _args) {
    if (_args.section=='Crew') { tiebreak='Date Joined' }
    if (!a||!b) { if (sortAsc) { return 1 } else { return 0 } }
    aTie=a[tiebreak]
    bTie=b[tiebreak]
    a=a[field]
    b=b[field]

    // Sort Dates
    if (field.toLowerCase().includes('date')) {
        a=new Date(a).getTime();
        b=new Date(b).getTime();
    }

    // Sort numbers
    let aNum=parseFloat(a);
    let bNum=parseFloat(b);
    if (!a) { if (sortAsc) { aNum=Infinity } else { aNum=-Infinity } }
    if (!b) { if (sortAsc) { bNum=Infinity } else { bNum=-Infinity } }
    let aNumTie=parseFloat(aTie);
    let bNumTie=parseFloat(bTie);
    if (!isNaN(aNum)&&!isNaN(bNum)) {
        if (sortAsc) { if (aNum==bNum) { if (aNumTie>bNumTie) { return 1 } if (bNumTie>aNumTie) { return -1 } return 0 } return aNum-bNum }
        else { if (bNum==aNum) { if (bNumTie>aNumTie) { return 1 } if (aNumTie>bNumTie) { return -1 } return 0 } return bNum-aNum }
    }
    // Else sort alphabetical
    else {
        if (!a) { if (sortAsc) { a='ZZZZZZZZZ' } else { a='AAAAAAAAA' } }
        if (!b) { if (sortAsc) { b='ZZZZZZZZZ' } else { b='AAAAAAAAA' } }
        if (sortAsc) { if (a>b) { return 1 } if (b>a) { return -1 } return 0 }
        else { if (b>a) { return 1 } if (a>b) { return -1 } return 0 }
    }
}

// Return Null if value is zero or nan
module.exports.zeroNanToNull=function (val) {
    if (val==0||isNaN(val)||val==Infinity||val==-Infinity) { val=null }
    return val
}