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

var Links = new lsql.Model("Links", {
	link:{type:lsql.Types.String, primaryKey:true},
	at:lsql.Types.Date,
	embedID:lsql.Types.Number,
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