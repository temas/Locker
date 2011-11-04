var util = require("util");
var sqlite = require("sqlite");
var events = require("events");
var _debug = true;

//TODO:  Support for multiple sqlite DBs and using attach to queries
var primaryDB;

/// Helper to see if a variable is a callable function
var isFunction = function(func) {
	return typeof(func) == 'function' && (!Function.prototype.call || typeof(func.call) == 'function');
}

var isObject = function(obj) {
	return typeof(obj) == "object";
}

exports.connectToDB = function(path, cbDone) {
	primaryDB = new sqlite.Database();
	var self = this;
	var ev = new events.EventEmitter();
	primaryDB.open(path, function(err) {
		if (err) {
			ev.emit("error", err);
			return;
		}
		//console.log("DB is open");
		cbDone();
	});
	return ev;
}

/// Cursor for iterating results
var ModelCursor = function(model) {
	this.model = model;

	// Set our basic internals and create methods to set them
	["query", "resultFields", "sort", "limit", "offset", "joins"].forEach(function(item) {
		this["_" + item] = undefined;
		// Check this so we're not resetting it constantly
		if (!isFunction(ModelCursor.prototype[item])) {
			ModelCursor.prototype[item] = function(value) {
				this["_" + item] = value;
				return this;
			}
		}
	})
};
ModelCursor.prototype.each = function(cbEach, cbDone) {
	//console.log("In each for " + this.model.name);
	var self = this;
	// Build our select query
	var fields = (this._resultFields && this._resultFields.length > 0) ? this._resultFields.join(",") : "*";
	// We check which our our joins to include
	var joinsToUse = fields == "*" ? this.model.joins : this.model.joins.filter(function(join) {
		
	});
	var query = {format:("SELECT " + fields + " FROM " + this.model.name), bindings:[]};
	this._buildQuery(query);
	if (_debug) {
		console.log("Query: " + query.format);
		console.log("Binds: " + query.bindings.toString());
	}
	//console.dir(this);
	var ev = new events.EventEmitter();
	primaryDB.query(query.format, query.bindings, function(err, row) {
		if (err) {
			ev.emit("error", err);
			return;
		}
		// All the rows done
		if (row === undefined) {
			cbDone.call(self);
			return;
		}
		cbEach.call(self, new self.model.ModelEntry(row));
	});
	return ev;
};
ModelCursor.prototype.one = function(cbOne) {
	var result;
	// TODO:  Some more error checking
	return this.each(function(item) { result = item; }, function() {cbOne(result)});
}
ModelCursor.prototype.remove = function(entry, cbDone) {
	//TODO:  impl
	var query = {format:("DELETE  FROM " + this.model.name), bindings:[]};
	this._buildQuery(query);
	if (_debug) {
		console.log("Query: " + query.format);
		console.log("Binds: " + query.bindings.toString());
	}
	return this._basicQuery(query, cbDone);
};
ModelCursor.prototype.update = function(entry, cbDone) {
	//TODO: impl
	var query = {format:("UPDATE " + this.model.name), bindings:[]};
	query.format += " SET ";
	var hasFirst = false
	for (var k in entry._dirtyFields) {
		if (!entry._dirtyFields.hasOwnProperty(k)) continue;
		if (hasFirst) query.format += ","
		query.format += k + "=?";
		query.bindings.push(entry._dirtyFields[k]); 
		hasFirst = true;
	}
	if (!this._query) {
		this._query = {};
		this._query[entry.model.keys[0]] = entry.row[entry.model.keys[0]];
	}
	this._buildQuery(query);
	return this._basicQuery(query, function() {
		// Reset our dirty fields and carry on
		this._dirtyFields = {};
		cbDone();
	});
};
//--
// cbDone(error, lastInsertedId)
//--
ModelCursor.prototype.insert = function(entry, cbDone) {
	var query = {format:("INSERT INTO " + this.model.name), bindings:[]};
	var columns = [];
	var values = [];
	for (var k in entry._dirtyFields) {
		if (!entry._dirtyFields.hasOwnProperty(k)) continue;
		columns.push(k);
		values.push("?");
		query.bindings.push(entry._dirtyFields[k]); 
	}
	query.format += " (" + columns.join(",") + ") VALUES (" + values.join(",") + ")"
	var ev = this._basicQuery(query, function(err) {
		// Reset the dirty fields and return the inserted id
		this._dirtyFields = {};
		primaryDB.execute("SELECT last_insert_rowid() AS last", function(err, rows) {
			if (err) {
				ev.emit("error", err);
				return;
			}
			cbDone(undefined, rows[0].last);
		});
	});
	return ev;
};
ModelCursor.prototype._basicQuery = function(query, cbDone) {
	if (_debug) {
		console.log("Query: " + query.format);
		console.log("Binds: " + query.bindings.toString());
	}
	var ev = new events.EventEmitter();
	primaryDB.execute(query.format, query.bindings, function(err, rows) {
		if (err) {
			ev.emit("error", err);
			return;
		}
		cbDone();
	});
	return ev;
};
ModelCursor.prototype._buildQuery = function(query) {
	// TODO: Only accepts 1 joined table right now 
	if (this._joins) {
		this._joins.build(query);
	}
	// The where clause
	query.format += " WHERE ";
	var where = isFunction(this._query) ? this.query.build(query) : Ops.and(this._query).build(query);
	if (this._sort) {
		query.format += " ORDER BY ";
		var hasFirst
		for (var k in this._sort) {
			if (this._sort.hasOwnProperty(k)) {
				if (hasFirst) query.format += ","
				query.format += k + (this._sort[k] > 1 ? " ASC" : " DESC");
			}
		}
	}
	if (this._limit) {
		query.format += " LIMIT "
		if (this._offset) query.format += this._offset.toString() + ","
		query.format += this._limit;
	}
	return query;
};

