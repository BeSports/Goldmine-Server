import _ from 'lodash';
import OperationTypes from '../enums/OperationTypes';
import { emitResults, extractRid, getCollectionName } from './helperFunctions';
import Types from '../enums/Types';
import insertHandler from './insertHandler';
import * as pluralize from "pluralize";

export default function(io, db, collectionType, publications, cache, insertCache) {
  const QUERY = `LIVE SELECT FROM \`${collectionType.name}\``;

  const handler = function(
    template,
    rooms,
    res,
    type,
    collectionName,
    insertCache,
    usedInsert,
    target,
  ) {
    console.log('updateing');
    if (template.collection === _.toLower(collectionType.name)) {
      _.forEach(rooms, roomName => {
        const id = res.content['_id'];
        const rid = extractRid(res);

        let isInInsertCache = false;

        // Insert cache uses RID
        _.forEach(insertCache, obj => {
          if (rid === obj.out) {
            if (res.content['out_' + obj.type] !== undefined) {
              _.forEach(res.content['out_' + obj.type]['_content'], value => {
                if (obj.rid === value.toString()) {
                  isInInsertCache = true;

                  usedInsert.add(obj['@rid']);
                  return false;
                }
              });

              if (isInInsertCache) return false;
            }
          } else if (rid === obj.in) {
            if (res.content['in_' + obj.type] !== undefined) {
              _.forEach(res.content['in_' + obj.type]['_content'], value => {
                if (obj['@rid'] === value.toString()) {
                  isInInsertCache = true;

                  usedInsert.add(obj['@rid']);
                  return false;
                }
              });

              if (isInInsertCache) return false;
            }
          }
        });

        if (isInInsertCache) {
          type = OperationTypes.INSERT;
        }

        if (cache[roomName].has(id)) {
          res.content['_id'] = id;

          emitResults(
            io,
            roomName,
            type,
            collectionName,
            target,
            res.content,
            template.fields,
          );

          if (type === OperationTypes.DELETE) {
            cache[roomName].delete(id);
          }
        }
      });
    }
  };

  db
    .liveQuery(QUERY)
    .on('live-insert', res => {
      console.log(`INSERT DETECTED (${collectionType.name})`);

      const rid = extractRid(res);
      // Check if type of relation
      // if (res.content.hasOwnProperty('out') && res.content.hasOwnProperty('in')) {
      //   insertCache.push({
      //     rid: extractRid(res),
      //     type: res.content['@class'],
      //     out: res.content.out.toString(),
      //     in: res.content.in.toString(),
      //   });
      // }

      _.forEach(publications, (publication, roomName) => {
        let roomsForPublication = [];

        _.forEach(io.sockets.adapter.rooms, (value, key) => {
          if (key.startsWith(roomName)) {
            roomsForPublication.push(key);
          }

          _.forEach(publication, template => {
            const content = res.content;

            if (collectionType.type === Types.EDGE) {
              insertCache.push({
                rid: rid,
                type: content['@class'],
                out: content.out.toString(),
                in: content.in.toString(),
              });
            }
            else {
              insertHandler(io, db, template, collectionType, roomsForPublication, res, cache, insertCache);
            }

            // Template - root level
            // if (
            //   template.collection.name === collectionType.name ||
            //   collectionType.type === Types.EDGE
            // ) {
            //   _.forEach(roomsForSubscription, room => {
            //     const params = extractParams(room);
            //
            //     const queries = new OrientDBQueryBuilder([template]).build();
            //
            //     new OrientDBQueryResolver(db, [template], queries)
            //       .resolve(params, cache[room])
            //       .then(result => {
            //         console.log(result[0].data);
            //         // Check if rid is in result set.
            //         const tempObject = _.find(result[0].data, x => {
            //           if (x.rid === rid) {
            //             return true;
            //           } else {
            //             let placeholder =
            //             _.forEach();
            //             console.log('x', x);
            //             console.log('target', template.target);
            //             if (x.hasOwnProperty(template.target)) {
            //               console.log('inside', x[template.target]);
            //               if (x[template.target] instanceof Array) {
            //                 return !!_.find(x[template.target], y => {
            //                   return y.rid === rid;
            //                 });
            //               }
            //               else if (x[template.target].rid === rid) {
            //                 return true;
            //               }
            //             }
            //           }
            //
            //           return false;
            //         });
            //
            //         console.log(tempObject);
            //
            //         if (tempObject !== undefined) {
            //           emitResults(
            //             io,
            //             room,
            //             OperationTypes.INSERT,
            //             template.collectionName,
            //             undefined,
            //             tempObject,
            //           );
            //
            //           console.log('sent');
            //         }
            //       });
            //   });
            // }
            //
            // console.log('template');
          });
        });
      });
    })
    .on('live-update', res => {
      console.log(`UPDATE DETECTED (${collectionType.name})`);

      let usedInserts = new Set();

      _.forEach(publications, (publication, roomName) => {
        let roomsForPublication = [];

        _.forEach(io.sockets.adapter.rooms, (value, key) => {
          if (key.startsWith(roomName)) {
            roomsForPublication.push(key);
          }
        });

        console.log(roomsForPublication);
        _.forEach(publication, template => {
          // Template - root level
          handler(
            template,
            roomsForPublication,
            res,
            OperationTypes.UPDATE,
            getCollectionName(template),
            insertCache,
            usedInserts,
          );

          // Template - extend level
          _.forEach(template.extend, extend => {
            handler(
              extend,
              roomsForPublication,
              res,
              OperationTypes.UPDATE,
              getCollectionName(template),
              insertCache,
              usedInserts,
              extend.target,
            );
          });
        });
      });
    })
    .on('live-delete', res => {
      console.log(`DELETE DETECTED (${collectionType.name})`);

      _.forEach(publications, (publication, roomName) => {
        let roomsForPublication = [];

        _.forEach(io.sockets.adapter.rooms, (value, key) => {
          if (key.startsWith(roomName)) {
            roomsForPublication.push(key);
          }
        });

        _.forEach(publication, template => {
          // Template - root level
          handler(
            template,
            roomsForPublication,
            res,
            OperationTypes.DELETE,
            getCollectionName(template),
          );

          // Template - extend level
          _.forEach(template.extend, extend => {
            handler(
              extend,
              roomsForPublication,
              res,
              OperationTypes.DELETE,
              getCollectionName(template),
              null,
              null,
              extend.target,
            );
          });
        });
      });
    });
}
