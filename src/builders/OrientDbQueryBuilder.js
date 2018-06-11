import _ from 'lodash';
import OrderTypes from '../enums/OrderTypes';

export default class OrientDBQueryBuilder {
  constructor(templates, params, decoded, publicationNameWithParams) {
    let templateTemp;
    this.publicationNameWithParams = publicationNameWithParams;
    if (typeof templates === 'function') {
      templateTemp = templates(params);
    } else {
      templateTemp = templates;
    }
    if (templateTemp instanceof Array) {
      this.templates = _.filter(templateTemp, template => {
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

  build() {
    let statements = [];
    _.forEach(this.templates, template => {
      this.tempParams = [];
      if (typeof template === 'string') {
        statements.push(template);
      } else if (template.query) {
        let query = template.query;
        statements.push(query);
      } else {
        if (!template.collection) {
          console.log(`No collection name was provided to ${template}`);
        }

        let selectStmt = null;
        let whereStmts = null;
        let orderByStmt = null;
        let paginationStmt = null;
        let whereSlowAddition = '';

        // TOP LEVEL
        // select statement
        selectStmt = this.buildSelectStmt(template);

        // where statement
        whereStmts = this.createWherePaths(template);

        // order by statement
        orderByStmt = this.buildOrderByStmt(template);

        // pagination statement
        paginationStmt = this.buildPaginationStmt(template);

        // EXTENDS
        if (template.extend) {
          const extendFields = this.buildExtends(template.extend, '');
          selectStmt += `${
            _.size(_.trim(selectStmt)) !== 0 && _.size(_.trim(extendFields.selectStmt)) !== 0
              ? ', '
              : ' '
          } ${extendFields.selectStmt}`;

          if (template.new) {
            const extendWhereFields = this.createSlowWheres(template.extend, '');
            whereSlowAddition = extendWhereFields;
          }
        }
        let statementTemp = '';

        const hasRootParams = _.has(template, 'params');
        // Add statement
        if (!template.new) {
          statementTemp = `
          begin 
          ${/* insert the where clauses built before */ ''}
          ${_.join(
            _.map(whereStmts, (whereStmt, i) => {
              return `let $${i + 1} = ${whereStmt} `;
            }),
            ' ;',
          )}
          ${/* get all rids where the where clauses are correct */ ''}
          ${
            _.size(whereStmts) === 1
              ? ''
              : `let $inter = select intersect(${_.join(
                  _.times(_.size(whereStmts), i => {
                    return `$${i + 1}`;
                  }),
                  ', ',
                )})`
          }
          ${/* Select the requested fields */ ''}
          let $result = select ${selectStmt} from ${
            _.size(whereStmts) > 1 ? '$inter.intersect' : '$1'
          } ${orderByStmt ? `ORDER BY ${orderByStmt}` : ''} ${paginationStmt || ''};
          commit
          return $result
          let $publicationName = '${this.publicationNameWithParams || ''}'
          `;
        } else {
          statementTemp = `
          begin 
          let $result = select ${selectStmt} from (${_.first(whereStmts).substring(
            14,
            _.size(_.first(whereStmts)) - 1,
          )} ${
            whereSlowAddition ? ` ${hasRootParams ? ' AND ' : ' WHERE '} ${whereSlowAddition} ` : ''
          } ${hasRootParams ? ')' : ''} ${
            orderByStmt ? `ORDER BY ${orderByStmt} ` : ''
          } ${paginationStmt || ''}; 
          commit
          return $result
          let $publicationName = '${this.publicationNameWithParams || ''}'
          `;
        }

        _.map(this.tempParams, function(value, property) {
          statementTemp = _.replace(
            statementTemp,
            new RegExp(':goldmine' + property, 'g'),
            typeof value === 'string' ? "'" + value + "'" : JSON.stringify(value),
          );
        });
        statements.push(statementTemp);
      }
    });

    return {
      statements,
      statementParams: { class: 's' },
      templates: this.templates,
    };
  }

  createSlowWheres(extend) {
    const extendFields = this.buildWhereExtends(_.drop(extend), '');
    return extendFields.whereStmt;
  }

  buildWhereExtends(extend, parent) {
    // select statement
    let whereStmt = '';
    _.map(extend, e => {
      const tempWhereStmt = this.buildWhereStmt(e, parent);
      if (e.extend) {
        const extendFields = this.buildWhereExtends(
          e.extend,
          (parent ? parent + '.' : '') + this.buildEdge(e.relation, e.direction),
        );
        if (_.size(whereStmt) !== 0) {
          if (_.size(extendFields.whereStmt) !== 0) {
            whereStmt += ` AND ${extendFields.whereStmt}`;
          }
        } else {
          whereStmt = extendFields.whereStmt;
        }
      }
      if (_.size(whereStmt) !== 0) {
        if (_.size(tempWhereStmt) !== 0) {
          whereStmt += ` AND ${tempWhereStmt}`;
        }
      } else {
        whereStmt = tempWhereStmt;
      }
    });

    return {
      whereStmt,
    };
  }

  buildWhereStmt(template, parent) {
    let edge = '';
    if (template.target !== undefined) {
      edge =
        (parent ? parent + '.' : '') + '' + this.buildEdge(template.relation, template.direction);
    }
    let res = '';
    if (_.isArray(template.params)) {
      _.forEach(template.params, (param, key) => {
        res += this.buildObject(param, edge) + (_.size(template.params) - 1 > key ? ' OR' : '');
      });
    } else if (_.isObject(template.params)) {
      res = this.buildObject(template.params, edge);
    } else if (typeof template.params === 'string') {
      res += this.buildPropertyValuePair('_id', template.params, '=', edge);
    }
    return res;
  }

  createWherePaths(template) {
    let paths = [];
    let ownParams = '';
    let optionalPaths = [];
    let relationString = '';
    if (template.extend && template.extend instanceof Array && _.size(template.extend) > 0) {
      optionalPaths = _.flatten(
        _.filter(
          _.map(template.new ? _.first(_.chunk(template.extend)) : template.extend, ext => {
            return this.createWherePaths(ext);
          }),
          r => {
            return r !== null;
          },
        ),
      );
    }
    // string of the current extend its where clauses
    if (template.params) {
      ownParams = this.buildObject(template.params, '');
    }
    if (template.relation) {
      relationString = `expand(${
        template.direction ? this.buildWhereDirection(template.direction) : 'both'
      }('${template.relation}')) `;
    }
    if (_.size(optionalPaths) > 0) {
      return _.map(optionalPaths, path => {
        return `select ${relationString !== '' ? relationString : ''} from ( ${path} )   ${
          ownParams !== '' ? 'WHERE ' + ownParams : ''
        }`;
      });
    } else if (ownParams !== '' || !template.relation) {
      return [
        `select ${relationString !== '' ? relationString : ''}  from \`${template.collection}\`   ${
          ownParams !== '' ? 'WHERE ' + ownParams : ''
        }`,
      ];
    }
    return null;
  }

  buildExtends(extend, parent) {
    // select statement
    let selectStmt = '';
    _.map(extend, e => {
      if (e instanceof Array) {
        _.map(e, ext => {
          const extendFields = this.buildExtends([ext], parent, true);
          selectStmt += `${
            extendFields.selectStmt
              ? ` ${_.size(_.trim(selectStmt)) > 0 ? ', ' : ''} ${extendFields.selectStmt}`
              : ''
          } `;
        });
      } else {
        const buildSelect = this.buildSelectStmt(e, parent);
        selectStmt += `${
          _.size(_.trim(selectStmt)) !== 0 && _.size(_.trim(buildSelect)) !== 0 ? ', ' : ''
        }${buildSelect}`;
        if (e.extend) {
          const extendFields = this.buildExtends(e.extend, parent + `both("${e.relation}").`);
          selectStmt += `${
            _.size(_.trim(selectStmt)) !== 0 && _.size(_.trim(extendFields.selectStmt)) !== 0
              ? ', '
              : ''
          }${extendFields.selectStmt}`;
        }
      }
    });

    return {
      selectStmt,
    };
  }

  setNextParamAvailable(value) {
    this.tempParams.push(value);
    return _.size(this.tempParams) - 1;
  }

  buildSelectStmt(template, parent) {
    let res = '';
    //extends
    if (template.target !== undefined) {
      const edge = (parent ? parent : '') + this.buildEdge(template.relation, template.direction);
      if (template.fields !== null) {
        res += ` ${edge}.@rid AS \`${_.replace(
          template.target,
          '.',
          '§',
        )}§@rid\`, ${edge}._id AS \`${_.replace(template.target, '.', '§')}§_id\``;

        _.forEach(template.fields, field => {
          if (field === '_id') {
            return;
          }
          let tempEdge = edge;
          let tempField = field;
          res += `, ${tempEdge}.${tempField} AS \`${_.replace(
            template.target,
            '.',
            '§',
          )}§${tempField}\``;
        });
      }
      if (template.edgeFields) {
        _.forEach(template.edgeFields, field => {
          res += `${template.fields === null ? '' : ', '} ${parent}${this.buildDirection(
            template.direction,
          )}E(\'${template.relation}\').${field} AS \`${_.replace(
            template.target,
            '.',
            '§',
          )}§${field}\``;
        });
      }
      // main class subscribed on
    } else {
      const size = _.size(template.fields);
      if (size !== 0) {
        res += `@rid, _id `;

        _.forEach(template.fields, field => {
          if (field === '_id') {
            return;
          }
          res += `, ${field}`;
        });
      } else {
        res += '*';
      }
    }

    return res;
  }

  buildObject(paramsObject, edge) {
    let objectRes = '(';
    let counter = 0;
    _.forEach(paramsObject, (value, property) => {
      objectRes +=
        this.buildProperty(value, property, edge) +
        (_.size(paramsObject) - 1 > counter ? ' AND' : ' )');
      counter++;
    });
    return objectRes;
  }

  buildProperty(value, property, edge) {
    if (value instanceof Array) {
      let res = '(';
      _.forEach(value, (v, i) => {
        res += this.buildPropertyObject(property, v, edge) + (_.size(value) - 1 > i ? ' OR' : ' )');
      });
      return res;
    }
    if (value instanceof Object) {
      return this.buildPropertyObject(property, value, edge);
    }
    return this.buildPropertyValuePair(property, value, '=', edge);
  }

  buildPropertyObject(propertyName, propertyObject, edge) {
    if (typeof propertyObject === 'string') {
      return this.buildPropertyValuePair(propertyName, propertyObject, '=', edge);
    } else if (propertyObject.value !== undefined && propertyObject.operator !== undefined) {
      return this.buildPropertyValuePair(
        propertyName,
        propertyObject.value,
        propertyObject.operator,
        edge,
        propertyObject.method,
      );
    } else if (propertyObject.value !== undefined) {
      return this.buildPropertyValuePair(
        propertyName,
        propertyObject.value,
        '=',
        edge,
        propertyObject.method,
      );
    } else if (propertyObject.operator !== undefined) {
      return this.buildPropertyValuePair(
        propertyName,
        null,
        propertyObject.operator,
        edge,
        propertyObject.method,
      );
    }
    return '';
  }

  // preset goldmine since number are not recognized as params by orientjs
  buildPropertyValuePair(property, value, operator, edge, method) {
    const tempParamIndex = this.setNextParamAvailable(value);
    if (value === null) {
      if (edge) {
        return ` ${edge}["${property}"] ${operator}`;
      }
      return ` \`${property}\` ${operator}`;
    }
    if (edge) {
      return ` ${edge}["${property}"]${method ? `.${method}` : ''} ${operator ||
        '='} :goldmine${tempParamIndex}`;
    }
    return ` \`${property}\`${method ? `.${method}` : ''} ${operator ||
      '='} :goldmine${tempParamIndex}`;
  }

  buildOrderByStmt(template) {
    let res = '';

    if (template.orderBy === undefined) {
      return res;
    }

    const orderBySize = _.size(template.orderBy);

    _.forEach(template.orderBy, (value, key) => {
      if (typeof value === 'string') {
        res += `${value} ${OrderTypes.ASCENDING}`;
      } else {
        res += `${value.field} ${value.direction}`;
      }

      if (orderBySize - 1 > key) {
        res += ', ';
      }
    });

    return res;
  }

  buildPaginationStmt(template) {
    let res = '';

    if (template.skip !== undefined) {
      res += `SKIP ${template.skip}`;
    }

    if (template.limit !== undefined) {
      if (_.size(res) !== 0) {
        res += ' ';
      }

      let limit = template.limit;

      if (isNaN(template.limit)) {
        limit = `${limit}`;
      }

      res += `LIMIT ${limit}`;
    }

    return res;
  }

  buildDirection(direction) {
    return direction ? (_.toLower(direction) === 'in' ? 'out' : 'in') : 'both';
  }

  buildWhereDirection(direction) {
    return direction ? (_.toLower(direction) === 'in' ? 'in' : 'out') : 'both';
  }

  buildEdge(relation, direction, isEdge = false) {
    direction = this.buildDirection(direction);

    return `${direction}${isEdge ? 'e' : ''}("${relation}")`;
  }
}