/// The model
var Model = function(name, spec) {
	this.name = name;
	this.spec = spec;
	this.keys = [];
	this.joins = [];
	var self = this;
	this.ModelEntry = function(row) {
		this.model = self;
		this.row = row;
		this._dirtyFields = {};
	}
	this.ModelEntry.prototype.update = function(fields) {
		for (var k in fields) {
			if (fields.hasOwnProperty(k) && self.spec.hasOwnProperty(k)) {
				this._dirtyFields[k] = fields[k];
			}
		}
	};
	this.ModelEntry.prototype.remove = function(cbDone) {
		var cursor = new ModelCursor(self);
		cursor.remove(this, cbDone);
	}
	this.ModelEntry.prototype.insert = function(cbDone) {
		var cursor = new ModelCursor(self);
		cursor.insert(this, cbDone);
	};
	this.ModelEntry.prototype.save = function(cbDone) {
		var cursor = new ModelCursor(self);
		if (this.row === undefined) {
			return cursor.insert(this, cbDone);
		} else {
			return cursor.update(this, cbDone);
		}
	}
	function addBasicProp(key) {
		Object.defineProperty(self.ModelEntry.prototype, key, {
			get:function() {
				if (this._dirtyFields.hasOwnProperty(key)) {
					return this._dirtyFields[key];
				} else {
					return this.row[key];
				}
			},
			set:function(value) {
				this._dirtyFields[key] = value;
			}
		});
	}
	function addCallableProp(key) {
		Object.defineProperty(self.ModelEntry.prototype, key, {
			get:function() {
				return spec[key].type(this, self);
			}
		})
	}
	for (var k in spec) {
		if (!spec.hasOwnProperty(k)) continue;
		//console.log("Adding " + k + " to ModelEntry");
		// We call these indirectly due to the loop closure issue of javascript
		if (spec[k].hasOwnProperty("primaryKey")) {
			this.keys.push(k);
		}
		// This is getting gnarly
		if (spec[k].hasOwnProperty("join")) {
			this.joins.push({alias:k, func:spec[k].type});
		} else if (spec[k].hasOwnProperty("type")) {
			addCallableProp(k);
		} else {
			addBasicProp(k);
		}
	}
	// TODO: Process the spec into this.fields
}
Model.prototype.count = function(cb) {
	primaryDB.execute("SELECT COUNT(*) AS count FROM " + this.name, function(err, rows) {
		if (err || !rows || rows.length < 1) {
			cb(err || true);
		}
		cb(null, rows[0].count)
	})
};
Model.prototype.find = function(expressions) {
	var cursor = new ModelCursor(this);
	cursor.query(expressions);
	return cursor;
};
Model.prototype.new = function() {
	return new this.ModelEntry();
};
Model.prototype.clear = function(cbDone) {
	primaryDB.execute("DELETE FROM " + this.name, function(err, rows) {
		cbDone(err);
	});
};
Model.prototype.create = function(cbDone) {
	var checkTableQuery = "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' UNION ALL SELECT name FROM sqlite_temp_master WHERE type IN ('table','view') ORDER BY 1";
	var self = this;
	primaryDB.execute(checkTableQuery, function(err, rows) {
		if (rows.filter(function(row) { return row.name == self.name; }).length > 0) {
			if (cbDone) cbDone();
			return;
		}
		var fields = [];
		for (var k in self.spec) {
			if (!self.spec.hasOwnProperty(k)) continue;
			console.log("Creating key: " + k);
			console.dir(self.spec[k]);
			var specEntry = self.spec[k];
			var field = {name:k};
			if (typeof(specEntry) == "object" && specEntry.hasOwnProperty("type")) {
				if (specEntry.hasOwnProperty("primaryKey")) field.primaryKey = specEntry.primaryKey;
				if (specEntry.hasOwnProperty("autoIncrement")) field.autoIncrement = specEntry.autoIncrement;
				specEntry = specEntry.type;
			}
			// Spec entries are either a direct function or an object with a create member, nothing else
			console.log(specEntry.create);
			if (isFunction(specEntry.create)) {
				console.log("Building the type");
				field.type = specEntry.create();
				fields.push(field);
			}
		}
		var sql = "CREATE TABLE " + self.name + " (";
		sql += fields.map(function(entry) { 
			return "'" + entry.name + "' " + entry.type + (entry.primaryKey ? " PRIMARY KEY" : "") + (entry.autoIncrement ? " AUTOINCREMENT" : "");
		}).join(",");
		sql += ")";
		if (_debug) console.log(sql);
		primaryDB.execute(sql, function(err, rows) {
			if (cbDone) cbDone(err);
		})
	});
};
exports.Model = Model;



