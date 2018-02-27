'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _OrientDbQueryResolver = require('../resolvers/OrientDbQueryResolver');

var _OrientDbQueryResolver2 = _interopRequireDefault(_OrientDbQueryResolver);

var _helperFunctions = require('./helperFunctions');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _require = require('perf_hooks'),
    performance = _require.performance;

var deepDifference = require('deep-diff');
/**
 * Handles inserts from the live queries.
 *
 * @param db
 * @param template
 * @param insertedObject
 * @param cache
 */

var insertHandler = function insertHandler(io, db, room, roomHash) {
  if (_lodash2.default.includes(global.roomHashesUpdating, room.hash)) {
    if (!_lodash2.default.includes(global.roomHashesToUpdate, room.hash)) {
      global.roomHashesToUpdate = _lodash2.default.concat(global.roomHashesToUpdate, room.hash);
    }
    return;
  }
  global.roomHashesUpdating = _lodash2.default.concat(global.roomHashesUpdating, room.hash);
  var t0 = performance.now();
  var resolver = new _OrientDbQueryResolver2.default(db, room.templates, room.queries, {}, true);
  resolver.resolve(room.queryParams).then(function (data) {
    _lodash2.default.set(global, 'counter.publications.' + room.publicationName + '.counter', _lodash2.default.get(global, 'counter.publications.' + room.publicationName + '.counter', 0) + 1);
    _lodash2.default.set(global, 'counter.publicationsWithFullName.' + room.publicationNameWithParams + '.counter', _lodash2.default.get(global, 'counter.publicationsWithFullName.' + room.publicationNameWithParams + '.counter', 0) + 1);
    var t1 = performance.now();

    global.counter.durations.push({
      publicationName: room.publicationName,
      duration: _lodash2.default.round(t1 - t0)
    });

    console.log('DB call triggered by ' + room.publicationNameWithParams + ': ' + (t1 - t0) + ' milliseconds');
    var convertedData = _lodash2.default.map(data, function (d) {
      return {
        collectionName: d.collectionName,
        data: _lodash2.default.map(d.data, function (da) {
          _lodash2.default.unset(da, '@rid');
          _lodash2.default.unset(da, '@version');
          _lodash2.default.unset(da, '@class');
          return _lodash2.default.assign(da, (0, _defineProperty3.default)({}, '__publicationNameWithParams', [room.publicationNameWithParams]));
        })
      };
    });
    var serverCache = room.serverCache;

    var differences = _lodash2.default.filter(_lodash2.default.map(convertedData, function (cv, i) {
      return {
        collectionName: cv.collectionName,
        data: _lodash2.default.concat(_lodash2.default.filter(
        //look for differences
        _lodash2.default.map(cv.data, function (da) {
          if (_lodash2.default.find(serverCache[i].data || [], ['rid', da.rid])) {
            return {
              rid: da.rid,
              differences: deepDifference(_lodash2.default.find(serverCache[i].data || [], ['rid', da.rid]), da)
            };
          } else {
            return da;
          }
        }), function (d) {
          return _lodash2.default.size(_lodash2.default.keys(d)) > 2 || _lodash2.default.size(_lodash2.default.keys(d.differences)) > 0;
        }), _lodash2.default.filter(_lodash2.default.map(serverCache[i].data, function (da) {
          if (_lodash2.default.find(cv.data, ['rid', da.rid]) || da.rid === undefined) {
            return false;
          } else {
            return {
              removeFromSub: room.publicationNameWithParams,
              rid: da.rid.toString()
            };
          }
        }), function (o) {
          return o !== false;
        }))
      };
    }), function (changeSet) {
      return _lodash2.default.size(changeSet.data) > 0;
    });

    if (differences !== undefined && _lodash2.default.size(differences) > 0) {
      // new serverCache
      room.serverCache = convertedData;
      room.cache = _lodash2.default.filter(_lodash2.default.uniq(_lodash2.default.flatten(_lodash2.default.map(data, 'cache'))), function (c) {
        return !_lodash2.default.startsWith(c, '#-2');
      });

      if (_lodash2.default.size(room.cache) === 0) {
        (0, _helperFunctions.getParameteredIdsOfTemplate)(room.templates, room.params, {}, true).then(function (value) {
          room.cache = value;
        });
      }
      (0, _helperFunctions.emitResults)(io, roomHash, room, 'change', differences);
    }
    global.roomHashesUpdating = _lodash2.default.filter(global.roomHashesUpdating, function (rH) {
      return rH !== room.hash;
    });
    if (_lodash2.default.includes(global.roomHashesToUpdate, room.hash)) {
      global.roomHashesToUpdate = _lodash2.default.filter(global.roomHashesToUpdate, function (rH) {
        return rH !== room.hash;
      });
      insertHandler(io, db, room, room.hash);
    }
  });
};

exports.default = insertHandler;