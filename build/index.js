'use strict';

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _socket = require('socket.io');

var _socket2 = _interopRequireDefault(_socket);

var _liveQueryHandler = require('./helpers/liveQueryHandler');

var _liveQueryHandler2 = _interopRequireDefault(_liveQueryHandler);

var _insertHandler = require('./helpers/insertHandler');

var _insertHandler2 = _interopRequireDefault(_insertHandler);

var _helperFunctions = require('./helpers/helperFunctions');

var _OperationTypes = require('./enums/OperationTypes');

var _OperationTypes2 = _interopRequireDefault(_OperationTypes);

var _OrientDbQueryBuilder = require('./builders/OrientDbQueryBuilder');

var _OrientDbQueryBuilder2 = _interopRequireDefault(_OrientDbQueryBuilder);

var _OrientDbQueryResolver = require('./resolvers/OrientDbQueryResolver');

var _OrientDbQueryResolver2 = _interopRequireDefault(_OrientDbQueryResolver);

var _objectHash = require('object-hash');

var _objectHash2 = _interopRequireDefault(_objectHash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var app = new _express2.default();
var server = _http2.default.createServer(app);
var io = new _socket2.default(server, {
  pingInterval: 10000,
  pingTimeout: 5000
});
var config = void 0;
var db = void 0;
global.roomHashesUpdating = [];
global.roomHashesToUpdate = [];
global.updates = 0;
global.liveQueryTokens = [];
global.objectCache = {};
global.counter = {
  dbCalls: 0,
  updates: 0,
  rooms: 0,
  clients: 0,
  publications: {},
  publicationsWithFullName: {},
  durations: []
};

/**
 * Initializes the Goldminejs server with given config and publications
 * @param config Configuration object for Goldmine-Server
 * @param publications Publications for Goldmine-Server
 */

//TODO: Validate publications
//TODO: Validate Config
var init = function init(Config, publications) {
  global.orientDBConfig = Config.database;
  config = Config;
  var done = require('./db/OrientDbConnection').default(Config);
  if (!global.db) {
    setTimeout(function () {
      if (!global.db) {
        console.log('Connection failed');
      } else {
        startQuerries(Config, publications);
      }
    }, 10000);
  }
  startQuerries(Config, publications);
};

/**
 * Starts all livequerries and keeps track of socketIo, updates
 */
var startQuerries = function () {
  var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(Config, publications) {
    var connections;
    return _regenerator2.default.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            server.listen(Config.port, function () {
              console.log('WEB SOCKET LISTENING ON:', Config.port);
            });

            if (Config.logging.statistics === true && typeof Config.logging.repeat === 'number') {
              setInterval(function () {
                global.counter.rooms = _lodash2.default.size(_lodash2.default.keys(io.sockets.adapter.rooms));
                global.counter.sockets = _lodash2.default.size(io.sockets.sockets);
                if (Config.logging.custom) {
                  Config.logging.custom(global.counter);
                } else {
                  console.log(new Date().toLocaleString() + '\n        Rooms: ' + global.counter.rooms + '\n        Sockets: ' + global.counter.sockets + '\n        MemoryTotal: ' + (process.memoryUsage().rss / (1024 * 1024)).toFixed(2) + 'MB\n        Speed: \n            ' + global.counter.dbCalls / (Config.logging.repeat / 1000) + ' dbCalls/s (total: ' + global.counter.dbCalls + ')\n            ' + global.counter.updates / (Config.logging.repeat / 1000) + ' updates/s (total: ' + global.counter.updates + ')');
                }

                global.counter.dbCalls = 0;
                global.counter.updates = 0;
                global.counter.publications = {};
                global.counter.publicationsWithFullName = {};
                global.counter.durations = [];
              }, Config.logging.repeat);
            }
            // The variable connections keeps track on
            // which publications the client is subscribed.
            connections = {};

            // ---------------------------------------------------------------------------------------------------------------------
            // ---------------------------------------------------------------------------------------------------------------------

            // Start livequeries for all classes

            _context2.next = 5;
            return (0, _liveQueryHandler2.default)(io, 'V', _lodash2.default.get(Config, 'logging.updates', false));

          case 5:
            _context2.next = 7;
            return (0, _liveQueryHandler2.default)(io, 'E', _lodash2.default.get(Config, 'logging.updates', false));

          case 7:

            // global
            //   .nextDB()
            //   .query('SELECT expand(classes) FROM metadata:schema')
            //   .then(res => {
            //     // For each defined class create a livequery
            //     _.forEach(res, obj => {
            //       // Only classes that were defined by yourself
            //       if (obj.superClass === 'V') {
            //         collectionTypes.push({
            //           name: obj.name,
            //           type: Types.VERTEX,
            //         });
            //         liveQueryHandler(io, db, obj, _.get(Config, 'logging.updates', false));
            //       } else if (obj.superClass === 'E') {
            //         collectionTypes.push({
            //           name: obj.name,
            //           type: Types.EDGE,
            //         });
            //         liveQueryHandler(io, db, obj, _.get(Config, 'logging.updates', false));
            //       }
            //     });
            //   });

            // ---------------------------------------------------------------------------------------------------------------------
            // ---------------------------------------------------------------------------------------------------------------------

            // Keeps connection open with OrientDB.

            setInterval(function () {
              global.db.query('SELECT _id FROM V LIMIT 1').catch(function () {
                console.error("Couldn't keep database connection alive!");
              });
            }, 60 * 1000);

            // ---------------------------------------------------------------------------------------------------------------------
            // ---------------------------------------------------------------------------------------------------------------------

            io.sockets.on('connection', function () {
              var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(socket) {
                var authentication;
                return _regenerator2.default.wrap(function _callee$(_context) {
                  while (1) {
                    switch (_context.prev = _context.next) {
                      case 0:
                        if (!Config.auth) {
                          _context.next = 5;
                          break;
                        }

                        _context.next = 3;
                        return Config.auth.validator(socket.handshake.query);

                      case 3:
                        authentication = _context.sent;


                        if (!authentication) {
                          socket.disconnect('Failed to authenticate token ', socket.id);
                        } else {
                          socket.decoded = authentication;
                          socket.emit('authenticated');
                        }

                      case 5:

                        connections[socket.id] = [];

                        if (Config && Config.auth && Config.auth.force === true) {
                          setTimeout(function () {
                            if (!socket.decoded) {
                              if (_lodash2.default.get(Config, 'logging.authentication', false)) {
                                console.log('SOCKET Failed to authorize ', socket.id);
                              }
                              socket.disconnect('Authentication is needed to connect to this websocket');
                            }
                          }, Config.auth.time || 60000);
                        }
                        if (_lodash2.default.get(Config, 'logging.connections', false)) {
                          console.log('CLIENT CONNECTED:', socket.id);
                        }

                        socket.on('pingConnection', function (data) {
                          socket.emit('pongConnection', data);
                        });

                        // -----------------------------------------------------
                        // -----------------------------------------------------

                        socket.on('subscribe', function (payload) {
                          if (_lodash2.default.get(Config, 'logging.subscriptions', false)) {
                            console.log('NEW SUBSCRIPTION:', payload.publicationNameWithParams);
                          }

                          var publicationName = (0, _helperFunctions.extractPublicationName)(payload.publicationNameWithParams);

                          // Check if publication exists.
                          if (!publications.hasOwnProperty(publicationName)) {
                            if (_lodash2.default.get(Config, 'logging.subscriptions', false)) {
                              console.log('GoldmineJS: Couldn\'t find the publication: \'' + publicationName + '\'');
                            }
                            return;
                          }
                          var publicationNameWithParams = payload.publicationNameWithParams;

                          // publicationObject
                          var publication = publications[publicationName];

                          // Build params for subscription
                          var params = (0, _helperFunctions.extractParams)(publicationNameWithParams);
                          // Apply client params over server params only when client has priority
                          if (_lodash2.default.find(publication, ['priority', 'client'])) {
                            params = _lodash2.default.merge(socket.decoded, params);
                          } else {
                            params = _lodash2.default.merge(params, socket.decoded);
                          }

                          // Convert all templates in the publication to db queries.
                          var queryBuilds = new _OrientDbQueryBuilder2.default(publication, params, socket.decoded, publicationNameWithParams).build();

                          // Queries
                          var queries = queryBuilds.statements;

                          //templates
                          var templates = queryBuilds.templates;

                          // Params for the query
                          var queryParams = queryBuilds.statementParams;

                          var room = {
                            queries: queries,
                            queryParams: queryParams,
                            publicationNameWithParams: publicationNameWithParams
                          };

                          // room already exists
                          if (_lodash2.default.has(io.sockets.adapter.rooms, (0, _objectHash2.default)(room))) {
                            //emits the serverdata to the new member of the room without refetching
                            socket.emit(payload.publicationNameWithParams, {
                              type: _OperationTypes2.default.INIT,
                              data: io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].serverCache,
                              publicationNameWithParams: publicationNameWithParams
                            });

                            if (payload.isReactive) {
                              // Add publication to client's personal placeholder.
                              if (connections[socket.id]) {
                                connections[socket.id].push(room);
                              }

                              // Add socket to publication.
                              socket.join((0, _objectHash2.default)(room));
                              if (_lodash2.default.get(Config, 'logging.publications', false)) {
                                console.log('joined', (0, _objectHash2.default)(room));
                              }
                            }

                            return;
                          }

                          if (_lodash2.default.get(Config, 'logging.publications', false)) {
                            console.log('-----------------------------------------------');
                            console.log('PUBLICATION: ' + publicationNameWithParams);
                            console.log('QUERIES:');
                            console.log(queries);
                            console.log(queryParams);
                            console.log('-----------------------------------------------');
                          }

                          // Resolve the initial queries and send the responses.
                          new _OrientDbQueryResolver2.default(db, templates, queries, socket.decoded).resolve(queryParams).then(function (data) {
                            var sendeableData = _lodash2.default.map(data, function (d) {
                              return {
                                collectionName: d.collectionName,
                                data: _lodash2.default.map(d.data, function (da) {
                                  _lodash2.default.unset(da, '@version');
                                  _lodash2.default.unset(da, '@class');
                                  _lodash2.default.unset(da, '@rid');
                                  return _lodash2.default.assign(da, (0, _defineProperty3.default)({}, '__publicationNameWithParams', [publicationNameWithParams]));
                                })
                              };
                            });
                            // Build payload.
                            var responsePayload = {
                              type: _OperationTypes2.default.INIT,
                              data: sendeableData,
                              publicationNameWithParams: publicationNameWithParams
                            };

                            // Flattens all cache to a single array and return the unique ids
                            var cache = _lodash2.default.filter(_lodash2.default.uniq(_lodash2.default.flatten(_lodash2.default.map(data, 'cache'))), function (c) {
                              return !_lodash2.default.startsWith(c, '#-2');
                            });

                            // Send data to client who subscribed.
                            if (_lodash2.default.get(Config, 'logging.publications', false)) {
                              console.log('emitting');
                            }
                            socket.emit(payload.publicationNameWithParams, responsePayload);
                            if (payload.isReactive) {
                              // Add publication to client's personal placeholder.
                              if (connections[socket.id]) {
                                connections[socket.id].push(room);
                              }
                              // Add socket to publication.
                              socket.join((0, _objectHash2.default)(room));
                              // }

                              if (_lodash2.default.get(Config, 'logging.publications', false)) {
                                console.log('joined', (0, _objectHash2.default)(room));
                              }
                              if (io.sockets.adapter.rooms[(0, _objectHash2.default)(room)]) {
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].cache = cache;
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].decoded = socket.decoded;
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].hash = (0, _objectHash2.default)(room);
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].serverCache = sendeableData;
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].queryParams = queryParams;
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].publicationNameWithParams = publicationNameWithParams;
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].publicationName = publicationName;
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].queries = queries;
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].params = _lodash2.default.filter(params, function (a) {
                                  return !_lodash2.default.isBoolean(a);
                                });
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].templates = templates;
                                io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].executeQuery = _lodash2.default.throttle(_insertHandler2.default, 100, {
                                  leading: false,
                                  trailing: true
                                });
                                if (_lodash2.default.size(cache) === 0) {
                                  (0, _helperFunctions.getParameteredIdsOfTemplate)(templates, params, socket.decoded).then(function (value) {
                                    if (io.sockets.adapter.rooms[(0, _objectHash2.default)(room)]) {
                                      io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].cache = value;
                                      io.sockets.adapter.rooms[(0, _objectHash2.default)(room)].params = params;
                                    }
                                  });
                                }
                              }
                            }
                          });
                        });

                        // -----------------------------------------------------
                        // -----------------------------------------------------

                        socket.on('unsubscribe', function (payload) {
                          if (_lodash2.default.get(Config, 'logging.subscriptions', false)) {
                            console.log('REMOVING SUBSCRIPTION:', payload.publicationNameWithParams);
                          }

                          var publicationName = (0, _helperFunctions.extractPublicationName)(payload.publicationNameWithParams);

                          // Check if room exists.
                          if (!publications.hasOwnProperty(publicationName)) {
                            return;
                          }

                          var roomToRemove = _lodash2.default.first(_lodash2.default.pullAt(connections[socket.id], _lodash2.default.findIndex(connections[socket.id], ['publicationNameWithParams', payload.publicationNameWithParams])));

                          // Remove socket from socket.io publication room.
                          if (roomToRemove) {
                            socket.leave((0, _objectHash2.default)(roomToRemove));
                          }
                        });

                        socket.on('disconnect', function () {
                          if (_lodash2.default.get(Config, 'logging.connections', false)) {
                            console.log('CLIENT DISCONNECTED:', socket.id);
                          }
                          delete connections[socket.id];
                        });

                      case 12:
                      case 'end':
                        return _context.stop();
                    }
                  }
                }, _callee, undefined);
              }));

              return function (_x3) {
                return _ref2.apply(this, arguments);
              };
            }());

            // ---------------------------------------------------------------------------------------------------------------------
            // ---------------------------------------------------------------------------------------------------------------------

          case 9:
          case 'end':
            return _context2.stop();
        }
      }
    }, _callee2, undefined);
  }));

  return function startQuerries(_x, _x2) {
    return _ref.apply(this, arguments);
  };
}();

