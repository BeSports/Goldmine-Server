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
import shallowequal from 'shallowequal';

const isVertexWithEdges = res => {
  const hasEdgesAndIsVertex =
    !_.includes(res.content['@class'], '_') &&
    _.find(res.content, (val, key) => {
      return _.startsWith(key, 'out') || _.startsWith(key, 'in');
    });
  if (hasEdgesAndIsVertex) {
    _.set(global.objectCache, `[${res.cluster}][${res.position}]`, omitter(res));
  }
  return hasEdgesAndIsVertex;
};

const omitter = o => {
  return _.omitBy(o.content, (val, key) => {
    return _.startsWith(key, 'out') || _.startsWith(key, 'in');
  });
};

const doCache = (o, cluster, position) => {
  //object is in cache and correct version

  if (_.isMatch(_.get(global.objectCache, `[${cluster}][${position}]`, false), o)) {
    global.counter.skippedByObjectCache++;
    return false;
  }
  return true;
};

const searchForMatchingRids = (rooms, insertedObject) => {
  if (_.includes(insertedObject['@class'], '_')) {
    const edgeRelatedIds = [extractRid(insertedObject.in), extractRid(insertedObject.out)];
    const valuesToSearchForInParams = _.flatten([
      _.values(
        _.omit(
          _.get(
            global.objectCache,
            `[${insertedObject.in.cluster}][${insertedObject.in.position}]`,
            {},
          ),
          '@class',
        ),
      ),
      _.values(
        _.omit(
          _.get(
            global.objectCache,
            `[${insertedObject.out.cluster}][${insertedObject.out.position}]`,
            {},
          ),
          '@class',
        ),
      ),
    ]);

    return _.filter(rooms, room => {
      return (
        _.difference(edgeRelatedIds, room.cache).length < 2 ||
        _.size(_.difference(_.values(room.params), valuesToSearchForInParams)) < _.size(room.params)
      );
    });
  }

  return rooms;
};

const shallowSearchForMatchingRooms = (rooms, collectionName, isEdgeCheck) => {
  return _.compact(
    _.map(rooms, (value, key) => {
      return _.find(flattenExtend(value.templates), [
        isEdgeCheck ? 'relation' : 'collection',
        collectionName,
      ])
        ? { room: value, hash: key }
        : null;
    }),
  );
};

const deepSearchForMatchingRooms = (rooms, collectionName, isEdgeCheck, res) => {

  const oldObject = _.get(global.objectCache, `[${res.cluster}][${res.position}]`, {});
  const toReturn = _.compact(
    _.map(rooms, (value, key) => {
      const relevantFlattendTemplateParts = _.filter(flattenExtend(value.room.templates), [
        isEdgeCheck ? 'relation' : 'collection',
        collectionName,
      ]);
      const relevantFields = _.uniq(
        _.flatten(_.compact(_.map(relevantFlattendTemplateParts, 'fields'))),
      );
      const oldObjectRelevantFields = _.pick(oldObject, relevantFields);
      const newObjectRelevantFields = _.pick(omitter(res), relevantFields);
      const isEqualForSelectedFields = shallowequal(
        oldObjectRelevantFields,
        newObjectRelevantFields,
      );
      return isEqualForSelectedFields ? null : value;
    }),
  );
  _.set(global.objectCache, `[${res.cluster}][${res.position}]`, omitter(res));
  return toReturn;
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
      //will be triggered on one of their edges
      if (isVertexWithEdges(res)) {
        return;
      }

      const totalRooms = _.size(io.sockets.adapter.rooms);
      const roomsWithMatchingRids = searchForMatchingRids(io.sockets.adapter.rooms, res.content);
      const roomsRemovedByNonMatchingRids = totalRooms - _.size(roomsWithMatchingRids);

      // inserted an edge
      let roomsWithShallowTemplatesForInsert = shallowSearchForMatchingRooms(
        roomsWithMatchingRids,
        collectionType.name,
        _.includes(res.content['@class'], '_'),
      );
      const roomsRemovedByShallowCompare =
        totalRooms - _.size(roomsWithMatchingRids) - _.size(roomsWithShallowTemplatesForInsert);

      global.counter.totalRoomsChecked += totalRooms;
      global.counter.roomsRemovedByShallowCompare += roomsRemovedByShallowCompare;
      global.counter.roomsRemovedByNonMatchingRids += roomsRemovedByNonMatchingRids;

      console.log(
        'doing for',
        res.content['@class'],
        'insert',
        _.size(roomsWithShallowTemplatesForInsert),
      );
      _.forEach(roomsWithShallowTemplatesForInsert, room => {
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

      const totalRooms = _.size(io.sockets.adapter.rooms);
      // inserted an edge
      let roomsWithShallowTemplatesForInsert = shallowSearchForMatchingRooms(
        io.sockets.adapter.rooms,
        collectionType.name,
        _.includes(res.content['@class'], '_'),
      );

      const roomsRemovedByShallowCompare = totalRooms - _.size(roomsWithShallowTemplatesForInsert);

      let roomsWithDeepTemplatesForInsert = deepSearchForMatchingRooms(
        roomsWithShallowTemplatesForInsert,
        collectionType.name,
        _.includes(res.content['@class'], '_'),
        res,
      );

      const roomsRemovedByDeepCompare =
        totalRooms - roomsRemovedByShallowCompare - _.size(roomsWithDeepTemplatesForInsert);

      global.counter.totalRoomsChecked += totalRooms;
      global.counter.roomsRemovedByShallowCompare += roomsRemovedByShallowCompare;
      global.counter.roomsRemovedByDeepCompare += roomsRemovedByDeepCompare;

      console.log(
        'doing for',
        res.content['@class'],
        'update',
        _.size(roomsWithDeepTemplatesForInsert),
      );
      _.forEach(roomsWithDeepTemplatesForInsert, room => {
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
