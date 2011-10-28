var lsql = require("./Common/node/lsql");

var query = {format:"", bindings:[]};
lsql.Ops.and({"test":1, "value":"test"}).build(query);
console.dir(query);
var m = new lsql.Model("testing", {"id":lsql.Types.String, "encounters":lsql.hasMany(new lsql.Model("testing2"))});
lsql.connectToDB("./testing.sqlite", function(err) {
	m.create();
	/*
	m.count(function(err, count) {
		console.log("Count is " + count);
	});
	m.find({id:"a1b2c3"}).sort({"id":1}).limit(10).each(function(row) {
		console.log("Row id: " + row.id);
		var newEncounter = row.encounters.new();
		newEncounter.insert(function(err) {
			console.log(err);
		});
		row.encounters.find().sort({"at":-1}).limit(1).one(function(err, item) {	
			console.log("encounters item is " + item);
		});
	}, function() {
		if (err) {
			console.log("Error on find: " + err);
			return;
		}
		console.log("All rows done");
		/*
		var entry = m.new()
		entry.id = "testa";
		entry.insert(function(err) {
			if (err) console.log(err.message);
			console.log("Done with insert");
		});
	});
	*/
});

