import _ from 'lodash';
import pluralize from 'pluralize';
import { getCollectionName } from '../helpers/helperFunctions';

export default class OrientDBQueryResolver {
  constructor(db, templates, queries, decoded, allowAll) {
    this.db = db;
    if (templates instanceof Array) {
      this.templates = _.filter(templates, template => {
        if (!template.permission || allowAll) {
          return template;
        } else {
          return template.permission(decoded);
        }
      });
    } else if ((templates.permission && templates.permission(decoded)) || allowAll) {
      this.templates = templates;
    } else {
      this.templates = [];
    }
    this.queries = queries;
  }

  resolve(params) {
    let promises = [];

    _.forEach(this.queries, query => {
      promises.push(this.db.query(query, { params }));
    });

    return Promise.all(promises)
      .then(values => {
        let result = [];

        _.forEach(values, (value, key) => {
          const response = this.handleResponse(this.templates[key], value);
          result.push({
            collectionName: getCollectionName(this.templates[key]),
            data: response.result,
            cache: response.cache,
            extendCache: response.extendCache
          });
        });

        return result;
      })
      .catch(err => {
        console.error('ERROR', err);
      });
  }

  handleResponse(template, response) {
    let result = [];
    let cache = [];
    let extendCache = [];
    _.forEach(response, obj => {
      let formattedObject = {};
      // Add to cache
      cache.push(obj['_id'].toString());

      _.forEach(obj, (value, key) => {
        if (
          key.startsWith('_') ||
          key.startsWith('in_') ||
          key.startsWith('out_') ||
          !key.includes('_')
        ) {
          formattedObject[key] = key.startsWith('_id') ? value.toString() : value;

          if (key.startsWith('_id')) {
            cache.push(value.toString());
          }
        } else if (_.size(template.extend) > 0) {
          const index = key.indexOf('_');
          const target = key.substr(0, index);
          const property = key.substr(index + 1);

          let tempExtend = '';

          _.forEach(template.extend, extend => {
            if (extend.target === target) {
              tempExtend = extend;
              return false;
            }
          });

          if (tempExtend !== '' && (tempExtend.multi === undefined || tempExtend.multi)) {
            if (!formattedObject.hasOwnProperty(target)) {
              formattedObject[target] = [];
            }
            _.forEach(value, (item, key) => {
              if (formattedObject[target][key] === undefined) {
                formattedObject[target][key] = {};
              }

              formattedObject[target][key][property] = property.startsWith('_id')
                ? item.toString()
                : item;

              if (property.startsWith('_id')) {
                if(!extendCache[formattedObject._id]) {
                  extendCache[formattedObject._id] = [];
                }
                extendCache[formattedObject._id].push(item.toString());
                cache.push(item.toString());
              }
            });
          } else {
            if (!formattedObject.hasOwnProperty(target)) {
              formattedObject[target] = {};
            }
            if (
              (value instanceof Array && _.size(value) === 1) ||
              (typeof value !== 'object' && !(value instanceof Array))
            ) {
              let tempValue = value;

              if (value instanceof Array) {
                tempValue = value[0];
              }
              formattedObject[target][property] = property.startsWith('_id')
                ? tempValue.toString()
                : tempValue;

              if (property.startsWith('_id')) {
                if(!extendCache[formattedObject._id]) {
                  extendCache[formattedObject._id] = [];
                }
                extendCache[formattedObject._id].push(tempValue.toString());
                cache.push(tempValue.toString());

              }
            } else {
              console.log(
                'ERROR: Result in extend "' +
                  target +
                  '" contains more than one element. Change multi to true or remove it.',
              );
            }
          }
        }
      });

      result.push(formattedObject);
    });

    return {
      result,
      cache,
      extendCache
    };
  }
}
