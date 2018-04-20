'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.extractRid = extractRid;
exports.extractPublicationName = extractPublicationName;
exports.extractParams = extractParams;
exports.emitResults = emitResults;
exports.extractFields = extractFields;
exports.getCollectionName = getCollectionName;
exports.getParameteredIdsOfTemplate = getParameteredIdsOfTemplate;
exports.flattenExtend = flattenExtend;
exports.getEdgeFieldsForExtendOverRelation = getEdgeFieldsForExtendOverRelation;

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _orientjs = require('orientjs');

var _orientjs2 = _interopRequireDefault(_orientjs);

var _pluralize = require('pluralize');

var _pluralize2 = _interopRequireDefault(_pluralize);

var _OrientDbQueryBuilder = require('../builders/OrientDbQueryBuilder');

var _OrientDbQueryBuilder2 = _interopRequireDefault(_OrientDbQueryBuilder);

var _OrientDbQueryResolver = require('../resolvers/OrientDbQueryResolver');

var _OrientDbQueryResolver2 = _interopRequireDefault(_OrientDbQueryResolver);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function extractRid(obj) {
  return '#' + obj.cluster + ':' + obj.position;
}

function extractPublicationName(subscription) {
  var key = subscription.indexOf('?');
  var roomName = subscription;

  if (key !== -1) {
    roomName = subscription.substring(0, key);
  }

  return roomName;
}

function extractParams(publicationNameWithParams) {
  var index = publicationNameWithParams.indexOf('?');

  if (index === -1) {
    return null;
  }

  var strParams = publicationNameWithParams.substr(index + 1);
  var strParamsArray = strParams.match(new RegExp('[^&]+=[^&]+', 'g'));

  var params = {};
  var key = void 0,
      value = void 0;
  try {
    _lodash2.default.forEach(strParamsArray, function (item) {
      index = item.indexOf('=');
      key = item.substr(0, index);
      value = JSON.parse(typeof item.substr(index + 1) === 'string' && _lodash2.default.first(item.substr(index + 1)) !== '"' ? _lodash2.default.first(item.substr(index + 1)) === '[' ? '' + item.substr(index + 1) : '"' + item.substr(index + 1) + '"' : item.substr(index + 1));

      // An OrientDB RID has to be treated differently.
      if (!(value instanceof Array) && isNaN(value) && value.startsWith('#')) {
        params[key] = _orientjs2.default.RID(value);
      } else {
        params[key] = isNaN(value) ? value : _lodash2.default.first(item.substr(index + 1)) === '"' ? value : Number(value);
      }
    });
  } catch (err) {
    console.log(err, publicationNameWithParams);
    console.error({ err: err, queries: publicationNameWithParams });
  }

  return params;
}

function emitResults(io, roomHash, room, type, data) {
  io.to(room.hash).emit(room.publicationNameWithParams, {
    type: type,
    publicationNameWithParams: room.publicationNameWithParams,
    data: data
  });
}

function extractFields(fields, data) {
  if (fields === undefined || _lodash2.default.size(_lodash2.default.filter(fields, function (f) {
    return !!f;
  })) === 0) {
    delete data['@type'];
    delete data['@version'];
    return data;
  }
  var result = {};

  result['_id'] = data['_id'];
  result['@rid'] = data['@rid'];
  result['rid'] = data['rid'];

  _lodash2.default.forEach(fields, function (field) {
    result[field] = data[field];
  });

  return result;
}

function getCollectionName(template) {
  return template.collectionName ? template.collectionName : (0, _pluralize2.default)(template.collection);
}

function getParameteredIdsOfTemplate(templates, params, decoded) {
  var miniTemplates = flattenExtend([templates]);
  var parameteredTemplates = _lodash2.default.filter(miniTemplates, function (template) {
    return _lodash2.default.has(template, 'params');
  });
  var reconstructedTemplates = _lodash2.default.map(parameteredTemplates, function (template) {
    return _lodash2.default.set(_lodash2.default.omit(template, ['relation', 'target', 'fields']), 'fields', ['@rid']);
  });
  var queryBuilds = new _OrientDbQueryBuilder2.default(reconstructedTemplates, params, decoded).build();
  return new _OrientDbQueryResolver2.default({}, queryBuilds.templates, queryBuilds.statements, decoded).resolve(queryBuilds.statementParams).then(function (data) {
    var cache = _lodash2.default.filter(_lodash2.default.uniq(_lodash2.default.flatten(_lodash2.default.map(data, 'cache'))), function (c) {
      return !_lodash2.default.startsWith(c, '#-2');
    });
    return cache;
  });
}

function flattenExtend(extend) {
  var extendArray = [];
  if (extend) {
    var newExtends = _lodash2.default.flatten(_lodash2.default.map(extend, function (e) {
      // ANDS and deeper levels :33: deeper
      if (e instanceof Array) {
        return flattenExtend(e);
      } else {
        //ORS
        extendArray.push(e);
        return flattenExtend(e.extend);
      }
    }));
    extendArray.push(newExtends);
  }
  return _lodash2.default.flatten(extendArray);
}

function getEdgeFieldsForExtendOverRelation(template, relation) {
  var flattened = _lodash2.default.flattenDeep(flattenExtend(template));
  var flatFiltered = _lodash2.default.filter(_lodash2.default.filter(flattened, { relation: relation }), 'edgeFields');
  var edgeFields = _lodash2.default.flattenDeep(_lodash2.default.map(flatFiltered, 'edgeFields'));
  return edgeFields;
}