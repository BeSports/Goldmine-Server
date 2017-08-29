import _ from 'lodash';
import OrderTypes from '../enums/OrderTypes';
import Types from "../enums/Types";
import DirectionTypes from "../enums/DirectionTypes";

export default class OrientDBQueryBuilder {
  constructor(templates, params, decoded) {
    let templateTemp;
    if (typeof templates === 'function') {
      templateTemp = templates(params);
    } else {
      templateTemp = templates;
    }
    if(templateTemp instanceof Array) {
      this.templates = _.filter(templateTemp, template => {
        if (!template.permission) {
          return template;
        } else {
          return template.permission(decoded);
        }
      });
    } else if(templateTemp.permission && templateTemp.permission(decoded)) {
      this.templates = templateTemp;
    } else {
      this.templates = [];
    }
    this.tempParams = [];
  }

  build() {
    let statements = [];

    _.forEach(this.templates, template => {
      if (typeof template === 'string') {
        statements.push(template);
      } else {
        if(!template.collection) {
          console.log(`No collection name was provided to ${template}`);
        }
        
        let selectStmt = null;
        let fromStmt = null;
        let whereStmt = null;
        let orderByStmt = null;
        let paginationStmt = null;

        // TOP LEVEL
        // select statement
        selectStmt = this.buildSelectStmt(template);
        // from statement
        fromStmt = template.collection;

        // where statement
        whereStmt = this.buildWhereStmt(template);

        // order by statement
        orderByStmt = this.buildOrderByStmt(template);

        // pagination statement
        paginationStmt = this.buildPaginationStmt(template);

        // EXTENDS
        const extendFields = this.buildExtends(template.extend, '');
        selectStmt += `, ${extendFields.selectStmt}`;
        if (_.size(whereStmt) !== 0) {
          if (_.size(extendFields.whereStmt) !== 0) {
            whereStmt += ` AND ${extendFields.whereStmt}`;
          }
        } else {
          whereStmt = extendFields.whereStmt;
        }

        // Add statement
        statements.push(
          `SELECT ${selectStmt} FROM \`${fromStmt}\` ${whereStmt
            ? 'WHERE ' + whereStmt
            : ''} ${orderByStmt ? 'ORDER BY ' + orderByStmt : ''} ${paginationStmt
            ? paginationStmt
            : ''}`,
        );
      }
    });

    return {
      statements,
      statementParams: this.tempParams.reduce((acc, cur, i) =>  {
        acc['goldmine' + i] = cur;
        return acc;
      }, {}),
        templates: this.templates
    };
  }

  buildExtends(extend, parent) {
    // select statement
    let selectStmt = '';
    let whereStmt = '';
    _.map(extend, (e) => {
      selectStmt += `, ${this.buildSelectStmt(extend, parent)}`;
      const tempWhereStmt = this.buildWhereStmt(extend, parent);
      if(e.extend) {
        const extendFields =  this.buildExtends(e.extend, parent + `both(${e.relation}).`);
        selectStmt += `, ${extendFields.selectStmt}`;
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
      selectStmt,
      whereStmt
    }
  }

  setNextParamAvailable(value) {
    this.tempParams.push(value);
    return _.size(this.tempParams) - 1;
  }

  buildSelectStmt(template, parent) {
    let res = '';
    //extends
    if (template.target !== undefined) {
      const edge = this.buildEdge(template.relation, template.direction);

      res += `${parent ? parent : ''}${edge}["_id"] AS \`${template.target}§_id\``;

      _.forEach(template.fields, field => {
        let tempEdge = edge;
        let tempField = field;

        if (field.startsWith('e_')) {
          tempEdge = this.buildEdge(template.relation, template.direction, true);
          tempField = field.substr(2);
        }

        res += `, ${tempEdge}["${tempField}"] AS \`${template.target}§${tempField}\``;
      });

      // main class subscribed on
    } else {
      const size = _.size(template.fields);

      if (size !== 0) {
        res += `_id`;

        _.forEach(template.fields, field => {
          if (template.collection.type === Types.EDGE) {
            res += `, ${field} AS \`${field.replace('.','_')}\``;
          }
          else {
            res += `, ${field}`;
          }
        });
      }
      else {
        res += '*';
      }
    }

    return res;
  }

  buildWhereStmt(template) {
    let edge = '';
    if (template.target !== undefined) {
      edge = this.buildEdge(template.relation, template.direction);
    }
    let res = '';
    if (template.params instanceof Object) {
      res = this.buildObject(template.params, edge);
    } else if(template.params instanceof Array) {
      _.forEach(template.params, (param, key) => {
        res += this.buildObject(param, edge) + (_.size(template.params) - 1 > key ? ' OR' : '');
      });
    }
    return res;
  }

  buildObject(paramsObject, edge) {
    let objectRes = '(';
    let counter = 0;
    _.forEach(paramsObject, (value, property) => {
      objectRes += this.buildProperty(value, property, edge) + (_.size(paramsObject) - 1 > counter ? ' AND' : ' )');
      counter++;
    });
    return objectRes;
  }

  buildProperty(value, property, edge){
    if (value instanceof Array) {
      let res = '(';
      _.forEach(value, (v, i) => {
        res += this.buildPropertyObject(property, v, edge) + (_.size(value) - 1 > i ? ' OR' : ' )');
      })
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
      return this.buildPropertyValuePair(propertyName, propertyObject.value, propertyObject.operator, edge);
    } else if (propertyObject.value !== undefined) {
      return this.buildPropertyValuePair(propertyName, propertyObject.value, '=', edge);
    } else if (propertyObject.operator !== undefined) {
      return this.buildPropertyValuePair(propertyName, false, propertyObject.operator, edge);
    }
    return '';
  }

  // preset goldmine since number are not recognized as params by orientjs
  buildPropertyValuePair(property, value, operator, edge) {
    const tempParamIndex = this.setNextParamAvailable(value);
    if(value === false) {
      if (edge) {
        return ` ${edge}["${property}"] ${operator}`;
      }
      return ` \`${property}\` ${operator}`;
    }
    if (edge) {
      return ` ${edge}["${property}"] ${operator || '='} :goldmine${tempParamIndex}`;
    }
    return ` \`${property}\` ${operator || '='} :goldmine${tempParamIndex}`;
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
      res += `SKIP :${template.skip}`;
    }

    if (template.limit !== undefined) {
      if (_.size(res) !== 0) {
        res += ' ';
      }

      let limit = template.limit;

      if (isNaN(template.limit)) {
        limit = `:${limit}`;
      }

      res += `LIMIT ${limit}`;
    }

    return res;
  }

  buildDirection(direction) {
    return direction ? direction: DirectionTypes.BOTH;
  }

  buildEdge(relation, direction, isEdge = false) {
    direction = this.buildDirection(direction);

    return `${direction}${isEdge ? 'e' : ''}("${relation}")`;
  }
}
