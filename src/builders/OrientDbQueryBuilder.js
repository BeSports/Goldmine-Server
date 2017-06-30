import _ from 'lodash';
import OrderTypes from '../enums/OrderTypes';
import OperatorTypes from '../enums/OperatorTypes';
import Types from "../enums/Types";
import DirectionTypes from "../enums/DirectionTypes";

export default class OrientDBQueryBuilder {
  constructor(templates) {
    this.templates = templates;
  }

  build() {
    let statements = [];

    _.forEach(this.templates, template => {
      if (typeof template === 'string') {
        statements.push(template);
      } else {
        let selectStmt = null;
        let fromStmt = null;
        let whereStmt = null;
        let orderByStmt = null;
        let paginationStmt = null;

        // TOP LEVEL
        // select statement
        selectStmt = this.buildSelectStmt(template);

        // from statement
        fromStmt = template.collection.name;

        // where statement
        whereStmt = this.buildWhereStmt(template);

        // order by statement
        orderByStmt = this.buildOrderByStmt(template);

        // pagination statement
        paginationStmt = this.buildPaginationStmt(template);

        // EXTENDS
        _.forEach(template.extend, extend => {
          // select statement
          selectStmt += `, ${this.buildSelectStmt(extend)}`;

          // where statement
          const tempWhereStmt = this.buildWhereStmt(extend);

          if (_.size(whereStmt) !== 0) {
            if (_.size(tempWhereStmt) !== 0) {
              whereStmt += ` AND ${tempWhereStmt}`;
            }
          } else {
            whereStmt = tempWhereStmt;
          }
        });

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

    return statements;
  }

  buildSelectStmt(template) {
    let res = '';

    if (template.target !== undefined) {
      const edge = this.buildEdge(template.relation, template.direction);

      res += `${edge}["_id"] AS \`${template.target}__id\``;

      _.forEach(template.fields, field => {
        let tempEdge = edge;
        let tempField = field;

        if (field.startsWith('e_')) {
          tempEdge = this.buildEdge(template.relation, template.direction, true);
          tempField = field.substr(2);
        }

        res += `, ${tempEdge}["${tempField}"] AS \`${template.target}_${tempField}\``;
      });
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

  buildWhereStmt(template, params) {
    let res = '';
    let paramsHolder = params;

    if (paramsHolder === undefined) {
      paramsHolder = template.params;
    }

    const paramsSize = _.size(paramsHolder);

    _.forEach(paramsHolder, (param, key) => {
      if (param instanceof Array) {
        if (param[0] instanceof Array) {
          res += ` ( ${this.buildWhereStmt(template, param)} ) `;
        } else {
          let paramOne = param[0];
          let paramTwo = param[2];

          if (template.target !== undefined) {
            const edge = this.buildEdge(template.relation, template.direction);

            if (!paramOne.startsWith(':')) {
              paramOne = `${edge}["${paramOne}"]`;
            } else if (paramTwo !== undefined) {
              paramTwo = `${edge}["${paramTwo}"]`;
            }
          }

          if (param[1] === undefined) {
            res += ` ${paramOne} ${OperatorTypes.EQUAL} :${param[0]}`;
          } else {
            res += ` ${paramOne} ${param[1]} ${paramTwo !== undefined ? paramTwo : ''}`;
          }
        }
      }

      if (paramsSize - 1 > key && typeof param !== 'string') {
        if (paramsHolder[key + 1] instanceof Array) {
          res += ' AND';
        } else {
          res += ` ${paramsHolder[key + 1]}`;
        }
      }
    });

    return res;
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