var closeAll = function () {
  var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee4() {
    return _regenerator2.default.wrap(function _callee4$(_context4) {
      while (1) {
        switch (_context4.prev = _context4.next) {
          case 0:
            _context4.next = 2;
            return Promise.all(_lodash2.default.map(global.liveQueryTokens, function () {
              var _ref4 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3(token) {
                return _regenerator2.default.wrap(function _callee3$(_context3) {
                  while (1) {
                    switch (_context3.prev = _context3.next) {
                      case 0:
                        _context3.next = 2;
                        return global.db.query('live unsubscribe ' + token);

                      case 2:
                        return _context3.abrupt('return', _context3.sent);

                      case 3:
                      case 'end':
                        return _context3.stop();
                    }
                  }
                }, _callee3, undefined);
              }));

              return function (_x4) {
                return _ref4.apply(this, arguments);
              };
            }()));

          case 2:
            console.warn('GOLDMINE-SERVER is shutting down this process (you called goldmine.closeAll somewhere)');
            process.exit(0);

          case 4:
          case 'end':
            return _context4.stop();
        }
      }
    }, _callee4, undefined);
  }));

  return function closeAll() {
    return _ref3.apply(this, arguments);
  };
}();

var optimize = function () {
  var _ref5 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee8(publication) {
    var extendsAmount, builder, wherePaths;
    return _regenerator2.default.wrap(function _callee8$(_context8) {
      while (1) {
        switch (_context8.prev = _context8.next) {
          case 0:
            if (_lodash2.default.isArray(publication)) {
              console.log('NO ARRAYS ALLOWED: Only optimize one publication object at once please');
            } else {
              extendsAmount = _lodash2.default.size(publication.extend);
              builder = new _OrientDbQueryBuilder2.default(publication);
              wherePaths = builder.createWherePaths(publication);

              setTimeout((0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee7() {
                var solutions;
                return _regenerator2.default.wrap(function _callee7$(_context7) {
                  while (1) {
                    switch (_context7.prev = _context7.next) {
                      case 0:
                        if (global.db) {
                          _context7.next = 4;
                          break;
                        }

                        console.log('please check database connection');
                        _context7.next = 8;
                        break;

                      case 4:
                        _context7.next = 6;
                        return Promise.all(_lodash2.default.map(wherePaths, function () {
                          var _ref7 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee6(wherePath) {
                            return _regenerator2.default.wrap(function _callee6$(_context6) {
                              while (1) {
                                switch (_context6.prev = _context6.next) {
                                  case 0:
                                    _lodash2.default.map(builder.tempParams, function () {
                                      var _ref8 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee5(value, property) {
                                        return _regenerator2.default.wrap(function _callee5$(_context5) {
                                          while (1) {
                                            switch (_context5.prev = _context5.next) {
                                              case 0:
                                                wherePath = _lodash2.default.replace(wherePath, new RegExp(':goldmine' + property, 'g'), typeof value === 'string' ? "'" + value + "'" : JSON.stringify(value));

                                              case 1:
                                              case 'end':
                                                return _context5.stop();
                                            }
                                          }
                                        }, _callee5, undefined);
                                      }));

                                      return function (_x7, _x8) {
                                        return _ref8.apply(this, arguments);
                                      };
                                    }());
                                    _context6.t0 = _lodash2.default;
                                    _context6.next = 4;
                                    return global.db.query('' + wherePath);

                                  case 4:
                                    _context6.t1 = _context6.sent;
                                    _context6.t2 = _context6.t0.size.call(_context6.t0, _context6.t1);
                                    _context6.t3 = wherePath;
                                    return _context6.abrupt('return', {
                                      query: _context6.t2,
                                      path: _context6.t3
                                    });

                                  case 8:
                                  case 'end':
                                    return _context6.stop();
                                }
                              }
                            }, _callee6, undefined);
                          }));

                          return function (_x6) {
                            return _ref7.apply(this, arguments);
                          };
                        }()));

                      case 6:
                        solutions = _context7.sent;

                        console.log(solutions);

                      case 8:
                      case 'end':
                        return _context7.stop();
                    }
                  }
                }, _callee7, undefined);
              })), 5000);
            }

          case 1:
          case 'end':
            return _context8.stop();
        }
      }
    }, _callee8, undefined);
  }));

  return function optimize(_x5) {
    return _ref5.apply(this, arguments);
  };
}();

module.exports = { init: init, closeAll: closeAll, optimize: optimize };