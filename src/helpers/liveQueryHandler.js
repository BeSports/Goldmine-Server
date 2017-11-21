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

const versionCache = {};

const omitter = o => {
  return _.omitBy(o.content, (val, key) => {
    return _.startsWith(key, 'out') || _.startsWith(key, 'in');
  });
};

const doCache = (o, cluster, position) => {
  //object is in cache and correct version
  if (_.isMatch(_.get(versionCache, `[${cluster}][${position}]`, false), o)) {
    return false;
  }
  // set it if inexistent or changed
  _.set(versionCache, `[${cluster}][${position}]`, o);
  return true;
};

export default function(io, db, collectionType, shouldLog) {
  const QUERY = `LIVE SELECT FROM \`${collectionType.name}\``;
  db
    .liveQuery(QUERY)
    .on('live-insert', res => {
      const rid = extractRid(res);

      if (!doCache(omitter(res), res.cluster, res.position)) {
        if (shouldLog) {
          console.log(`INSERT SKIPPED (${collectionType.name})(${rid})`);
        }
        return;
      }
      if (shouldLog) {
        console.log(`INSERT DETECTED (${collectionType.name})(${rid})`);
      }
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

      _.forEach(roomsWithTemplatesForInsert, room => {
        insertHandler(io, db, room.room, room.hash, collectionType.name);
      });
    })
    .on('live-update', res => {
      const rid = extractRid(res);
      if (!doCache(omitter(res), res.cluster, res.position)) {
        if (shouldLog) {
          console.log(`UPDATE SKIPPED (${collectionType.name})(${rid})(version:${res.version})`);
        }
        return;
      }
      if (shouldLog) {
        console.log(`UPDATE DETECTED (${collectionType.name})(${rid})(version:${res.version})`);
      }
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
      _.forEach(roomsWithTemplatesForInsert, room => {
        insertHandler(io, db, room.room, room.hash, collectionType.name);
      });
    })
    .on('live-delete', res => {
      const rid = extractRid(res);
      if (shouldLog) {
        console.log(`DELETE DETECTED (${collectionType.name})(${rid})`);
      }
      let roomsWithTemplatesForInsert = _.filter(
        _.map(io.sockets.adapter.rooms, (value, key) => {
          0;
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
      _.forEach(roomsWithTemplatesForInsert, room => {
        insertHandler(io, db, room.room, room.hash, collectionType.name);
      });
    });
}
