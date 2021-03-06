import _ from 'lodash';
import http from 'http';
import Express from 'express';
import Server from 'socket.io';
import liveQueryHandler from './helpers/liveQueryHandler';
import insertHandler from './helpers/insertHandler';
import {
  extractPublicationName,
  extractParams,
  getParameteredIdsOfTemplate,
} from './helpers/helperFunctions';
import Types from './enums/OperationTypes';
import QueryBuilder from './builders/OrientDbQueryBuilder';
import QueryResolver from './resolvers/OrientDbQueryResolver';
import hash from 'object-hash';

const app = new Express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
});
let config;
let db;
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
  durations: [],
};

/**
 * Initializes the Goldminejs server with given config and publications
 * @param config Configuration object for Goldmine-Server
 * @param publications Publications for Goldmine-Server
 */

//TODO: Validate publications
//TODO: Validate Config
const init = function(Config, publications) {
  global.orientDBConfig = Config.database;
  config = Config;
  const done = require('./db/OrientDbConnection').default(Config);
  if (!global.db) {
    setTimeout(() => {
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
const startQuerries = async (Config, publications) => {
  server.listen(Config.port, () => {
    console.log('WEB SOCKET LISTENING ON:', Config.port);
  });

  if (Config.logging.statistics === true && typeof Config.logging.repeat === 'number') {
    setInterval(() => {
      global.counter.rooms = _.size(_.keys(io.sockets.adapter.rooms));
      global.counter.sockets = _.size(io.sockets.sockets);
      if (Config.logging.custom) {
        Config.logging.custom(global.counter);
      } else {
        console.log(`${new Date().toLocaleString()}
        Rooms: ${global.counter.rooms}
        Sockets: ${global.counter.sockets}
        MemoryTotal: ${(process.memoryUsage().rss / (1024 * 1024)).toFixed(2)}MB
        Speed: 
            ${global.counter.dbCalls / (Config.logging.repeat / 1000)} dbCalls/s (total: ${
          global.counter.dbCalls
        })
            ${global.counter.updates / (Config.logging.repeat / 1000)} updates/s (total: ${
          global.counter.updates
        })`);
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
  const connections = {};

  // ---------------------------------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------------------------------

  // Start livequeries for all classes
  await liveQueryHandler(io, 'V', _.get(Config, 'logging.updates', false));
  await liveQueryHandler(io, 'E', _.get(Config, 'logging.updates', false));

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

  setInterval(() => {
    global.db.query('SELECT _id FROM V LIMIT 1').catch(() => {
      console.error("Couldn't keep database connection alive!");
    });
  }, 60 * 1000);

  // ---------------------------------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------------------------------

  io.sockets.on('connection', async socket => {
    if (Config.auth) {
      const authentication = await Config.auth.validator(socket.handshake.query);

      if (!authentication) {
        socket.disconnect('Failed to authenticate token ', socket.id);
      } else {
        socket.decoded = authentication;
        socket.emit('authenticated');
      }
    }

    connections[socket.id] = [];

    if (Config && Config.auth && Config.auth.force === true) {
      setTimeout(() => {
        if (!socket.decoded) {
          if (_.get(Config, 'logging.authentication', false)) {
            console.log('SOCKET Failed to authorize ', socket.id);
          }
          socket.disconnect('Authentication is needed to connect to this websocket');
        }
      }, Config.auth.time || 60000);
    }
    if (_.get(Config, 'logging.connections', false)) {
      console.log('CLIENT CONNECTED:', socket.id);
    }

    socket.on('pingConnection', data => {
      socket.emit('pongConnection', data);
    });

    // -----------------------------------------------------
    // -----------------------------------------------------

    socket.on('subscribe', payload => {
      if (_.get(Config, 'logging.subscriptions', false)) {
        console.log('NEW SUBSCRIPTION:', payload.publicationNameWithParams);
      }

      const publicationName = extractPublicationName(payload.publicationNameWithParams);

      // Check if publication exists.
      if (!publications.hasOwnProperty(publicationName)) {
        if (_.get(Config, 'logging.subscriptions', false)) {
          console.log(`GoldmineJS: Couldn't find the publication: '${publicationName}'`);
        }
        return;
      }
      let publicationNameWithParams = payload.publicationNameWithParams;

      // publicationObject
      let publication = publications[publicationName];

      // Build params for subscription
      let params = extractParams(publicationNameWithParams);
      // Apply client params over server params only when client has priority
      if (_.find(publication, ['priority', 'client'])) {
        params = _.merge(socket.decoded, params);
      } else {
        params = _.merge(params, socket.decoded);
      }

      // Convert all templates in the publication to db queries.
      const queryBuilds = new QueryBuilder(
        publication,
        params,
        socket.decoded,
        publicationNameWithParams,
      ).build();

      // Queries
      const queries = queryBuilds.statements;

      //templates
      const templates = queryBuilds.templates;

      // Params for the query
      const queryParams = queryBuilds.statementParams;

      const room = {
        queries,
        queryParams,
        publicationNameWithParams,
      };

      // room already exists
      if (_.has(io.sockets.adapter.rooms, hash(room))) {
        //emits the serverdata to the new member of the room without refetching
        socket.emit(payload.publicationNameWithParams, {
          type: Types.INIT,
          data: io.sockets.adapter.rooms[hash(room)].serverCache,
          publicationNameWithParams,
        });

        if (payload.isReactive) {
          // Add publication to client's personal placeholder.
          if (connections[socket.id]) {
            connections[socket.id].push(room);
          }

          // Add socket to publication.
          socket.join(hash(room));
          if (_.get(Config, 'logging.publications', false)) {
            console.log('joined', hash(room));
          }
        }

        return;
      }

      if (_.get(Config, 'logging.publications', false)) {
        console.log('-----------------------------------------------');
        console.log(`PUBLICATION: ${publicationNameWithParams}`);
        console.log('QUERIES:');
        console.log(queries);
        console.log(queryParams);
        console.log('-----------------------------------------------');
      }

      // Resolve the initial queries and send the responses.
      new QueryResolver(db, templates, queries, socket.decoded).resolve(queryParams).then(data => {
        const sendeableData = _.map(data, d => {
          return {
            collectionName: d.collectionName,
            data: _.map(d.data, da => {
              _.unset(da, '@version');
              _.unset(da, '@class');
              _.unset(da, '@rid');
              return _.assign(da, {
                ['__publicationNameWithParams']: [publicationNameWithParams],
              });
            }),
          };
        });
        // Build payload.
        const responsePayload = {
          type: Types.INIT,
          data: sendeableData,
          publicationNameWithParams,
        };

        // Flattens all cache to a single array and return the unique ids
        const cache = _.filter(_.uniq(_.flatten(_.map(data, 'cache'))), c => {
          return !_.startsWith(c, '#-2');
        });

        // Send data to client who subscribed.
        if (_.get(Config, 'logging.publications', false)) {
          console.log('emitting');
        }
        socket.emit(payload.publicationNameWithParams, responsePayload);
        if (payload.isReactive) {
          // Add publication to client's personal placeholder.
          if (connections[socket.id]) {
            connections[socket.id].push(room);
          }
          // Add socket to publication.
          socket.join(hash(room));
          // }

          if (_.get(Config, 'logging.publications', false)) {
            console.log('joined', hash(room));
          }
          if (io.sockets.adapter.rooms[hash(room)]) {
            io.sockets.adapter.rooms[hash(room)].cache = cache;
            io.sockets.adapter.rooms[hash(room)].decoded = socket.decoded;
            io.sockets.adapter.rooms[hash(room)].hash = hash(room);
            io.sockets.adapter.rooms[hash(room)].serverCache = sendeableData;
            io.sockets.adapter.rooms[hash(room)].queryParams = queryParams;
            io.sockets.adapter.rooms[
              hash(room)
            ].publicationNameWithParams = publicationNameWithParams;
            io.sockets.adapter.rooms[hash(room)].publicationName = publicationName;
            io.sockets.adapter.rooms[hash(room)].queries = queries;
            io.sockets.adapter.rooms[hash(room)].params = _.filter(params, a => {
              return !_.isBoolean(a);
            });
            io.sockets.adapter.rooms[hash(room)].templates = templates;
            io.sockets.adapter.rooms[hash(room)].executeQuery = _.throttle(insertHandler, 100, {
              leading: false,
              trailing: true,
            });
            if (_.size(cache) === 0) {
              getParameteredIdsOfTemplate(templates, params, socket.decoded).then(value => {
                if (io.sockets.adapter.rooms[hash(room)]) {
                  io.sockets.adapter.rooms[hash(room)].cache = value;
                  io.sockets.adapter.rooms[hash(room)].params = params;
                }
              });
            }
          }
        }
      });
    });

    // -----------------------------------------------------
    // -----------------------------------------------------

    socket.on('unsubscribe', payload => {
      if (_.get(Config, 'logging.subscriptions', false)) {
        console.log('REMOVING SUBSCRIPTION:', payload.publicationNameWithParams);
      }

      const publicationName = extractPublicationName(payload.publicationNameWithParams);

      // Check if room exists.
      if (!publications.hasOwnProperty(publicationName)) {
        return;
      }

      const roomToRemove = _.first(
        _.pullAt(
          connections[socket.id],
          _.findIndex(connections[socket.id], [
            'publicationNameWithParams',
            payload.publicationNameWithParams,
          ]),
        ),
      );

      // Remove socket from socket.io publication room.
      if (roomToRemove) {
        socket.leave(hash(roomToRemove));
      }
    });

    socket.on('disconnect', () => {
      if (_.get(Config, 'logging.connections', false)) {
        console.log('CLIENT DISCONNECTED:', socket.id);
      }
      delete connections[socket.id];
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------------------------------
};

const closeAll = async () => {
  await Promise.all(
    _.map(global.liveQueryTokens, async token => {
      return await global.db.query(`live unsubscribe ${token}`);
    }),
  );
  console.warn(
    'GOLDMINE-SERVER is shutting down this process (you called goldmine.closeAll somewhere)',
  );
  process.exit(0);
};

module.exports = { init, closeAll };
