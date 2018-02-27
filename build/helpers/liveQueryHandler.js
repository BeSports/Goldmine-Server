'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _helperFunctions = require('./helperFunctions');

var _shallowequal = require('shallowequal');

var _shallowequal2 = _interopRequireDefault(_shallowequal);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var isVertexWithEdges = function isVertexWithEdges(res) {
  var hasEdgesAndIsVertex = !_lodash2.default.includes(res.content['@class'], '_') && _lodash2.default.find(res.content, function (val, key) {
    return _lodash2.default.startsWith(key, 'out') || _lodash2.default.startsWith(key, 'in');
  });
  if (hasEdgesAndIsVertex) {
    _lodash2.default.set(global.objectCache, '[' + res.cluster + '][' + res.position + ']', omitter(res));
  }
  return hasEdgesAndIsVertex;
};

var omitter = function omitter(o) {
  return _lodash2.default.omitBy(o.content, function (val, key) {
    return _lodash2.default.startsWith(key, 'out') || _lodash2.default.startsWith(key, 'in');
  });
};

var doCache = function doCache(o, cluster, position) {
  //object is in cache and correct version

  if (_lodash2.default.isMatch(_lodash2.default.get(global.objectCache, '[' + cluster + '][' + position + ']', false), o)) {
    return false;
  }
  return true;
};

var searchForMatchingRids = function searchForMatchingRids(rooms, insertedObject, isUpdate) {
  if (_lodash2.default.includes(insertedObject.content['@class'], '_')) {
    var edgeRelatedIds = [(0, _helperFunctions.extractRid)(insertedObject.content.in), (0, _helperFunctions.extractRid)(insertedObject.content.out)];
    var valuesToSearchForInParams = _lodash2.default.flatten([_lodash2.default.values(_lodash2.default.omit(_lodash2.default.get(global.objectCache, '[' + insertedObject.content.in.cluster + '][' + insertedObject.content.in.position + ']', {}), '@class')), _lodash2.default.values(_lodash2.default.omit(_lodash2.default.get(global.objectCache, '[' + insertedObject.content.out.cluster + '][' + insertedObject.content.out.position + ']', {}), '@class'))]);
    return _lodash2.default.filter(rooms, function (room) {
      return _lodash2.default.difference(edgeRelatedIds, room.cache).length < 2 || _lodash2.default.size(_lodash2.default.difference(_lodash2.default.values(room.params), valuesToSearchForInParams)) < _lodash2.default.size(room.params) || _lodash2.default.size(_lodash2.default.filter(room.templates, function (template) {
        return _lodash2.default.has(template, 'limit') && _lodash2.default.has(template, 'orderBy') && !_lodash2.default.has(template, 'skipOrder');
      })) > 0;
    });
  } else if (isUpdate) {
    var ridToSearchFor = (0, _helperFunctions.extractRid)(insertedObject);
    return _lodash2.default.filter(rooms, function (room) {
      return _lodash2.default.includes(room.cache, ridToSearchFor);
    });
  }

  return rooms;
};

var shallowSearchForMatchingRooms = function shallowSearchForMatchingRooms(rooms, collectionName, isEdgeCheck) {
  return _lodash2.default.compact(_lodash2.default.map(rooms, function (value, key) {
    return _lodash2.default.find((0, _helperFunctions.flattenExtend)(value.templates), [isEdgeCheck ? 'relation' : 'collection', collectionName]) ? { room: value, hash: key } : null;
  }));
};

var deepSearchForMatchingRooms = function deepSearchForMatchingRooms(rooms, collectionName, isEdgeCheck, res) {
  var oldObject = _lodash2.default.get(global.objectCache, '[' + res.cluster + '][' + res.position + ']', {});
  var toReturn = _lodash2.default.compact(_lodash2.default.map(rooms, function (value, key) {
    var relevantFlattendTemplateParts = _lodash2.default.filter((0, _helperFunctions.flattenExtend)(value.room.templates), [isEdgeCheck ? 'relation' : 'collection', collectionName]);
    var relevantFields = _lodash2.default.uniq(_lodash2.default.flatten(_lodash2.default.compact(_lodash2.default.map(relevantFlattendTemplateParts, isEdgeCheck ? 'edgeFields' : 'fields'))));
    var oldObjectRelevantFields = _lodash2.default.pick(oldObject, relevantFields);
    var newObjectRelevantFields = _lodash2.default.pick(omitter(res), relevantFields);
    var isEqualForSelectedFields = (0, _shallowequal2.default)(oldObjectRelevantFields, newObjectRelevantFields);
    return isEqualForSelectedFields ? null : value;
  }));
  _lodash2.default.set(global.objectCache, '[' + res.cluster + '][' + res.position + ']', omitter(res));
  return toReturn;
};

