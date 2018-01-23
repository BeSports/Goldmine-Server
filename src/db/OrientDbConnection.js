import orientjs from 'orientjs';
import _ from 'lodash';

let dbLiveConn = [];
let dbLiveNext = 0;
let dbLiveMax = 2;
let c;

global.nextLiveDB = () => {
  dbLiveNext++;
  if (dbLiveNext >= dbLiveMax) {
    dbLiveNext = 0;
  }
  return dbLiveConn[dbLiveNext];
};

global.restartLiveDB = sessionId => {
  const index = _.findIndex(dbLiveConn, ['sessionId', sessionId]);
  dbLiveConn[index] = new orientjs.ODatabase(
    Object.assign({ useToken: true }, _.merge(_.omit(c.server, 'pool'), { name: c.databaseName })),
  );
};

export default function(config) {
  c = config;
  const server = new orientjs(config.server);
  const db = server.use(
    _.merge({ name: config.databaseName }, _.pick(config.server, ['username', 'password'])),
  );
  global.db = db;

  _.times(dbLiveMax, () => {
    const db = new orientjs.ODatabase(
      Object.assign(
        { useToken: true },
        _.merge(_.omit(config.server, 'pool'), { name: config.databaseName }),
      ),
    );
    dbLiveConn.push(db);
  });

  // Keeps connection open with OrientDB.
  setInterval(() => {
    global.db.query('SELECT _id FROM V LIMIT 1').catch(() => {
      console.error("Couldn't keep database connection alive!");
    });
  }, 60 * 1000);

  setInterval(() => {
    global
      .nextLiveDB()
      .query('SELECT _id FROM V LIMIT 1')
      .catch(() => {
        console.error("Couldn't keep database connection alive!");
      });
  }, 60 * 1000 / dbLiveMax);
}
