import _ from 'lodash';
import http from 'http';
import Express from 'express';
import Server from 'socket.io';
import liveQueryHandler from './helpers/liveQueryHandler';
import { extractPublicationName, extractParams, serverParamsUsed } from './helpers/helperFunctions';
import Types from './enums/OperationTypes';
import QueryBuilder from './builders/OrientDbQueryBuilder';
import QueryResolver from './resolvers/OrientDbQueryResolver';

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

  // ---------------------------------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------------------------------

  // The purpose of the cache is to determine
  // for a certain publication which objects
  // are bound.
  const cache = {};

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
        liveQueryHandler(io, db, obj, publications, cache, insertCache);
      } else if (obj.superClass === 'E') {
        collectionTypes.push({
          name: obj.name,
          type: Types.EDGE,
        });
        liveQueryHandler(io, db, obj, publications, cache, insertCache);
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
    if (Config && Config.auth && Config.auth.force === true) {
      setTimeout(() => {
        if (!socket.decoded) {
          if (_.get(Config, 'logging.authentication', false)) {
            console.log('SOCKET Failed to authorize ', socket.id);
          }
          socket.disconnect('Authorization is needed to connect to this websocket');
        }
      }, Config.auth.time || 60000);
    }
    if (_.get(Config, 'logging.connections', false)) {
      console.log('CLIENT CONNECTED:', socket.id);
    }

    // Initiate placeholder for the client's future publications.
    connections[socket.id] = [];

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
      let publication = publications[publicationName];

      // Force to create new cache if the server priority is on
      if (
        !_.find(publication, ['priority', 'client']) && serverParamsUsed(publication, socket.decoded)
      ) {
        publicationNameWithParams += `&socketId=${socket.id}`;
        cache[publicationNameWithParams] = new Set();
        // Create cache for publication if it does not exists.
      } else if (!cache.hasOwnProperty(publicationNameWithParams)) {
        cache[publicationNameWithParams] = new Set();
      }

      // publication = _.filter(publication, (template) => {
      //   if(!template.permission || template.permission()) {
      //     return template;
      //   }
      //   return false;
      // });

      // Build params.
      let params = extractParams(publicationNameWithParams);
      // Apply client params over server params only when client has priority
      if (_.find(publication, ['priority', 'client'])) {
        params = _.merge(socket.decoded, params);
      } else {
        params = _.merge(params, socket.decoded);
      }
      // Convert all templates in the publication to db queries.
      const queryBuilds = new QueryBuilder(publication, params, socket.decoded).build();
      const queries = queryBuilds.statements;

      const queryParams = queryBuilds.statementParams;

      if (_.get(Config, 'logging.publications', false)) {
        console.log('-----------------------------------------------');
        console.log(`PUBLICATION: ${publicationNameWithParams}`);
        console.log('QUERIES:');
        console.log(queries);
        console.log(queryParams);
        console.log('-----------------------------------------------');
      }


      // Resolve the queries and send the responses.
      new QueryResolver(db, publication, queries, socket.decoded, params)
        .resolve(queryParams, cache[publicationNameWithParams])
        .then(data => {
          // Build payload.
          const responsePayload = {
            type: Types.INIT,
            data: data,
          };

          // Send data to client who subscribed.
          if (_.get(Config, 'logging.publications', false)) {
            console.log('emitting');
          }
          socket.emit(payload.publicationNameWithParams, responsePayload);
        });

      // Handles publication when is has to be reactive.
      if (payload.isReactive) {
        // Add publication to client's personal placeholder.
        connections[socket.id].push(publicationNameWithParams);

        // Add socket to publication.
        socket.join(publicationNameWithParams);
      }
    });

    // -----------------------------------------------------
    // -----------------------------------------------------

    socket.on('unsubscribe', payload => {
      const publicationName = extractPublicationName(payload.publicationNameWithParams);

      // Check if room exists.
      if (!publications.hasOwnProperty(publicationName)) {
        return;
      }

      // Remove socket from socket.io publication room.
      socket.leave(payload.publicationNameWithParams);

      // Check if other clients are using cache.
      if (io.sockets.adapter.rooms[payload.publicationNameWithParams] === undefined) {
        delete cache[payload.publicationNameWithParams];
      }

      // Remove publication from connections.
      const index = connections[socket.id].indexOf(payload.publicationNameWithParams);

      if (index === -1) {
        return;
      }

      connections[socket.id].splice(index, 1);
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

      _.forEach(connections[socket.id], publicationNameWithParams => {
        if (io.sockets.adapter.rooms[publicationNameWithParams] === undefined) {
          delete cache[publicationNameWithParams];
        }
      });
      delete connections[socket.id];
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------------------------------
};

module.exports = { init };