/// Core operations supported by the expression builder
//--  A basic comparison between a field and a value
function ComparisonOp(operator, value) {
	this.operator = operator;
	this.expression = value;
}
ComparisonOp.prototype.build = function(query) {
	query.format += this.operator;
	if (isFunction(this.expression)) {
		this.expression.call(query);
	} else {
		query.format += this.expression;
	}
};
//-- A basic boolean operation on a series of expressions
function BooleanOp(type, expressions) {
	this.type = type;
	this.expressions = expressions;
}
BooleanOp.prototype.build = function(query) {
	var hasFirst = false;
	for (var x in this.expressions) {
		if (!this.expressions.hasOwnProperty(x)) continue;
		if (hasFirst) query.format += " " + this.type + " ";
		var expression = this.expressions[x];
		if (isFunction(expression.build)) {
			query.format += x;
			expression.build.call(this, query);
		} else {
			query.format += x + " = ?";
			query.bindings.push(expression);
		}
		hasFirst = true;
	}
}
Ops = {
	gt:function(value) {
		return new ComparisonOp(">", value);
	},
	gte:function(value) {
		return new ComparisonOp(">=", value);
	},
	lt:function(value) {
		return new ComparisonOp("<", value);
	},
	lte:function(value) {
		return new ComparisonOp("<=", value);
	},
	ne:function(value) {
		return new ComparisonOp("!=", value);
	},
	or:function(expressions) {
		return new BooleanOp("OR", expressions);
	},
	and:function(expressions) {
		return new BooleanOp("AND", expressions);
	}
};
exports.Ops = Ops;

