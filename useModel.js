var lsql = require(__dirname + "/Common/node/lsql.js");
var models = require("./Models/linkModel.js");
//console.dir(models);
var links = models.Links;

lsql.connectToDB("links.db", function() {
	links.find({"link":"https://foursquare.com/user/13118783/checkin/4ea0989f61afd50ff5167802?s=xoVsPYIJlYXUWGrq4uHoIr9RT5k&ref=fb&source=fbwall"}).one(function(row) {
		console.dir(row);
		row.update({embedID:123456});
		row.save(function() {
			console.log("done");
		}).on("error", function(err) {
			console.error("Error saving.");
			console.dir(err);
		});
	}).on("error", function(err) {
		console.error("Error during find");
		console.dir(err);
	});
}).on("error", function(err) {
	console.error("Unable to connect to the DB");
	console.dir(err);
});