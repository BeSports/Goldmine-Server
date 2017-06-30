import orientdb from 'orientjs';
import Config from '../config';

export default new orientdb.ODatabase(Object.assign({useToken: true}, Config.database));
