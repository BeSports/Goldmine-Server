import _ from 'lodash';
import Orient from 'orientjs';
import pluralize from "pluralize";

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
    value = JSON.parse(item.substr(index + 1));

    // An OrientDB RID has to be treated differently.
    if (!(value instanceof Array) && isNaN(value) && value.startsWith('#')) {
      params[key] = Orient.RID(value);
    } else {
      params[key] = isNaN(value) ? value : Number(value);
    }
  });

  return params;
}

export function emitResults(io, subName, type, collectionName, target, data, fields) {
  const rid = data['_id'];

  data = extractFields(fields, data);
  data['_id'] = rid;

  io.sockets.to(subName).emit(subName, {
    type: type,
    collectionName: collectionName,
    target: target,
    data: data,
  });
}

export function extractFields(fields, data) {
  if (fields === undefined) {
    return data;
  }

  let result = {};

  result['_id'] = data['_id'];

  _.forEach(fields, field => {
    result[field] = data[field];
  });

  return result;
}

export function getCollectionName(template) {
  return template.collectionName ? template.collectionName : pluralize(template.collection);
}
