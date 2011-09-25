var request = require('request');
var async = require('async');
var logger = require(__dirname + "/../../Common/node/logger").logger;
var lutil = require('lutil');
var url = require('url');

var dataStore, locker;

// internally we need these for happy fun stuff
exports.init = function(l, dStore){
    dataStore = dStore;
    locker = l;
}

// manually walk and reindex all possible link sources
exports.update = function(locker, callback) {
    dataStore.clear(function(){
        callback();
        locker.providers(['link/facebook', 'status/twitter', 'checkin/foursquare'], function(err, services) {
            if (!services) return;
            services.forEach(function(svc) {
                if(svc.provides.indexOf('link/facebook') >= 0) {
                    getData("home/facebook", svc.id);
                } else if(svc.provides.indexOf('status/twitter') >= 0) {
                    getData("tweets/twitter", svc.id);
                    getData("timeline/twitter", svc.id);
                    getData("mentions/twitter", svc.id);
                } else if(svc.provides.indexOf('checkin/foursquare') >= 0) {
                    getData("recents/foursquare", svc.id);
                    getData("checkin/foursquare", svc.id);
                }
            });
        });
    });
}

// generate unique id for any item based on it's event
//> u.parse("type://network/context?id=account#46234623456",true);
//{ protocol: 'type:',
//  slashes: true,
//  host: 'network',
//  hostname: 'network',
//  href: 'type://network/context?id=account#46234623456',
//  hash: '#46234623456',
//  search: '?id=account',
//  query: { id: 'account' },
//  pathname: '/context' }
function getIdr(type, via, data)
{
    var r = {slashes:true};
    r.host = type.substr(type.indexOf('/')+1);
    r.pathname = type.substr(0, type.indexOf('/'));
    r.query = {id: via}; // best proxy of account id right now
    if(r.host === 'twitter')
    {
        r.hash = (r.pathname === 'related') ? data.id : data.id_str;
        r.protocol = 'tweet';
    }
    if(r.host === 'facebook')
    {
        r.hash = data.id;
        r.protocol = 'post';
    }
    if(r.host === 'foursquare')
    {
        r.hash = data.id;
        r.protocol = 'checkin';
    }
    return url.parse(url.format(r)); // make sure it's consistent
}

// take an idr and turn it into a generic network-global reference
// this could be network-specific transformation and need data
function idr2idn(idr, data)
{
    delete idr.query; delete idr.search; // not account specific
    delete idr.pathname; // ids are generic across any context
    return url.parse(url.format(idr));
}

// normalize events a bit
exports.processEvent = function(event, callback)
{
    if(!callback) callback = function(){};
    var idr = getIdr(event.type, event.via, event.obj.data);
    masterMaster(idr, event.obj.data, callback);
}

function isItMe(idr)
{
    if(idr.protocol == 'tweet:' && idr.pathname == '/tweets') return true;
    if(idr.protocol == 'checkin:' && idr.pathname == '/checkin') return true;
    return false;
}

// figure out what to do with any data
function masterMaster(idr, data, callback)
{
    if(typeof data != 'object') return callback();
    logger.debug("MM\t"+url.format(idr)+"\t"+typeof data);
    // look for idr in Items.refs, if found then skip to response processing
    // compose new idn (network id) from idr+data
    // look for idn in Items.ids, if found then add idr and skip to response processing
    // compose new Item, +idr, +response
    var id = url.format(idr);
    var item = {at: new Date().getTime(), ids:{}};
    item.ids[id] = true;
    item.ids[url.format(idr2idn(idr, data))] = true;
    item.me = isItMe(idr);
    dataStore.addItem(item, function(err, doc){
        logger.debug("ADDED\t"+JSON.stringify(doc));
        callback();
    })
}

// go fetch data from sources to bulk process
function getData(type, svcId) {
    var subtype = type.substr(0, type.indexOf('/'));
    var lurl = locker.lockerBase + '/Me/' + svcId + '/getCurrent/' + subtype;
    request.get({uri:lurl, json:true}, function(err, resp, arr) {
        async.forEachSeries(arr,function(a,cb){
            var idr = getIdr(type, svcId, a);
            masterMaster(idr, a, cb);
        },function(err){
            logger.debug("processed "+arr.length+" items from "+lurl+" "+(err)?err:"");
        });
    });
}

