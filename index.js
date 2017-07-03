import http from 'http';
import Express from 'express';
import Server from 'socket.io';
import _ from 'lodash';
import dbConnector from './src/db/OrientDbConnection';
import liveQueryHandler from './src/helpers/liveQueryHandler';
import { extractPublicationName, extractParams } from './src/helpers/helperFunctions';
import Types from './src/enums/OperationTypes';
import QueryBuilder from './src/builders/OrientDbQueryBuilder';
import QueryResolver from './src/resolvers/OrientDbQueryResolver';

const app = new Express();
const server = http.createServer(app);
const io = new Server(server);

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
//   }
// }

//TODO: Validate publications
//TODO: Validate Config
const init = ( Config, publications ) => {
  const db = new dbConnector(config.database);

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
      if (_.size(obj.clusterIds) > 2) {
        collectionTypes.push(obj.name);
        liveQueryHandler(io, db, obj.name, publications, cache, insertCache);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------------------------------

  // Keeps connection open with OrientDB.

  setInterval(() => {
    db.query('SELECT _id FROM V LIMIT 1').catch(() => {
      console.log("Couldn't keep database connection alive!");
    });
  }, 60000);

  // ---------------------------------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------------------------------

  io.sockets.on('connection', socket => {
    console.log('CLIENT CONNECTED:', socket.id);

    // Initiate placeholder for the client's future publications.
    connections[socket.id] = [];

    // -----------------------------------------------------
    // -----------------------------------------------------

    socket.on('subscribe', payload => {
      console.log('NEW SUBSCRIPTION:', payload.publicationNameWithParams);

      const publicationName = extractPublicationName(payload.publicationNameWithParams);

      // Check if publication exists.
      if (!publications.hasOwnProperty(publicationName)) {
        console.log(`GoldmineJS: Couldn't find the publication: '${publicationName}'`);
        return;
      }

      // Create cache for publication if it does not exists.
      if (!cache.hasOwnProperty(payload.publicationNameWithParams)) {
        cache[payload.publicationNameWithParams] = new Set();
      }

      const publication = publications[publicationName];

      // Build params.
      let params = extractParams(payload.publicationNameWithParams);

      // Convert all templates in the publication to db queries.
      const queries = new QueryBuilder(publication).build();

      if (Config.debug) {
        console.log('-----------------------------------------------');
        console.log(`PUBLICATION: ${payload.publicationNameWithParams}`);
        console.log('QUERIES:');
        console.log(queries);
        console.log('-----------------------------------------------');
      }

      // Resolve the queries and send the responses.
      new QueryResolver(db, publication, queries)
        .resolve(params, cache[payload.publicationNameWithParams])
        .then(data => {
          // Build payload.
          const responsePayload = {
            type: Types.INIT,
            data: data,
          };

          // Send data to client who subscribed.
          console.log('emitting');
          socket.emit(payload.publicationNameWithParams, responsePayload);
        });

      // Handles publication when is has to be reactive.
      if (payload.isReactive) {
        // Add publication to client's personal placeholder.
        connections[socket.id].push(payload.publicationNameWithParams);

        // Add socket to publication.
        socket.join(payload.publicationNameWithParams);
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

    // -----------------------------------------------------
    // -----------------------------------------------------

    socket.on('disconnect', () => {
      console.log('CLIENT DISCONNECTED:', socket.id);

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
