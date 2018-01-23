import _ from 'lodash';
import pluralize from 'pluralize';
import { flattenExtend, getCollectionName, extractRid } from '../helpers/helperFunctions';

const setCache = object => {
  if (!_.has(global.objectCache, `[${object.rid.cluster}][${object.rid.position}]`)) {
    _.set(global.objectCache, `[${object.rid.cluster}][${object.rid.position}]`, object);
  }
};

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
      promises.push(global.db.query(query, { class: 's' }));
    });

    return Promise.all(promises)
      .then(values => {
        let result = [];
        _.forEach(values, (value, key) => {
          const response = this.handleResponse(this.templates[key], value);
          result.push({
            collectionName: _.has(this.templates, `${key}.collection`)
              ? getCollectionName(this.templates[key])
              : _.get(_.first(response.result), 'class', 'undefined'),
            data: response.result,
            cache: response.cache,
          });
        });
        return result;
      })
      .catch(err => {
        console.error(err);
      });
  }

  handleResponse(template, response) {
    let result = [];
    let cache = [];
    _.forEach(response, obj => {
      let formattedObject = {};
      // Add to cache
      if (_.has(obj, '@rid')) {
        cache.push(extractRid(obj['@rid']).toString());
      }

      _.forEach(obj, (value, key) => {
        if (
          key.startsWith('in_') ||
          key.startsWith('out_') ||
          !key.includes('§') ||
          key.startsWith('_') ||
          key.startsWith('rid')
        ) {
          if (key.startsWith('in_') || key.startsWith('out_')) {
            return;
          }
          formattedObject[key] = key.startsWith('_id') ? value.toString() : value;

          if (key.startsWith('rid')) {
            cache.push(value.toString());
          }
        } else if (_.size(_.get(template, 'extend')) > 0) {
          setCache(formattedObject);
          const index = key.indexOf('§');
          const target = key.substr(0, index);
          const property = key.substr(index + 1);

          let tempExtend = '';

          _.forEach(flattenExtend(template.extend), extend => {
            if (extend.target === target) {
              tempExtend = extend;
              return false;
            }
          });

          if (tempExtend !== '' && tempExtend.multi === true) {
            if (!formattedObject.hasOwnProperty(target)) {
              formattedObject[target] = [];
            }

            _.forEach(value, (item, key) => {
              if (property === '@rid') {
                cache.push(item.toString());
              }
              if (formattedObject[target][key] === undefined) {
                formattedObject[target][key] = {};
              }

              formattedObject[target][key][property] = property.startsWith('@rid')
                ? item.toString()
                : item;
            });
          } else {
            _.set(
              formattedObject,
              `${target}.${_.replace(property, '§', '.')}`,
              value instanceof Array && _.size(value) === 1 ? value[0] : value,
            );
          }
        }
      });
      if (template.extraFields) {
        _.merge(formattedObject, template.extraFields);
      }
      if (template.extend) {
        _.map(flattenExtend(template.extend), ext => {
          if (!formattedObject.hasOwnProperty(ext.target) && ext.fields !== null) {
            _.set(formattedObject, `${ext.target}`, ext.multi === true ? [] : {});
          }
        });
      }
      result.push(formattedObject);
    });

    return {
      result,
      cache,
    };
  }
}
