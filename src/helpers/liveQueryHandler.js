import _ from 'lodash';
import { extractRid, flattenExtend } from './helperFunctions';
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
    return false;
  }
  return true;
};

const searchForMatchingRids = (rooms, insertedObject, isUpdate) => {
  if (_.includes(insertedObject.content['@class'], '_')) {
    const edgeRelatedIds = [
      extractRid(insertedObject.content.in),
      extractRid(insertedObject.content.out),
    ];
    const valuesToSearchForInParams = _.flatten([
      _.values(
        _.omit(
          _.get(
            global.objectCache,
            `[${insertedObject.content.in.cluster}][${insertedObject.content.in.position}]`,
            {},
          ),
          '@class',
        ),
      ),
      _.values(
        _.omit(
          _.get(
            global.objectCache,
            `[${insertedObject.content.out.cluster}][${insertedObject.content.out.position}]`,
            {},
          ),
          '@class',
        ),
      ),
    ]);

    return _.filter(rooms, room => {
      // console.log({
      //   room: room.publicationNameWithParams,
      //   isItTrue:
      //     _.size(_.difference(_.values(room.params), valuesToSearchForInParams)) <
      //     _.size(room.params),
      //   difference: _.difference(_.values(room.params), valuesToSearchForInParams),
      //   sizeOfDifference: _.size(_.difference(_.values(room.params), valuesToSearchForInParams)),
      //   sizeToCompareTo: _.size(room.params),
      //   roomparams: _.values(room.params),
      //   valuesToSearchForInParams,
      // });
      return (
        _.difference(edgeRelatedIds, room.cache).length < 2 ||
        _.size(_.difference(_.values(room.params), valuesToSearchForInParams)) <
          _.size(room.params) ||
        _.size(
          _.filter(room.templates, template => {
            return (
              _.has(template, 'limit') &&
              _.has(template, 'orderBy') &&
              !_.has(template, 'skipOrder')
            );
          }),
        ) > 0
      );
    });
  } else if (isUpdate) {
    const ridToSearchFor = extractRid(insertedObject);
    return _.filter(rooms, room => {
      return _.includes(room.cache, ridToSearchFor);
    });
  }
  return [];
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
        _.flatten(
          _.compact(_.map(relevantFlattendTemplateParts, isEdgeCheck ? 'edgeFields' : 'fields')),
        ),
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

const liveQuery = async function(io, typer, shouldLog) {
  const QUERY = `LIVE SELECT FROM \`${typer}\``;
  let received = false;
  let currentToken;
  const db = global.nextLiveDB();
  db
    .liveQuery(QUERY, {
      resolver: (a, b) => {
        global.liveQueryTokens.push(_.first(a).token);
        console.log('Live subscribed on ', typer, ' live Id: ', _.first(a).token);
        currentToken = _.first(a).token;
        return a;
      },
    })
    .on('live-insert', res => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('INSERTED', res.content['@class']);
      }
      global.counter.updates++;

      if (!doCache(omitter(res), res.cluster, res.position)) {
        return;
      }
      //will be triggered on one of their edges
      if (isVertexWithEdges(res)) {
        return;
      }

      const roomsWithMatchingRids = searchForMatchingRids(io.sockets.adapter.rooms, res);

      // inserted an edge
      let roomsWithShallowTemplatesForInsert = shallowSearchForMatchingRooms(
        roomsWithMatchingRids,
        res.content['@class'],
        _.includes(res.content['@class'], '_'),
      );

      // console.log({
      //   size: _.size(roomsWithShallowTemplatesForInsert),
      //   deepTemplates: _.map(roomsWithShallowTemplatesForInsert, 'room.publicationNameWithParams'),
      // });

      _.forEach(roomsWithShallowTemplatesForInsert, room => {
        room.room.executeQuery(io, db, room.room, room.hash, res.content['@class']);
      });
    })
    .on('live-update', res => {
      if (!received) {
        received = true;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log('UPDATED', res.content['@class']);
      }
      global.counter.updates++;
      const rid = extractRid(res);
      if (!rid) {
        return;
      }
      if (!doCache(omitter(res), res.cluster, res.position)) {
        return;
      }

      const roomsWithMatchingRids = searchForMatchingRids(io.sockets.adapter.rooms, res, true);

      let roomsWithShallowTemplatesForInsert = shallowSearchForMatchingRooms(
        roomsWithMatchingRids,
        res.content['@class'],
        _.includes(res.content['@class'], '_'),
      );

      let roomsWithDeepTemplatesForInsert = deepSearchForMatchingRooms(
        roomsWithShallowTemplatesForInsert,
        res.content['@class'],
        _.includes(res.content['@class'], '_'),
        res,
      );

      // console.log({
      //   size: _.size(roomsWithDeepTemplatesForInsert),
      //   deepTemplates: _.map(roomsWithDeepTemplatesForInsert, 'room.publicationNameWithParams'),
      // });

      _.forEach(roomsWithDeepTemplatesForInsert, room => {
        room.room.executeQuery(io, db, room.room, room.hash, res.content['@class'], rid);
      });
    })
    .on('live-delete', res => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('DELETED', res.content['@class']);
      }
      global.updates++;
      const rid = extractRid(res);

      const roomsWithMatchingRids = searchForMatchingRids(io.sockets.adapter.rooms, res, true);

      let roomsWithTemplatesForInsert = _.filter(
        _.map(roomsWithMatchingRids, (value, key) => {
          return _.find(flattenExtend(value.templates), [
            _.includes(res.content['@class'], '_') ? 'relation' : 'collection',
            res.content['@class'],
          ])
            ? { room: value, hash: key }
            : null;
        }),
        x => {
          return x !== null;
        },
      );

      // console.log({
      //   size: _.size(roomsWithTemplatesForInsert),
      //   deepTemplates: _.map(roomsWithTemplatesForInsert, 'room.publicationNameWithParams'),
      // });

      _.forEach(roomsWithTemplatesForInsert, room => {
        room.room.executeQuery(io, db, room.room, room.hash, res.content['@class']);
      });
    });
  return await global.db
    .query(`UPDATE ${typer} set goldmineTestParam = ${Math.random() * 1000} LIMIT 1`)
    .then(async () => {
      await setTimeout(async () => {
        if (!received) {
          await db.close();
          await restart(io, typer, shouldLog, db.sessionId);
        } else {
        }
      }, 2500);
    });
};

const restart = async (io, typer, shouldLog, sessionId) => {
  global.restartLiveDB(sessionId);
  await liveQuery(io, typer, shouldLog);
};

export default liveQuery;
