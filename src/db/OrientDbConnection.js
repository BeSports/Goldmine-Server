import orientdb from 'orientjs';

const OrientDBConnection = (databaseConfig) => {
  const db = orientdb.ODatabase(Object.assign({useToken: true}, databaseConfig));
  return db;
}

export default OrientDBConnection;
