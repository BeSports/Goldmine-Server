import _ from 'lodash';
import Resolver from '../resolvers/OrientDbQueryResolver';
import { emitResults, extractParams, getParameteredIdsOfTemplate } from './helperFunctions';
const { performance } = require('perf_hooks');
const deepDifference = require('deep-diff');
/**
 * Handles inserts from the live queries.
 *
 * @param db
 * @param template
 * @param insertedObject
 * @param cache
 */

const insertHandler = (io, db, room, roomHash) => {
  if (_.includes(global.roomHashesUpdating, room.hash)) {
    if (!_.includes(global.roomHashesToUpdate, room.hash)) {
      global.roomHashesToUpdate = _.concat(global.roomHashesToUpdate, room.hash);
    }
    return;
  }
  global.roomHashesUpdating = _.concat(global.roomHashesUpdating, room.hash);
  const resolver = new Resolver(db, room.templates, room.queries, {}, true);
  resolver.resolve(room.queryParams).then(data => {
    _.set(
      global,
      `counter.publications.${room.publicationName}.counter`,
      _.get(global, `counter.publications.${room.publicationName}.counter`, 0) + 1,
    );
    _.set(
      global,
      `counter.publicationsWithFullName.${room.publicationNameWithParams}.counter`,
      _.get(
        global,
        `counter.publicationsWithFullName.${room.publicationNameWithParams}.counter`,
        0,
      ) + 1,
    );
    const convertedData = _.map(data, d => {
      return {
        collectionName: d.collectionName,
        data: _.map(d.data, da => {
          _.unset(da, '@rid');
          _.unset(da, '@version');
          _.unset(da, '@class');
          return _.assign(da, {
            ['__publicationNameWithParams']: [room.publicationNameWithParams],
          });
        }),
      };
    });
    const serverCache = room.serverCache;

    const differences = _.filter(
      _.map(convertedData, (cv, i) => {
        return {
          collectionName: cv.collectionName,
          data: _.concat(
            _.filter(
              //look for differences
              _.map(cv.data, da => {
                if (_.find(serverCache[i].data || [], ['rid', da.rid])) {
                  return {
                    rid: da.rid,
                    differences: deepDifference(
                      _.find(serverCache[i].data || [], ['rid', da.rid]),
                      da,
                    ),
                  };
                } else {
                  return da;
                }
              }),
              d => {
                return _.size(_.keys(d)) > 2 || _.size(_.keys(d.differences)) > 0;
              },
            ),
            _.filter(
              _.map(serverCache[i].data, da => {
                if (_.find(cv.data, ['rid', da.rid]) || da.rid === undefined) {
                  return false;
                } else {
                  return {
                    removeFromSub: room.publicationNameWithParams,
                    rid: da.rid.toString(),
                  };
                }
              }),
              o => {
                return o !== false;
              },
            ),
          ),
        };
      }),
      changeSet => {
        return _.size(changeSet.data) > 0;
      },
    );

    if (differences !== undefined && _.size(differences) > 0) {
      // new serverCache
      room.serverCache = convertedData;
      room.cache = _.filter(_.uniq(_.flatten(_.map(data, 'cache'))), c => {
        return !_.startsWith(c, '#-2');
      });

      if (_.size(room.cache) === 0) {
        getParameteredIdsOfTemplate(room.templates, room.params, {}, true).then(value => {
          room.cache = value;
        });
      }
      emitResults(io, roomHash, room, 'change', differences);
    }
    global.roomHashesUpdating = _.filter(global.roomHashesUpdating, rH => {
      return rH !== room.hash;
    });
    if (_.includes(global.roomHashesToUpdate, room.hash)) {
      global.roomHashesToUpdate = _.filter(global.roomHashesToUpdate, rH => {
        return rH !== room.hash;
      });
      insertHandler(io, db, room, room.hash);
    }
  });
};

export default insertHandler;
