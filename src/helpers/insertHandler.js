import _ from 'lodash';
import Builder from '../builders/OrientDbQueryBuilder';
import Resolver from '../resolvers/OrientDbQueryResolver';
import {
  extractParams,
  extractRid,
  emitResults,
  getCollectionName,
  flattenExtend,
} from './helperFunctions';
import OperationTypes from '../enums/OperationTypes';
const deepDifference = require('deep-diff');
/**
 * Handles inserts from the live queries.
 *
 * @param db
 * @param template
 * @param insertedObject
 * @param cache
 */
export default function insertHandler(io, db, room, roomHash, collectionName) {
  let filteredRoomQueries = [];
  let filteredRoomTemplates = [];
  let filteredIndexes = [];
  _.map(room.templates, (template, i) => {
    if (
      _.find(flattenExtend([template]), [
        _.includes(collectionName, '_') ? 'relation' : 'collection',
        collectionName,
      ])
    ) {
      filteredRoomQueries.push(room.queries[i]);
      filteredRoomTemplates.push(room.templates[i]);
      filteredIndexes.push(i);
    }
  });
  const resolver = new Resolver(db, filteredRoomTemplates, filteredRoomQueries, {}, true);
  resolver.resolve(room.queryParams).then(data => {
    const convertedData = _.map(data, d => {
      return {
        collectionName: d.collectionName,
        data: _.map(d.data, da => {
          return _.assign(da, {
            ['__publicationNameWithParams']: [room.publicationNameWithParams],
          });
        }),
      };
    });
    const serverCache = _.at(room.serverCache, filteredIndexes) ;

    const differences = _.filter(_.map(convertedData, (cv, i) => {
      return {
        collectionName: cv.collectionName,
        data: _.filter(_.map(cv.data, da => {
          return {
            rid: da.rid,
            differences: deepDifference(_.find(serverCache[i].data || {}, ['rid', da.rid]), da),
          };
        }), 'differences'),
      };
    }), changeSet => {
      return _.size(changeSet.data) > 0;
    });
    console.log('Difference object', differences);
    if (differences !== undefined) {
      // new serverCache
      _.forEach(filteredIndexes, (setAtIndex, fromIndex) => {
        room.serverCache[setAtIndex] = convertedData[fromIndex];
      });
      room.cache = _.filter(_.uniq(_.flatten(_.map(data, 'cache'))), c => {
        return !_.startsWith(c, '#-2');
      });
      emitResults(io, roomHash, room, 'change', differences);
    }
  });
}
