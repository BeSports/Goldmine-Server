import _ from 'lodash';
import OperationTypes from '../enums/OperationTypes';
import { emitResults, extractRid, getCollectionName, getEdgeFieldsForExtendOverRelation } from './helperFunctions';
import Types from '../enums/Types';
import insertHandler from './insertHandler';
import * as pluralize from 'pluralize';

export default function(io, db, collectionType) {
  const QUERY = `LIVE SELECT FROM \`${collectionType.name}\``;

  const handler = function(roomKey, room, res, type, collectionName, rid) {
    if (type === OperationTypes.UPDATE) {
      if (_.includes(res.content['@class'], '_')) {
        const edgeFields = getEdgeFieldsForExtendOverRelation(room.templates, collectionName);
        const resObject = res.content;
        resObject.rid = rid;
        const collection = _.get(_.find(room.templates, (t) => {
          return _.find(t.extend, ['relation', collectionName]);
        }), 'collection');
        if(!collection) {
          return;
        }
        emitResults(io, roomKey, room, type, collection, resObject, edgeFields);
      } else {
        const fields = _.flatten(
          _.concat(
            _.map(room.templates, temp => {
              if (_.toLower(temp.collection) === _.toLower(collectionName)) {
                return temp.fields;
              }
            }),
          ),
        );
        emitResults(io, roomKey, room, type, collectionName, res.content, fields);
      }
    } else if (type === OperationTypes.DELETE) {
      emitResults(io, roomKey, room, type, collectionName, res.content);
    } else {
      console.log('not supported operation');
    }
  };

  db
    .liveQuery(QUERY)
    .on('live-insert', res => {
      const rid = extractRid(res);
      console.log(`INSERT DETECTED (${collectionType.name})(${rid})`);
      if (_.includes(res.content['@class'], '_')) {
        return;
      }
      //todo: check filter go on here
      const roomsWithTemplatesForInsert = _.filter(
        _.map(io.sockets.adapter.rooms, (value, key) => {
          return _.find(value.templates, ['collection', collectionType.name])
            ? { room: value, hash: key }
            : null;
        }),
        x => {
          return x !== null;
        },
      );

      _.forEach(roomsWithTemplatesForInsert, (room, key) => {
        insertHandler(io, db, room.room, room.hash, collectionType, res);
      });
    })
    .on('live-update', res => {
      if (res.version === 1) {
        return;
      }
      let roomsToUpdate = [];
      const rid = extractRid(res);
      res.content.rid = rid;
      console.log(`UPDATE DETECTED (${collectionType.name})(${rid})(version:${res.version})`);
      if (_.includes(res.content['@class'], '_')) {
        const inV = '#' + res.content.in.cluster + ':' + res.content.in.position;
        const outV = '#' + res.content.out.cluster + ':' + res.content.out.position;
        _.forEach(io.sockets.adapter.rooms, (value, key) => {
          if (_.includes(value.cache, inV) || _.includes(value.cache, outV)) {
            roomsToUpdate.push({
              key,
              value,
              relatedRID: _.includes(value.cache, inV) ? inV : outV
            });
          }
        });
      } else {
        _.forEach(io.sockets.adapter.rooms, (value, key) => {
          if (_.includes(value.cache, rid)) {
            roomsToUpdate.push({
              key,
              value,
            });
          }
        });
      }

      _.forEach(roomsToUpdate, room => {
        // Template - root level
        handler(room.key, room.value, res, OperationTypes.UPDATE, collectionType.name, _.get(room, 'relatedRID', null));
      });

      // _.forEach(possiblyInNeedOfInsert, (room, key) => {
      //     insertHandler(
      //       io,
      //       db,
      //       room.room,
      //       room.hash,
      //       collectionType,
      //       res,
      //     );
      //   }
      // );
    })
    .on('live-delete', res => {
      const rid = extractRid(res);
      console.log(`DELETE DETECTED (${collectionType.name})(${rid})`);
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
        handler(room.key, room.value, res, OperationTypes.DELETE, collectionType.name);
        _.remove(io.sockets.adapter.rooms[room.key].cache, res.content._id);
      });
    });
}
