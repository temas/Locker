/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/
var logger = require(__dirname + "/../../Common/node/logger").logger;

// in the future we'll probably need a visitCollection too
var itemCollection, responseCollection;

exports.init = function(iCollection, rCollection) {
    itemCollection = iCollection;
    itemCollection.ensureIndex({"item":1},{unique:true},function() {});
    responseCollection = rCollection;
}

exports.clear = function(callback) {
    itemCollection.drop(function(){responseCollection.drop(callback)});
}

exports.getTotalItems = function(callback) {
    itemCollection.count(callback);
}
exports.getTotalEncounters = function(callback) {
    responseCollection.count(callback);
}

// handy to check all the original urls we've seen to know if we already have a item expanded/done
exports.checkUrl = function(origUrl, callback) {
    responseCollection.find({orig:origUrl}, {limit:1}, function(err, cursor){
        if(err) return callback();
        cursor.nextObject(function(err, item){
            if(err || !item || !item.link) return callback();
            callback(item.link);
        });
    });
}

// either gets a single item arg:{id:...} or can paginate all arg:{start:10,limit:10}
exports.getItems = function(arg, cbEach, cbDone) {
    var f = (arg.id)?{id:arg.id}:{};
    findWrap(f,arg,itemCollection,cbEach,cbDone);
}

// either gets a single encounter arg:{id:...,network:...,link:...} or multiple from just a link arg:{link:...} and can paginate all arg:{start:10,limit:10}
exports.getEncounters = function(arg, cbEach, cbDone) {
    var f = (arg.link)?{link:arg.link}:{}; // link search
    if(arg.id) f = {id:arg.network+':'+arg.id+':'+arg.link}; // individual encounter search
    delete arg.id;
    delete arg.network;
    delete arg.link;
    findWrap(f,arg,responseCollection,cbEach,cbDone)
}

function findWrap(a,b,c,cbEach,cbDone){
    console.log("a(" + JSON.stringify(a) + ") b("+ JSON.stringify(b) + ")");
    var cursor = c.find(a);
    if (b.sort) cursor.sort(b.sort);
    if (b.limit) cursor.limit(b.limit);
    cursor.each(function(err, item) {
        if (item != null) {
            cbEach(item);
        } else {
            cbDone();
        }
    });
}


// insert new (fully normalized) link, ignore or replace if it already exists? 
// {link:"http://foo.com/bar", title:"Foo", text:"Foo bar is delicious.", favicon:"http://foo.com/favicon.ico"}
exports.addLink = function(link, callback) {
//    logger.debug("addLink: "+JSON.stringify(link));
    itemCollection.findAndModify({"link":link.link}, [['_id','asc']], {$set:link}, {safe:true, upsert:true, new: true}, callback);
}

exports.updateLinkAt = function(link, at, callback) {
    itemCollection.findAndModify({"link":link}, [['_id', 'asc']], {$set:{"at":at}}, {safe:true, upser:false, new:false}, callback);
}

// insert new encounter, replace any existing
// {id:"123456632451234", network:"foo", at:"123412341234", from:"Me", fromID:"1234", orig:"http://bit.ly/foo", link:"http://foo.com/bar", via:{...}}
exports.addEncounter = function(encounter, callback) {
    // create unique id as encounter.network+':'+encounter.id+':'+link, sha1 these or something?
//    logger.debug("addEncounter: "+JSON.stringify(encounter));
    var _hash = encounter.network + ":" + encounter.id + ":" + encounter.link;
    encounter["_hash"] = _hash;
    var options = {safe:true, upsert:true, new: true};
    responseCollection.findAndModify({"_hash":_hash}, [['_id','asc']], {$set:encounter}, options, function(err, doc) {
        delete doc["_hash"];
        callback(err, doc);
    });
}

    
