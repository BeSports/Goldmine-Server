import _ from 'lodash';
import OperationTypes from '../enums/OperationTypes';
import {
  emitResults,
  extractRid,
  getCollectionName,
  getEdgeFieldsForExtendOverRelation,
  flattenExtend,
} from './helperFunctions';
import Types from '../enums/Types';
import insertHandler from './insertHandler';
import * as pluralize from 'pluralize';

export default function(io, db, collectionType) {
  const QUERY = `LIVE SELECT FROM \`${collectionType.name}\``;
  db
    .liveQuery(QUERY)
    .on('live-insert', res => {
      const rid = extractRid(res);
      console.log(`INSERT DETECTED (${collectionType.name})(${rid})`);
      // inserted an edge
      let roomsWithTemplatesForInsert = _.filter(
        _.map(io.sockets.adapter.rooms, (value, key) => {
          return _.find(flattenExtend(value.templates), [
            _.includes(res.content['@class'], '_') ? 'relation' : 'collection',
            collectionType.name,
          ])
            ? { room: value, hash: key }
            : null;
        }),
        x => {
          return x !== null;
        },
      );
      _.forEach(roomsWithTemplatesForInsert, (room, key) => {
        insertHandler(io, db, room.room, room.hash, collectionType.name);
      });
    })
    .on('live-update', res => {
      if (res.version === 1) {
        return;
      }
      const rid = extractRid(res);
      console.log(`UPDATE DETECTED (${collectionType.name})(${rid})(version:${res.version})`);
      let roomsWithTemplatesForInsert = _.filter(
        _.map(io.sockets.adapter.rooms, (value, key) => {
          return _.find(flattenExtend(value.templates), [
            _.includes(res.content['@class'], '_') ? 'relation' : 'collection',
            collectionType.name,
          ])
            ? { room: value, hash: key }
            : null;
        }),
        x => {
          return x !== null;
        },
      );
      _.forEach(roomsWithTemplatesForInsert, (room, key) => {
        insertHandler(io, db, room.room, room.hash, collectionType.name);
      });
    })
    .on('live-delete', res => {
      const rid = extractRid(res);
      console.log(`DELETE DETECTED (${collectionType.name})(${rid})`);
      let roomsWithTemplatesForInsert = _.filter(
        _.map(io.sockets.adapter.rooms, (value, key) => {
          return _.find(flattenExtend(value.templates), [
            _.includes(res.content['@class'], '_') ? 'relation' : 'collection',
            collectionType.name,
          ])
            ? { room: value, hash: key }
            : null;
        }),
        x => {
          return x !== null;
        },
      );
      _.forEach(roomsWithTemplatesForInsert, (room, key) => {
        insertHandler(io, db, room.room, room.hash, collectionType.name);
      });
    });
}
