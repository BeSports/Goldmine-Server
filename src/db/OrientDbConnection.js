import orientdb from 'orientjs';

export default new orientdb.ODatabase(Object.assign({useToken: true}, global.orientDBConfig));
