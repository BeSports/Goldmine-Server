import _ from 'lodash';
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
export default function insertHandler(io, roomHash, room, res, collectionName) {
  //mainQuery
  if(_.find(_.keys(room.extendCache), res.content._id)) {
    const fields = _.flatten(_.concat(
      _.map(room.templates, temp => {
        if(_.toLower(temp.collection) === _.toLower(collectionName)) {
          return temp.fields;
        }
      }),
    ));
    emitResults(io, roomKey, room, OperationTypes.UPDATE, collectionName, res.content, fields);
  }



  // const id = res.content['_id'];
  // // TODO: optimization, remove unused templates for performance increase
  // const resolver = new Resolver(db, room.templates, room.queries, {}, true);
  // const fields = _.flatten(_.concat(
  //   _.map(
  //     _.filter(room.templates, t => {
  //       return _.lowerCase(t.collection) === _.lowerCase(collectionType.name);
  //     }),
  //     'fields',
  //   ),
  // ));


}
