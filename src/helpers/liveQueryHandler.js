import _ from 'lodash';
import OperationTypes from '../enums/OperationTypes';
import { emitResults, extractRid, getCollectionName } from './helperFunctions';
import Types from '../enums/Types';
import insertHandler from './insertHandler';
import * as pluralize from 'pluralize';

export default function(io, db, collectionType, insertCache) {
  const QUERY = `LIVE SELECT FROM \`${collectionType.name}\``;

  const handler = function(roomHash, room, res, type, collectionType) {
    if (_.lowerCase(res.content['@class']) === _.lowerCase(collectionType.name)) {
      const fields = _.uniq(
        _.flatten(
          _.map(
            _.filter(room.templates, temp => {
              return _.lowerCase(collectionType.name) === _.lowerCase(temp.collection);
            }),
            'fields',
          ),
        ),
      );

      emitResults(
        io,
        roomHash,
        room.publicationNameWithParams,
        OperationTypes.UPDATE,
        res.content['@class'],
        undefined,
        res.content,
        fields
      );

      if (type === OperationTypes.DELETE) {
        _.remove(io.sockets.adapter.rooms[roomHash].cache, _.get(res, 'content._id'));
      }
    }
  };

  db
    .liveQuery(QUERY)
    .on('live-insert', res => {
      console.log(`INSERT DETECTED (${collectionType.name})`);

      const rid = extractRid(res);
      _.forEach(io.sockets.adapter.rooms, (room, roomHash) => {
        if (
          _.find(_.get(room, 'templates', []), t => {
            return _.lowerCase(t.collection) === _.lowerCase(collectionType.name);
          })
        ) {
          insertHandler(io, db, room, roomHash, collectionType, res, true);
        }
        return;
      });
    })
    .on('live-update', res => {
      console.log(`UPDATE DETECTED (${collectionType.name}), (${_.get(res, 'content._id')})`);
      const id = _.get(res, 'content._id');
      if (!id) {
        console.log('No id detected on update, could not track update');
      }

      _.forEach(io.sockets.adapter.rooms, (room, roomHash) => {
        if (_.indexOf(_.get(room, 'cache', []), id) !== -1) {
          handler(roomHash, room, res, OperationTypes.UPDATE, collectionType);
        }
      });
    })
    .on('live-delete', res => {
      console.log(`DELETE DETECTED (${collectionType.name})`);
      const id = _.get(res, 'content._id');
      if (!id) {
        console.log('No id detected on delete, could not track update');
      }
      _.forEach(io.sockets.adapter.rooms, (room, roomHash) => {
        if (_.indexOf(_.get(room, 'cache', []), id) !== -1) {
          handler(roomHash, room, res, OperationTypes.DELETE, collectionType);
        }
      });
    });
}
