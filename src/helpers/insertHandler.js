import _ from 'lodash';
import Builder from '../builders/OrientDbQueryBuilder';
import Resolver from '../resolvers/OrientDbQueryResolver';
import {extractParams, extractRid, emitResults, getCollectionName} from './helperFunctions';
import OperationTypes from "../enums/OperationTypes";

/**
 * Handles inserts from the live queries.
 *
 * @param db
 * @param template
 * @param rooms
 * @param insertedObject
 * @param cache
 */
export default function insertHandler(io, db, template, collection, rooms, insertedObject, cache, cacheEdges) {

  if (collection.type !== template.collection.type) {
    return;
  }

  const id = insertedObject.content['_id'];
  const queries = new Builder([template]).build();
  const resolver = new Resolver(db, [template], queries);

  _.forEach(rooms, room => {
    const params = extractParams(room);

    resolver
      .resolve(params, cache[room])
      .then(result => {
        let data = _.find(result[0].data, {'_id': id});

        if (data !== undefined) {
          cache[room].add(id);
          emitResults(
            io,
            room,
            OperationTypes.INSERT,
            getCollectionName(template),
            undefined,
            data,
            template.fields,
          );
        }
      });
  });
}
