var lsql = require(__dirname + "/../Common/node/lsql");

var Encounters = new lsql.Model("Encounters", {
	_hash:lsql.Types.String,
	at:lsql.Types.Date,
	from:lsql.Types.String,
	fromId:lsql.Types.String,
	id:lsql.Types.String,
	link:lsql.Types.String,
	network:lsql.Types.String,
	orig:lsql.Types.String,
	text:lsql.Types.Text,
	via:lsql.Types.String
});

var Embed = new lsql.Model("Embed", {
	id:{type:lsql.Types.Number, primaryKey:true, autoIncrement:true},
	type:lsql.Types.String,
	version:lsql.Types.String,
	title:lsql.Types.String,
	author_name:lsql.Types.String,
	author_url:lsql.Types.String,
	provider_name:lsql.Types.String,
	provider_url:lsql.Types.String,
	cache_age:lsql.Types.Number,
	thumbnail_url:lsql.Types.String,
	thumbnail_width:lsql.Types.Number,
	thumbnail_height:lsql.Types.Number,
	url:lsql.Types.String,
	width:lsql.Types.Number,
	height:lsql.Types.Number,
	html:lsql.Types.String
});

var Links = new lsql.Model("Links", {
	link:{type:lsql.Types.String, primaryKey:true},
	at:lsql.Types.Date,
	embed:lsql.hasOne(Embed),
	favicon:lsql.Types.String,
	text:lsql.Types.String,
	title:lsql.Types.String,
	encounters:lsql.hasMany(Encounters)
});
/*
Links.prototype.getWithMostRecentEncounter = function(link) {
	this.find({"link":link}).join(Encounter, {"link":Encounter.fields.link});
};
*/

exports["Encounters"] = Encounters;
exports["Links"] = Links;
exports["Embed"] = Embed;