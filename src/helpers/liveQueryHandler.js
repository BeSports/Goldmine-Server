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

const hasNoEdges = object => {
  if (
    _.find(_.keys(object), key => {
      return _.startsWith(key, 'out') || _.startsWith(key, 'in');
    })
  ) {
    return false;
  }
  global.counter.hasNoEdges++;
  return true;
};

const omitter = o => {
  return _.omitBy(o.content, (val, key) => {
    return _.startsWith(key, 'out') || _.startsWith(key, 'in');
  });
};

const doCache = (o, cluster, position) => {
  //object is in cache and correct version
  if (_.isMatch(_.get(global.objectCache, `[${cluster}][${position}]`, false), o)) {
    global.counter.skippedByObejctCache++;
    return false;
  }

  // set it if inexistent or changed
  global.counter.newlyInsertedInChache++;
  _.set(global.objectCache, `[${cluster}][${position}]`, o);
  return true;
};

const shallowSearchForMatchingRooms = (rooms, collectionName, isEdgeCheck) => {
  return _.filter(
    _.map(rooms, (value, key) => {
      return _.find(flattenExtend(value.templates), [
        isEdgeCheck ? 'relation' : 'collection',
        collectionName,
      ])
        ? { room: value, hash: key }
        : null;
    }),
    _.size,
  );
};

export default async function(io, db, collectionType, shouldLog) {
  const QUERY = `LIVE SELECT FROM \`${collectionType.name}\``;
  global
    .nextDB()
    .liveQuery(QUERY, {
      resolver: (a, b) => {
        global.liveQueryTokens.push(_.first(a).token);
        return a;
      },
    })
    .on('live-insert', res => {
      global.counter.updates++;
      if (!doCache(omitter(res), res.cluster, res.position)) {
        return;
      }
      if (hasNoEdges(res.content)) {
        return;
      }
      // inserted an edge
      let roomsWithTemplatesForInsert = shallowSearchForMatchingRooms(
        io.sockets.adapter.rooms,
        collectionType.name,
        _.includes(res.content['@class'], '_'),
      );
      if (_.size(roomsWithTemplatesForInsert) === 0) {
        global.counter.shallowCompareRooms++;
        return;
      }

      _.forEach(roomsWithTemplatesForInsert, room => {
        room.room.executeQuery(io, db, room.room, room.hash, collectionType.name);
      });
    })
    .on('live-update', res => {
      global.counter.updates++;
      const rid = extractRid(res);
      if (!rid) {
        global.counter.emptyUpdate++;
        return;
      }
      if (!doCache(omitter(res), res.cluster, res.position)) {
        return;
      }

      let roomsWithTemplatesForInsert = shallowSearchForMatchingRooms(
        io.sockets.adapter.rooms,
        collectionType.name,
        _.includes(res.content['@class'], '_'),
      );

      _.forEach(roomsWithTemplatesForInsert, room => {
        room.room.executeQuery(io, db, room.room, room.hash, collectionType.name, rid);
      });
    })
    .on('live-delete', res => {
      global.updates++;
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
        room.room.executeQuery(io, db, room.room, room.hash, collectionType.name);
      });
    });
}
