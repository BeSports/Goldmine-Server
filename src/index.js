import _ from 'lodash';
import http from 'http';
import Express from 'express';
import Server from 'socket.io';
import liveQueryHandler from './helpers/liveQueryHandler';
import { extractPublicationName, extractParams, serverParamsUsed } from './helpers/helperFunctions';
import Types from './enums/OperationTypes';
import QueryBuilder from './builders/OrientDbQueryBuilder';
import QueryResolver from './resolvers/OrientDbQueryResolver';
import hash from 'object-hash';

const app = new Express();
const server = http.createServer(app);
const io = new Server(server);
let db;
/**
 * Initializes the Goldminejs server with given config and publications
 * @param config Configuration object for Goldmine-Server
 * @param publications Publications for Goldmine-Server
 */

// Example config object
// config = {
//   debug: true,
//   port: 3020,
//   database: {
//     host: 'localhost',
//     port: 2424,
//     name: 'Tolkien-Arda',
//     username: 'admin',
//     password: 'admin'
//   },
// }

//TODO: Validate publications
//TODO: Validate Config
const init = function(Config, publications) {
  global.orientDBConfig = Config.database;
  db = require('./db/OrientDbConnection').default(Config);
  if (!db) {
    setTimeout(() => {
      if (!db) {
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
const startQuerries = function(Config, publications) {
  server.listen(Config.port, () => {
    console.log('WEB SOCKET LISTENING ON:', Config.port);
  });

  if(Config.logging.statistics === true && typeof Config.logging.repeat === "number") {
    setInterval(
      () => {
        console.log(`${new Date().toISOString()} Rooms: ${_.size(_.keys(io.sockets.adapter.rooms))} Sockets: ${_.size(io.sockets.sockets)}`);
      }, Config.logging.repeat
    );
  }



  // Keeps track of all new inserts which could
  // be interesting for future updates.
  const insertCache = [];

  // The variable connections keeps track on
  // which publications the client is subscribed.
  const connections = {};

  const collectionTypes = [];

  // ---------------------------------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------------------------------

  // Start livequeries for all classes
  db.query('SELECT expand(classes) FROM metadata:schema').then(res => {
    // For each defined class create a livequery
    _.forEach(res, obj => {
      // Only classes that were defined by yourself
      if (obj.superClass === 'V') {
        collectionTypes.push({
          name: obj.name,
          type: Types.VERTEX,
        });
        liveQueryHandler(io, db, obj, insertCache);
      } else if (obj.superClass === 'E') {
        collectionTypes.push({
          name: obj.name,
          type: Types.EDGE,
        });
        liveQueryHandler(io, db, obj, insertCache);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------------------------------

  // Keeps connection open with OrientDB.

  setInterval(() => {
    db.query('SELECT _id FROM V LIMIT 1').catch(() => {
      console.error("Couldn't keep database connection alive!");
    });
  }, 60000);

  // ---------------------------------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------------------------------

  io.sockets.on('connection', socket => {
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
      const queryBuilds = new QueryBuilder(publication, params, socket.decoded).build();

      // Queries
      const queries = queryBuilds.statements;

      //templates
      const templates = queryBuilds.templates;

      // Params for the query
      const queryParams = queryBuilds.statementParams;

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
        // Build payload.
        const responsePayload = {
          type: Types.INIT,
          data: _.map(data, d => {
            return {
              collectionName: d.collectionName,
              data: d.data,
            };
          }),
        };

        // Flattens all cache to a single array and return the unique ids
        const cache = _.uniq(_.flatten(_.map(data, 'cache')));

        // Send data to client who subscribed.
        if (_.get(Config, 'logging.publications', false)) {
          console.log('emitting');
        }

        socket.emit(payload.publicationNameWithParams, responsePayload);
        if (payload.isReactive) {
          // Add publication to client's personal placeholder.
          const room = {
            queries,
            queryParams,
            publicationNameWithParams,
          };
          connections[socket.id].push(room);

          // Add socket to publication.
          socket.join(hash(room));
          if (_.get(Config, 'logging.publications', false)) {
            console.log('joined', hash(room));
          }
          io.sockets.adapter.rooms[hash(room)].cache = cache;
          io.sockets.adapter.rooms[hash(room)].queryParams = queryParams;
          io.sockets.adapter.rooms[hash(room)].publicationNameWithParams = publicationNameWithParams;
          io.sockets.adapter.rooms[hash(room)].queries = queries;
          io.sockets.adapter.rooms[hash(room)].templates = templates;
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

      const roomToRemove = _.first(_.pullAt(connections[socket.id], _.findIndex(connections[socket.id], ['publicationNameWithParams', payload.publicationNameWithParams])));

      // Remove socket from socket.io publication room.
      socket.leave(hash(roomToRemove));
    });

    // ----------------------------------------------------
    // ----------------------------------------------------

    if (Config.auth) {
      socket.on('authenticate', data => {
        const authentication = Config.auth.validator(data);
        if (!authentication) {
          socket.disconnect('Failed to authenticate token ', socket.id);
        } else {
          socket.decoded = authentication;
        }
      });
    }

    // -----------------------------------------------------
    // -----------------------------------------------------

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

module.exports = { init };
