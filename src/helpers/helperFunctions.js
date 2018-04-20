import _ from 'lodash';
import Orient from 'orientjs';
import pluralize from 'pluralize';
import QueryBuilder from '../builders/OrientDbQueryBuilder';
import QueryResolver from '../resolvers/OrientDbQueryResolver';

export function extractRid(obj) {
  return '#' + obj.cluster + ':' + obj.position;
}

export function extractPublicationName(subscription) {
  let key = subscription.indexOf('?');
  let roomName = subscription;

  if (key !== -1) {
    roomName = subscription.substring(0, key);
  }

  return roomName;
}

export function extractParams(publicationNameWithParams) {
  let index = publicationNameWithParams.indexOf('?');

  if (index === -1) {
    return null;
  }

  const strParams = publicationNameWithParams.substr(index + 1);
  const strParamsArray = strParams.match(new RegExp('[^&]+=[^&]+', 'g'));

  let params = {};
  let key, value;
  try {
    _.forEach(strParamsArray, item => {
      index = item.indexOf('=');
      key = item.substr(0, index);
      value = JSON.parse(
        typeof item.substr(index + 1) === 'string' && _.first(item.substr(index + 1)) !== '"'
          ? _.first(item.substr(index + 1)) === '['
            ? `${item.substr(index + 1)}`
            : `"${item.substr(index + 1)}"`
          : item.substr(index + 1),
      );

      // An OrientDB RID has to be treated differently.
      if (!(value instanceof Array) && isNaN(value) && value.startsWith('#')) {
        params[key] = Orient.RID(value);
      } else {
        params[key] = isNaN(value)
          ? value
          : _.first(item.substr(index + 1)) === '"' ? value : Number(value);
      }
    });
  } catch (err) {
    console.log(err, publicationNameWithParams);
    console.error({ err, queries: publicationNameWithParams });
  }

  return params;
}

export function emitResults(io, roomHash, room, type, data) {
  io.to(room.hash).emit(room.publicationNameWithParams, {
    type: type,
    publicationNameWithParams: room.publicationNameWithParams,
    data: data,
  });
}

export function extractFields(fields, data) {
  if (
    fields === undefined ||
    _.size(
      _.filter(fields, f => {
        return !!f;
      }),
    ) === 0
  ) {
    delete data['@type'];
    delete data['@version'];
    return data;
  }
  let result = {};

  result['_id'] = data['_id'];
  result['@rid'] = data['@rid'];
  result['rid'] = data['rid'];

  _.forEach(fields, field => {
    result[field] = data[field];
  });

  return result;
}

export function getCollectionName(template) {
  return template.collectionName ? template.collectionName : pluralize(template.collection);
}

export function getParameteredIdsOfTemplate(templates, params, decoded) {
  const miniTemplates = flattenExtend([templates]);
  const parameteredTemplates = _.filter(miniTemplates, template => {
    return _.has(template, 'params');
  });
  const reconstructedTemplates = _.map(parameteredTemplates, template => {
    return _.set(_.omit(template, ['relation', 'target', 'fields']), 'fields', ['@rid']);
  });
  const queryBuilds = new QueryBuilder(reconstructedTemplates, params, decoded).build();
  return new QueryResolver({}, queryBuilds.templates, queryBuilds.statements, decoded)
    .resolve(queryBuilds.statementParams)
    .then(data => {
      const cache = _.filter(_.uniq(_.flatten(_.map(data, 'cache'))), c => {
        return !_.startsWith(c, '#-2');
      });
      return cache;
    });
}

export function flattenExtend(extend) {
  let extendArray = [];
  if (extend) {
    const newExtends = _.flatten(
      _.map(extend, e => {
        // ANDS and deeper levels :33: deeper
        if (e instanceof Array) {
          return flattenExtend(e);
        } else {
          //ORS
          extendArray.push(e);
          return flattenExtend(e.extend);
        }
      }),
    );
    extendArray.push(newExtends);
  }
  return _.flatten(extendArray);
}

export function getEdgeFieldsForExtendOverRelation(template, relation) {
  const flattened = _.flattenDeep(flattenExtend(template));
  let flatFiltered = _.filter(_.filter(flattened, { relation }), 'edgeFields');
  let edgeFields = _.flattenDeep(_.map(flatFiltered, 'edgeFields'));
  return edgeFields;
}
