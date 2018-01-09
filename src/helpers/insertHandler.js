import _ from 'lodash';
import Builder from '../builders/OrientDbQueryBuilder';
import Resolver from '../resolvers/OrientDbQueryResolver';
import {
  extractParams,
  extractRid,
  emitResults,
  getParameteredIdsOfTemplate,
  flattenExtend,
} from './helperFunctions';
import OperationTypes from '../enums/OperationTypes';
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
export default function insertHandler(io, db, room, roomHash) {
  const t0 = performance.now();
  const resolver = new Resolver(db, room.templates, room.queries, {}, true);
  resolver.resolve(room.queryParams).then(data => {
    _.set(
      global,
      `counter.publications.${room.publicationName}.counter`,
      _.get(global, `counter.publications.${room.publicationName}.counter`, 0) + 1,
    );
    _.set(
      global,
      `counter.publications.${room.publicationNameWithParams}.counter`,
      _.get(global, `counter.publications.${room.publicationNameWithParams}.counter`, 0) + 1,
    );
    const t1 = performance.now();
    console.log(`DB call triggered by ${room.publicationNameWithParams}: ${t1 - t0} milliseconds`);
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
  });
}