/************************************************************************************
/ Joins are so awesome
*/
var InnerJoin = function(entry, parentModel, childModel) {
	this.entry = entry;
	this.parentModel = parentModel;
	this.childModel = childModel;

	var self = this;
	this.ProxyEntry = function(proxiedEntry) {
		this.entry = proxiedEntry;
	}
	util.inherits(this.ProxyEntry, childModel.ModelEntry);
	this.ProxyEntry.prototype.save = function(cbDone) {
		console.log("*** Save it via proxy" + util.inspect(this, true, 3));
		this.entry.save(function(err, lastInsertID){
			if (err) {
				cbDone(err);
				return;
			}
			var joinTable = self.parentModel.name + "_" + self.childModel.name;
			var query = "INSERT INTO " + joinTable + " (" + self.childModel.name + "_id," + self.parentModel.name + "_id) VALUES (?,?)";
			console.log("Query:" + query);
			console.log("Binds: " + [lastInsertID, self.entry.id]);
			primaryDB.execute(query, [lastInsertID, self.entry.id], function(error, rows){
				if (error) {
					cbDone(error);
					return;
				}
				cbDone();
			})
		})
	};
}
InnerJoin.prototype.build = function(query) {
	var joinTable = this.parentModel.name + "_" + this.childModel.name;
	var key = joinTable + "." + this.childModel.name + "_id";
	query.format += " INNER JOIN " + joinTable + " ON " + key + "=id"; 
};
InnerJoin.prototype.find = function(query) {
	var joinTable = this.parentModel.name + "_" + this.childModel.name;
	var key = joinTable + "." + this.parentModel.name + "_id";
	if (isFunction(query)) {
		var joinId = {};
		joinId[key] = this.entry.id;
		query = Ops.and([joinId].concat(query));
	} else {
		if (!query) query = {};
		query[key] = this.entry.id;
	}
	return this.childModel.find.call(this.childModel, query).joins(this)
};
InnerJoin.prototype.new = function() {
	return new this.ProxyEntry(this.childModel.new());
};
//-- Methods to use in your model to do relationships
exports.hasMany = function(model) {
	return {
		create:function() {
			console.log("should create a hasMany")
		},
		type:function(childModel) {
			return function(entry, parentModel) {
				return new InnerJoin(entry, parentModel, childModel);
			}
		}
	};
}

exports.hasOne = function(model)  {
	if (!model || !model.spec) throw new Error("The child model is not fully defined.");
	var primaryKey = undefined;
	Object.keys(model.spec).forEach(function(key) {
		if (model.spec[key].primaryKey) {
			primaryKey = key;
		}
	});
	if (!primaryKey) throw new Error("The child model did not have a primary key.");
	return {
		type:{
			create:function() {
				return model.spec[primaryKey].type.create();
			}
			/*
			function(childModel) {
			return function(entry, parentModel) {
				var joinEntry = new childModel.ModelEntry();
				entry.rows.forEach(function(row) {
					consosle.dir(row);
				})
				return joinEntry;
			}
			*/
		},
		join:true
	};
}

/// Core supported types
Types = {
	String:{
		create:function() {
			return "text";
		}
	},
	Date:{
		create:function() {
			return "integer";
		}
	},
	Number:{
		create:function() {
			return "integer";
		}
	},
	Text:{
		create:function() {
			return "text";
		}
	},
	PrimaryKey:function(type) {
		return {
			create:function() {
				return type.create() + " PRIMARY KEY";
			}
		};
	},
	AutoIncrement:function(type) {
		return {
			create:function() {
				return type.create() + " AUTOINCREMENT";
			}
		};
	}
};
exports.Types = Types;

