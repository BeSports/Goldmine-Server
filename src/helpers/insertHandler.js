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
 * @param rooms
 * @param insertedObject
 * @param cache
 */
export default function insertHandler(io, db, room, roomHash, collectionType, res) {
  const id = res.content['_id'];
  const resolver = new Resolver(db, room.templates, room.queries, {}, true);
  const fields = _.concat(_.map(_.filter(room.templates, t => {
    return _.lowerCase(t.collection) === _.lowerCase(collectionType.name);
  }), 'fields'));

  resolver.resolve(room.queryParams).then(result => {
    let data = _.find(result[0].data, { _id: id });

    if (data !== undefined) {
      io.sockets.adapter.rooms[roomHash].cache.push(id);
      emitResults(
        io,
        roomHash,
        room.publicationNameWithParams,
        OperationTypes.INSERT,
        data['@class'],
        undefined,
        data,
        fields,
      );
    }
  });
}
