'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = undefined;

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _helperFunctions = require('../helpers/helperFunctions');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var setCache = function setCache(object) {
  if (!_lodash2.default.has(global.objectCache, '[' + object.rid.cluster + '][' + object.rid.position + ']')) {
    _lodash2.default.set(global.objectCache, '[' + object.rid.cluster + '][' + object.rid.position + ']', object);
  }
};

var OrientDBQueryResolver = function () {
  function OrientDBQueryResolver(db, templates, queries, decoded, allowAll) {
    (0, _classCallCheck3.default)(this, OrientDBQueryResolver);

    this.db = db;
    if (templates instanceof Array) {
      this.templates = _lodash2.default.filter(templates, function (template) {
        if (!template.permission || allowAll) {
          return template;
        } else {
          return template.permission(decoded);
        }
      });
    } else if (templates.permission && templates.permission(decoded) || allowAll) {
      this.templates = templates;
    } else {
      this.templates = [];
    }
    this.queries = queries;
  }

  (0, _createClass3.default)(OrientDBQueryResolver, [{
    key: 'resolve',
    value: function resolve(params) {
      var _this = this;

      var promises = [];

      _lodash2.default.forEach(this.queries, function (query) {
        promises.push(global.db.query(query, { class: 's' }));
      });

      return Promise.all(promises).then(function (values) {
        var result = [];
        _lodash2.default.forEach(values, function (value, key) {
          var response = _this.handleResponse(_this.templates[key], value);
          result.push({
            collectionName: _lodash2.default.has(_this.templates, key + '.collection') ? (0, _helperFunctions.getCollectionName)(_this.templates[key]) : _lodash2.default.get(_lodash2.default.first(response.result), 'class', 'undefined'),
            data: response.result,
            cache: response.cache
          });
        });
        return result;
      }).catch(function (err) {
        console.log(_this.queries);
        console.error({ err: err, queries: _this.queries });
      });
    }
  }, {
    key: 'handleResponse',
    value: function handleResponse(template, response) {
      var result = [];
      var cache = [];
      _lodash2.default.forEach(response, function (obj) {
        var formattedObject = {};
        // Add to cache
        if (_lodash2.default.has(obj, '@rid')) {
          cache.push((0, _helperFunctions.extractRid)(obj['@rid']).toString());
        }

        _lodash2.default.forEach(obj, function (value, key) {
          var convertedValue = value;
          if (key.includes('@rid') && value instanceof Array) {
            convertedValue = _lodash2.default.map(value, toString);
          }
          if (key.startsWith('in_') || key.startsWith('out_') || !key.includes('§') || key.startsWith('_') || key.startsWith('rid')) {
            if (key.startsWith('in_') || key.startsWith('out_')) {
              return;
            }
            formattedObject[key] = key.startsWith('_id') ? convertedValue.toString() : convertedValue;

            if (key.startsWith('rid')) {
              cache.push(convertedValue.toString());
            }
          } else if (_lodash2.default.size(_lodash2.default.get(template, 'extend')) > 0) {
            setCache(formattedObject);
            var index = key.indexOf('§');
            var target = key.substr(0, index);
            var property = key.substr(index + 1);
            var tempExtend = '';

            _lodash2.default.forEach((0, _helperFunctions.flattenExtend)(template.extend), function (extend) {
              if (extend.target === target) {
                tempExtend = extend;
                return false;
              }
            });

            if (tempExtend !== '' && tempExtend.multi === true) {
              if (!formattedObject.hasOwnProperty(target)) {
                formattedObject[target] = [];
              }

              _lodash2.default.forEach(value, function (item, key) {
                if (property === '@rid') {
                  cache.push(item.toString());
                }

                if (formattedObject[target][key] === undefined) {
                  formattedObject[target][key] = {};
                }
                formattedObject[target][key][property] = property.includes('@rid') ? item.toString() : item;
              });
            } else {
              _lodash2.default.set(formattedObject, target + '.' + _lodash2.default.replace(property, '§', '.'), value instanceof Array && _lodash2.default.size(value) === 1 ? property.includes('@rid') ? value[0].toString() : value[0] : property.includes('@rid') ? value.toString() : value);
            }
          }
        });
        if (template.extraFields) {
          _lodash2.default.merge(formattedObject, template.extraFields);
        }
        if (template.extend) {
          _lodash2.default.map((0, _helperFunctions.flattenExtend)(template.extend), function (ext) {
            if (!formattedObject.hasOwnProperty(ext.target) && ext.fields !== null) {
              _lodash2.default.set(formattedObject, '' + ext.target, ext.multi === true ? [] : {});
            }
          });
        }
        result.push(formattedObject);
      });

      return {
        result: result,
        cache: cache
      };
    }
  }]);
  return OrientDBQueryResolver;
}();

exports.default = OrientDBQueryResolver;