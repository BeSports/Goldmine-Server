import _ from 'lodash';
import Orient from 'orientjs';
import pluralize from 'pluralize';

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
      params[key] = isNaN(value) ? value : Number(value);
    }
  });

  return params;
}

export function emitResults(io, roomHash, room, type, collectionName, data, fields) {
  data = extractFields(fields, data);
  io.to(roomHash).emit(room.publicationNameWithParams, {
    type: type,
    collectionName: pluralize(collectionName),
    data: data,
  });
}

export function extractFields(fields, data) {
  if (fields === undefined) {
    delete data['@rid'];
    delete data['@type'];
    delete data['@version'];
    return data;
  }
  let result = {};

  result['_id'] = data['_id'];
  result['rid'] = data['rid'];

  _.forEach(fields, field => {
    result[field] = data[field];
  });

  return result;
}

export function getCollectionName(template) {
  return template.collectionName ? template.collectionName : pluralize(template.collection);
}

export function serverParamsUsed(publication, decoded) {
  //TODO
  return;
}

export function flattenExtend(extend) {
  let extendArray = [];
  if(extend) {
    const newExtends = _.flatten(_.map(extend, (e) => {
      extendArray.push(e);
      return flattenExtend(e.extend);
    }));
    extendArray.push(newExtends);
  }
  return extendArray;
}

export function getEdgeFieldsForExtendOverRelation(template, relation) {
  const flattened = _.flattenDeep(flattenExtend(template));
  let flatFiltered = _.filter(_.filter(flattened, { relation }), 'edgeFields');
  let edgeFields = _.flattenDeep(_.map(flatFiltered, 'edgeFields'));
  return edgeFields;
}