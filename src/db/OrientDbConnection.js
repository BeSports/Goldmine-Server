import orientjs from 'orientjs';

export default function (Config) {
  if(Config.server) {
    const server = orientjs(Object.assign({useToken: true}, Config.server));
    return server.use(Config.database);
  } else {
    const db = new orientjs.ODatabase(Object.assign({useToken: true}, Config.database));
    return db;
  }
};
