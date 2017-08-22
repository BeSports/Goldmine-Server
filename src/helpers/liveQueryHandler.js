import _ from 'lodash';
import OperationTypes from '../enums/OperationTypes';
import { emitResults, extractRid, getCollectionName } from './helperFunctions';
import Types from '../enums/Types';
import insertHandler from './insertHandler';
import updateHandler from './updateHandler';
import * as pluralize from 'pluralize';

export default function(io, db, collectionType) {
  const QUERY = `LIVE SELECT FROM \`${collectionType.name}\``;

  const handler = function(roomKey, room, res, type, collectionName) {
    console.log('in handler', roomKey);
    if(type === OperationTypes.UPDATE) {
      updateHandler(io, roomKey, room, res, collectionName);
    } else if (type === OperationTypes.DELETE) {
      emitResults(io, roomKey, room, type, collectionName, res.content);
    } else {
      console.log('not supported operation');
    }
  };

  db
    .liveQuery(QUERY)
    .on('live-insert', res => {
      console.log(`INSERT DETECTED (${collectionType.name})`);
      const rid = extractRid(res);
      //todo: check filter go on here
      const roomsWithTemplatesForInsert = _.filter(_.map(io.sockets.adapter.rooms, (value, key) => {
        return _.find(value.templates, ['collection', collectionType.name]) ? { room: value, hash: key } : null;
      }), x => {
        return x !== null;
      });

      _.forEach(roomsWithTemplatesForInsert, (room, key) => {
          insertHandler(
            io,
            db,
            room.room,
            room.hash,
            collectionType,
            res,
          );
        }
      );
    })
    .on('live-update', res => {
      console.log(`UPDATE DETECTED (${collectionType.name})`);

      let roomsToUpdate = [];
      _.forEach(io.sockets.adapter.rooms, (value, key) => {
        if (_.includes(value.cache, res.content._id)) {
          roomsToUpdate.push({
            key,
            value,
          });
        }
      });

      _.forEach(roomsToUpdate, room => {
        // Template - root level
        handler(
          room.key,
          room.value,
          res,
          OperationTypes.UPDATE,
          collectionType.name,
        );
      });
    })
    .on('live-delete', res => {
      console.log(`DELETE DETECTED (${collectionType.name})`);
      let roomsToRemoveFrom = [];
      _.forEach(io.sockets.adapter.rooms, (value, key) => {
        if (_.includes(value.cache, res.content._id)) {
          roomsToRemoveFrom.push({
            key,
            value,
          });
        }
      });

      _.forEach(roomsToRemoveFrom, room => {
        // Template - root level
        handler(
          room.key,
          room.value,
          res,
          OperationTypes.DELETE,
          collectionType.name,
        );
        _.remove(io.sockets.adapter.rooms[room.key].cache, res.content._id);
      });
    });
}
