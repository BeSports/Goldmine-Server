'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (config) {
  c = config;
  var server = new _orientjs2.default(config.server);
  var db = server.use(_lodash2.default.merge({ name: config.databaseName }, _lodash2.default.pick(config.server, ['username', 'password'])));
  global.db = db;
  db.on('endQuery', function (obj) {
    if (obj.input.query.indexOf('let $publicationName =') > 0) {
      global.counter.durations.push({
        publicationName: _lodash2.default.first(_lodash2.default.split(_lodash2.default.last(_lodash2.default.split(obj.input.query, 'let $publicationName = \'')), '?')),
        duration: obj.perf.query
      });
    }
  });

  _lodash2.default.times(dbLiveMax, function () {
    var db = new _orientjs2.default.ODatabase(Object.assign({ useToken: true }, _lodash2.default.merge(_lodash2.default.omit(config.server, 'pool'), { name: config.databaseName })));
    dbLiveConn.push(db);
  });

  // Keeps connection open with OrientDB.
  setInterval(function () {
    global.db.query('SELECT _id FROM V LIMIT 1').catch(function () {
      console.error("Couldn't keep database connection alive!");
    });
  }, 60 * 1000);

  setInterval(function () {
    global.nextLiveDB().query('SELECT _id FROM V LIMIT 1').catch(function () {
      console.error("Couldn't keep database connection alive!");
    });
  }, 60 * 1000 / dbLiveMax);
};

var _orientjs = require('orientjs');

var _orientjs2 = _interopRequireDefault(_orientjs);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var dbLiveConn = [];
var dbLiveNext = 0;
var dbLiveMax = 2;
var c = void 0;

global.nextLiveDB = function () {
  dbLiveNext++;
  if (dbLiveNext >= dbLiveMax) {
    dbLiveNext = 0;
  }
  return dbLiveConn[dbLiveNext];
};

global.restartLiveDB = function (sessionId) {
  var index = _lodash2.default.findIndex(dbLiveConn, ['sessionId', sessionId]);
  dbLiveConn[index] = new _orientjs2.default.ODatabase(Object.assign({ useToken: true }, _lodash2.default.merge(_lodash2.default.omit(c.server, 'pool'), { name: c.databaseName })));
};