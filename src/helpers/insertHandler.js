import _ from 'lodash';
import Builder from '../builders/OrientDbQueryBuilder';
import Resolver from '../resolvers/OrientDbQueryResolver';
import { extractParams, extractRid, emitResults, getCollectionName } from './helperFunctions';
import OperationTypes from '../enums/OperationTypes';

/**
 * Handles inserts from the live queries.
 *
 * @param db
 * @param template
 * @param insertedObject
 * @param cache
 */
export default function insertHandler(io, db, room, roomHash, collectionType, res) {
  const id = res.content['_id'];
  const rid = extractRid(res);

  let filteredRoomQueries = [];
  const filteredTemplates = _.filter(room.templates, (t, i) => {
    if (_.lowerCase(t.collection) === _.lowerCase(collectionType.name)) {
      filteredRoomQueries.push(room.queries[i]);
      return true;
    }
    return false;
  });
  const resolver = new Resolver(db, filteredTemplates, filteredRoomQueries, {}, true);
  const fields = _.filter(_.flatten(_.concat(_.map(filteredTemplates, 'fields'))), f => {
    return !!f;
  });

  resolver.resolve(room.queryParams).then(result => {
    let data = _.find(_.flatten(_.map(result, 'data')), ['_id', id]);
    if (data !== undefined) {
      io.sockets.adapter.rooms[roomHash].cache.push(rid);
      emitResults(io, roomHash, room, OperationTypes.INSERT, collectionType.name, data, undefined);
    }
  });
}