var liveQuery = function () {
  var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3(io, typer, shouldLog) {
    var _this = this;

    var QUERY, received, currentToken, db;
    return _regenerator2.default.wrap(function _callee3$(_context3) {
      while (1) {
        switch (_context3.prev = _context3.next) {
          case 0:
            QUERY = 'LIVE SELECT FROM `' + typer + '`';
            received = false;
            currentToken = void 0;
            db = global.nextLiveDB();

            db.liveQuery(QUERY, {
              resolver: function resolver(a, b) {
                global.liveQueryTokens.push(_lodash2.default.first(a).token);
                console.log('Live subscribed on ', typer, ' live Id: ', _lodash2.default.first(a).token);
                currentToken = _lodash2.default.first(a).token;
                return a;
              }
            }).on('live-insert', function (res) {
              if (process.env.NODE_ENV !== 'production') {
                console.log('INSERTED', res.content['@class']);
              }
              global.counter.updates++;

              if (!doCache(omitter(res), res.cluster, res.position)) {
                return;
              }
              //will be triggered on one of their edges
              if (isVertexWithEdges(res)) {
                return;
              }

              var roomsWithMatchingRids = searchForMatchingRids(io.sockets.adapter.rooms, res);

              // inserted an edge
              var roomsWithShallowTemplatesForInsert = shallowSearchForMatchingRooms(roomsWithMatchingRids, res.content['@class'], _lodash2.default.includes(res.content['@class'], '_'));

              _lodash2.default.forEach(roomsWithShallowTemplatesForInsert, function (room) {
                room.room.executeQuery(io, db, room.room, room.hash, res.content['@class']);
              });
            }).on('live-update', function (res) {
              if (!received) {
                received = true;
              }
              if (process.env.NODE_ENV !== 'production') {
                console.log('UPDATED', res.content['@class']);
              }
              global.counter.updates++;
              var rid = (0, _helperFunctions.extractRid)(res);
              if (!rid) {
                return;
              }
              if (!doCache(omitter(res), res.cluster, res.position)) {
                return;
              }

              var roomsWithMatchingRids = searchForMatchingRids(io.sockets.adapter.rooms, res, true);

              var roomsWithShallowTemplatesForInsert = shallowSearchForMatchingRooms(roomsWithMatchingRids, res.content['@class'], _lodash2.default.includes(res.content['@class'], '_'));

              var roomsWithDeepTemplatesForInsert = deepSearchForMatchingRooms(roomsWithShallowTemplatesForInsert, res.content['@class'], _lodash2.default.includes(res.content['@class'], '_'), res);

              _lodash2.default.forEach(roomsWithDeepTemplatesForInsert, function (room) {
                room.room.executeQuery(io, db, room.room, room.hash, res.content['@class'], rid);
              });
            }).on('live-delete', function (res) {
              if (process.env.NODE_ENV !== 'production') {
                console.log('DELETED', res.content['@class']);
              }
              global.updates++;
              var rid = (0, _helperFunctions.extractRid)(res);
              var roomsWithTemplatesForInsert = _lodash2.default.filter(_lodash2.default.map(io.sockets.adapter.rooms, function (value, key) {
                return _lodash2.default.find((0, _helperFunctions.flattenExtend)(value.templates), [_lodash2.default.includes(res.content['@class'], '_') ? 'relation' : 'collection', res.content['@class']]) ? { room: value, hash: key } : null;
              }), function (x) {
                return x !== null;
              });
              _lodash2.default.forEach(roomsWithTemplatesForInsert, function (room) {
                room.room.executeQuery(io, db, room.room, room.hash, res.content['@class']);
              });
            });
            _context3.next = 7;
            return global.db.query('UPDATE ' + typer + ' set goldmineTestParam = ' + Math.random() * 1000 + ' LIMIT 1').then((0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2() {
              return _regenerator2.default.wrap(function _callee2$(_context2) {
                while (1) {
                  switch (_context2.prev = _context2.next) {
                    case 0:
                      _context2.next = 2;
                      return setTimeout((0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee() {
                        return _regenerator2.default.wrap(function _callee$(_context) {
                          while (1) {
                            switch (_context.prev = _context.next) {
                              case 0:
                                if (received) {
                                  _context.next = 7;
                                  break;
                                }

                                _context.next = 3;
                                return db.close();

                              case 3:
                                _context.next = 5;
                                return restart(io, typer, shouldLog, db.sessionId);

                              case 5:
                                _context.next = 7;
                                break;

                              case 7:
                              case 'end':
                                return _context.stop();
                            }
                          }
                        }, _callee, _this);
                      })), 2500);

                    case 2:
                    case 'end':
                      return _context2.stop();
                  }
                }
              }, _callee2, _this);
            })));

          case 7:
            return _context3.abrupt('return', _context3.sent);

          case 8:
          case 'end':
            return _context3.stop();
        }
      }
    }, _callee3, this);
  }));

  return function liveQuery(_x, _x2, _x3) {
    return _ref.apply(this, arguments);
  };
}();

var restart = function () {
  var _ref4 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4(io, typer, shouldLog, sessionId) {
    return _regenerator2.default.wrap(function _callee4$(_context4) {
      while (1) {
        switch (_context4.prev = _context4.next) {
          case 0:
            global.restartLiveDB(sessionId);
            _context4.next = 3;
            return liveQuery(io, typer, shouldLog);

          case 3:
          case 'end':
            return _context4.stop();
        }
      }
    }, _callee4, undefined);
  }));

  return function restart(_x4, _x5, _x6, _x7) {
    return _ref4.apply(this, arguments);
  };
}();

exports.default = liveQuery;