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

var _OrderTypes = require('../enums/OrderTypes');

var _OrderTypes2 = _interopRequireDefault(_OrderTypes);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var OrientDBQueryBuilder = function () {
  function OrientDBQueryBuilder(templates, params, decoded, publicationNameWithParams) {
    (0, _classCallCheck3.default)(this, OrientDBQueryBuilder);

    var templateTemp = void 0;
    this.publicationNameWithParams = publicationNameWithParams;
    if (typeof templates === 'function') {
      templateTemp = templates(params);
    } else {
      templateTemp = templates;
    }
    if (templateTemp instanceof Array) {
      this.templates = _lodash2.default.filter(templateTemp, function (template) {
        if (!template.permission) {
          return template;
        } else {
          return template.permission(decoded);
        }
      });
    } else if (templateTemp.permission && templateTemp.permission(decoded)) {
      this.templates = templateTemp;
    } else {
      this.templates = [];
    }
    this.tempParams = [];
  }

  (0, _createClass3.default)(OrientDBQueryBuilder, [{
    key: 'build',
    value: function build() {
      var _this = this;

      var statements = [];
      _lodash2.default.forEach(this.templates, function (template) {
        _this.tempParams = [];
        if (typeof template === 'string') {
          statements.push(template);
        } else if (template.query) {
          var query = template.query;
          statements.push(query);
        } else {
          if (!template.collection) {
            console.log('No collection name was provided to ' + template);
          }

          var selectStmt = null;
          var whereStmts = null;
          var orderByStmt = null;
          var paginationStmt = null;
          var whereSlowAddition = '';

          // TOP LEVEL
          // select statement
          selectStmt = _this.buildSelectStmt(template);

          // where statement
          whereStmts = _this.createWherePaths(template);

          // order by statement
          orderByStmt = _this.buildOrderByStmt(template);

          // pagination statement
          paginationStmt = _this.buildPaginationStmt(template);

          // EXTENDS
          if (template.extend) {
            var extendFields = _this.buildExtends(template.extend, '');
            selectStmt += (_lodash2.default.size(_lodash2.default.trim(selectStmt)) !== 0 && _lodash2.default.size(_lodash2.default.trim(extendFields.selectStmt)) !== 0 ? ', ' : ' ') + ' ' + extendFields.selectStmt;

            if (template.new) {
              var extendWhereFields = _this.createSlowWheres(template.extend, '');
              whereSlowAddition = extendWhereFields;
            }
          }
          var statementTemp = '';

          var hasRootParams = _lodash2.default.has(template, 'params');
          // Add statement
          if (!template.new) {
            statementTemp = '\n          begin \n          ' + '\n          ' + _lodash2.default.join(_lodash2.default.map(whereStmts, function (whereStmt, i) {
              return 'let $' + (i + 1) + ' = ' + whereStmt + ' ';
            }), ' ;') + '\n          ' + '\n          ' + (_lodash2.default.size(whereStmts) === 1 ? '' : 'let $inter = select intersect(' + _lodash2.default.join(_lodash2.default.times(_lodash2.default.size(whereStmts), function (i) {
              return '$' + (i + 1);
            }), ', ') + ')') + '\n          ' + '\n          let $result = select ' + selectStmt + ' from ' + (_lodash2.default.size(whereStmts) > 1 ? '$inter.intersect' : '$1') + ' ' + (orderByStmt ? 'ORDER BY ' + orderByStmt : '') + ' ' + (paginationStmt || '') + ';\n          commit\n          return $result\n          let $publicationName = \'' + (_this.publicationNameWithParams || '') + '\'\n          ';
          } else {
            statementTemp = '\n          begin \n          let $result = select ' + selectStmt + ' from (' + _lodash2.default.first(whereStmts).substring(14, _lodash2.default.size(_lodash2.default.first(whereStmts)) - 1) + ' ' + (whereSlowAddition ? ' ' + (hasRootParams ? ' AND ' : ' WHERE ') + ' ' + whereSlowAddition + ' ' : '') + ' ' + (hasRootParams ? ')' : '') + ' ' + (orderByStmt ? 'ORDER BY ' + orderByStmt + ' ' : '') + ' ' + (paginationStmt || '') + '; \n          commit\n          return $result\n          let $publicationName = \'' + (_this.publicationNameWithParams || '') + '\'\n          ';
          }

          _lodash2.default.map(_this.tempParams, function (value, property) {
            statementTemp = _lodash2.default.replace(statementTemp, new RegExp(':goldmine' + property, 'g'), typeof value === 'string' ? "'" + value + "'" : JSON.stringify(value));
          });
          statements.push(statementTemp);
        }
      });

      return {
        statements: statements,
        statementParams: { class: 's' },
        templates: this.templates
      };
    }
  }, {
    key: 'createSlowWheres',
    value: function createSlowWheres(extend) {
      var extendFields = this.buildWhereExtends(_lodash2.default.drop(extend), '');
      return extendFields.whereStmt;
    }
  }, {
    key: 'buildWhereExtends',
    value: function buildWhereExtends(extend, parent) {
      var _this2 = this;

      // select statement
      var whereStmt = '';
      _lodash2.default.map(extend, function (e) {
        var tempWhereStmt = _this2.buildWhereStmt(e, parent);
        if (e.extend) {
          var extendFields = _this2.buildWhereExtends(e.extend, (parent ? parent + '.' : '') + _this2.buildEdge(e.relation, e.direction));
          if (_lodash2.default.size(whereStmt) !== 0) {
            if (_lodash2.default.size(extendFields.whereStmt) !== 0) {
              whereStmt += ' AND ' + extendFields.whereStmt;
            }
          } else {
            whereStmt = extendFields.whereStmt;
          }
        }
        if (_lodash2.default.size(whereStmt) !== 0) {
          if (_lodash2.default.size(tempWhereStmt) !== 0) {
            whereStmt += ' AND ' + tempWhereStmt;
          }
        } else {
          whereStmt = tempWhereStmt;
        }
      });

      return {
        whereStmt: whereStmt
      };
    }
  }, {
    key: 'buildWhereStmt',
    value: function buildWhereStmt(template, parent) {
      var _this3 = this;

      var edge = '';
      if (template.target !== undefined) {
        edge = (parent ? parent + '.' : '') + '' + this.buildEdge(template.relation, template.direction);
      }
      var res = '';
      if (_lodash2.default.isArray(template.params)) {
        _lodash2.default.forEach(template.params, function (param, key) {
          res += _this3.buildObject(param, edge) + (_lodash2.default.size(template.params) - 1 > key ? ' OR' : '');
        });
      } else if (_lodash2.default.isObject(template.params)) {
        res = this.buildObject(template.params, edge);
      } else if (typeof template.params === 'string') {
        res += this.buildPropertyValuePair('_id', template.params, '=', edge);
      }
      return res;
    }
  }, {
    key: 'createWherePaths',
    value: function createWherePaths(template) {
      var _this4 = this;

      var paths = [];
      var ownParams = '';
      var optionalPaths = [];
      var relationString = '';
      if (template.extend && template.extend instanceof Array && _lodash2.default.size(template.extend) > 0) {
        optionalPaths = _lodash2.default.flatten(_lodash2.default.filter(_lodash2.default.map(template.new ? _lodash2.default.first(_lodash2.default.chunk(template.extend)) : template.extend, function (ext) {
          return _this4.createWherePaths(ext);
        }), function (r) {
          return r !== null;
        }));
      }
      // string of the current extend its where clauses
      if (template.params) {
        ownParams = this.buildObject(template.params, '');
      }
      if (template.relation) {
        relationString = 'expand(' + (template.direction ? this.buildWhereDirection(template.direction) : 'both') + '(\'' + template.relation + '\')) ';
      }
      if (_lodash2.default.size(optionalPaths) > 0) {
        return _lodash2.default.map(optionalPaths, function (path) {
          return 'select ' + (relationString !== '' ? relationString : '') + ' from ( ' + path + ' )   ' + (ownParams !== '' ? 'WHERE ' + ownParams : '');
        });
      } else if (ownParams !== '' || !template.relation) {
        return ['select ' + (relationString !== '' ? relationString : '') + '  from `' + template.collection + '`   ' + (ownParams !== '' ? 'WHERE ' + ownParams : '')];
      }
      return null;
    }
  }, {
    key: 'buildExtends',
    value: function buildExtends(extend, parent) {
      var _this5 = this;

      // select statement
      var selectStmt = '';
      _lodash2.default.map(extend, function (e) {
        if (e instanceof Array) {
          _lodash2.default.map(e, function (ext) {
            var extendFields = _this5.buildExtends([ext], parent, true);
            selectStmt += (extendFields.selectStmt ? ' ' + (_lodash2.default.size(_lodash2.default.trim(selectStmt)) > 0 ? ', ' : '') + ' ' + extendFields.selectStmt : '') + ' ';
          });
        } else {
          var buildSelect = _this5.buildSelectStmt(e, parent);
          selectStmt += '' + (_lodash2.default.size(_lodash2.default.trim(selectStmt)) !== 0 && _lodash2.default.size(_lodash2.default.trim(buildSelect)) !== 0 ? ', ' : '') + buildSelect;
          if (e.extend) {
            var extendFields = _this5.buildExtends(e.extend, parent + ('both("' + e.relation + '").'));
            selectStmt += '' + (_lodash2.default.size(_lodash2.default.trim(selectStmt)) !== 0 && _lodash2.default.size(_lodash2.default.trim(extendFields.selectStmt)) !== 0 ? ', ' : '') + extendFields.selectStmt;
          }
        }
      });

      return {
        selectStmt: selectStmt
      };
    }
  }, {
    key: 'setNextParamAvailable',
    value: function setNextParamAvailable(value) {
      this.tempParams.push(value);
      return _lodash2.default.size(this.tempParams) - 1;
    }
  }, {
    key: 'buildSelectStmt',
    value: function buildSelectStmt(template, parent) {
      var _this6 = this;

      var res = '';
      //extends
      if (template.target !== undefined) {
        var edge = (parent ? parent : '') + this.buildEdge(template.relation, template.direction);
        if (template.fields !== null) {
          res += ' ' + edge + '.@rid AS `' + _lodash2.default.replace(template.target, '.', '§') + '\xA7@rid`, ' + edge + '._id AS `' + _lodash2.default.replace(template.target, '.', '§') + '\xA7_id`';

          _lodash2.default.forEach(template.fields, function (field) {
            if (field === '_id') {
              return;
            }
            var tempEdge = edge;
            var tempField = field;
            res += ', ' + tempEdge + '.' + tempField + ' AS `' + _lodash2.default.replace(template.target, '.', '§') + '\xA7' + tempField + '`';
          });
        }
        if (template.edgeFields) {
          _lodash2.default.forEach(template.edgeFields, function (field) {
            res += (template.fields === null ? '' : ', ') + ' ' + parent + _this6.buildDirection(template.direction) + 'E(\'' + template.relation + '\').' + field + ' AS `' + _lodash2.default.replace(template.target, '.', '§') + '\xA7' + field + '`';
          });
        }
        // main class subscribed on
      } else {
        var size = _lodash2.default.size(template.fields);
        if (size !== 0) {
          res += '@rid, _id ';

          _lodash2.default.forEach(template.fields, function (field) {
            if (field === '_id') {
              return;
            }
            res += ', ' + field;
          });
        } else {
          res += '*';
        }
      }

      return res;
    }
  }, {
    key: 'buildObject',
    value: function buildObject(paramsObject, edge) {
      var _this7 = this;

      var objectRes = '(';
      var counter = 0;
      _lodash2.default.forEach(paramsObject, function (value, property) {
        objectRes += _this7.buildProperty(value, property, edge) + (_lodash2.default.size(paramsObject) - 1 > counter ? ' AND' : ' )');
        counter++;
      });
      return objectRes;
    }
  }, {
    key: 'buildProperty',
    value: function buildProperty(value, property, edge) {
      var _this8 = this;

      if (value instanceof Array) {
        var res = '(';
        _lodash2.default.forEach(value, function (v, i) {
          res += _this8.buildPropertyObject(property, v, edge) + (_lodash2.default.size(value) - 1 > i ? ' OR' : ' )');
        });
        return res;
      }
      if (value instanceof Object) {
        return this.buildPropertyObject(property, value, edge);
      }
      return this.buildPropertyValuePair(property, value, '=', edge);
    }
  }, {
    key: 'buildPropertyObject',
    value: function buildPropertyObject(propertyName, propertyObject, edge) {
      if (typeof propertyObject === 'string') {
        return this.buildPropertyValuePair(propertyName, propertyObject, '=', edge);
      } else if (propertyObject.value !== undefined && propertyObject.operator !== undefined) {
        return this.buildPropertyValuePair(propertyName, propertyObject.value, propertyObject.operator, edge, propertyObject.method);
      } else if (propertyObject.value !== undefined) {
        return this.buildPropertyValuePair(propertyName, propertyObject.value, '=', edge, propertyObject.method);
      } else if (propertyObject.operator !== undefined) {
        return this.buildPropertyValuePair(propertyName, null, propertyObject.operator, edge, propertyObject.method);
      }
      return '';
    }

    // preset goldmine since number are not recognized as params by orientjs

  }, {
    key: 'buildPropertyValuePair',
    value: function buildPropertyValuePair(property, value, operator, edge, method) {
      var tempParamIndex = this.setNextParamAvailable(value);
      if (value === null) {
        if (edge) {
          return ' ' + edge + '["' + property + '"] ' + operator;
        }
        return ' `' + property + '` ' + operator;
      }
      if (edge) {
        return ' ' + edge + '["' + property + '"]' + (method ? '.' + method : '') + ' ' + (operator || '=') + ' :goldmine' + tempParamIndex;
      }
      return ' `' + property + '`' + (method ? '.' + method : '') + ' ' + (operator || '=') + ' :goldmine' + tempParamIndex;
    }
  }, {
    key: 'buildOrderByStmt',
    value: function buildOrderByStmt(template) {
      var res = '';

      if (template.orderBy === undefined) {
        return res;
      }

      var orderBySize = _lodash2.default.size(template.orderBy);

      _lodash2.default.forEach(template.orderBy, function (value, key) {
        if (typeof value === 'string') {
          res += value + ' ' + _OrderTypes2.default.ASCENDING;
        } else {
          res += value.field + ' ' + value.direction;
        }

        if (orderBySize - 1 > key) {
          res += ', ';
        }
      });

      return res;
    }
  }, {
    key: 'buildPaginationStmt',
    value: function buildPaginationStmt(template) {
      var res = '';

      if (template.skip !== undefined) {
        res += 'SKIP ' + template.skip;
      }

      if (template.limit !== undefined) {
        if (_lodash2.default.size(res) !== 0) {
          res += ' ';
        }

        var limit = template.limit;

        if (isNaN(template.limit)) {
          limit = '' + limit;
        }

        res += 'LIMIT ' + limit;
      }

      return res;
    }
  }, {
    key: 'buildDirection',
    value: function buildDirection(direction) {
      return direction ? _lodash2.default.toLower(direction) === 'in' ? 'out' : 'in' : 'both';
    }
  }, {
    key: 'buildWhereDirection',
    value: function buildWhereDirection(direction) {
      return direction ? _lodash2.default.toLower(direction) === 'in' ? 'in' : 'out' : 'both';
    }
  }, {
    key: 'buildEdge',
    value: function buildEdge(relation, direction) {
      var isEdge = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

      direction = this.buildDirection(direction);

      return '' + direction + (isEdge ? 'e' : '') + '("' + relation + '")';
    }
  }]);
  return OrientDBQueryBuilder;
}();

exports.default = OrientDBQueryBuilder;