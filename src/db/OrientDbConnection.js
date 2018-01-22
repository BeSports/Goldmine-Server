import orientjs from 'orientjs';
import _ from 'lodash';

let dbConn = [];
let dbLiveConn = [];
let dbNext = 0;
let dbLiveNext = 0;
let dbMax = 25;
let dbLiveMax = 2;
let config;

global.nextDB = () => {
  dbNext++;
  if (dbNext >= dbMax) {
    dbNext = 0;
  }
  global.counter.dbCalls++;
  return dbConn[dbNext];
};

global.nextLiveDB = () => {
  dbLiveNext++;
  if (dbLiveNext >= dbLiveMax) {
    dbLiveNext = 0;
  }
  return dbLiveConn[dbLiveNext];
};

global.restartLiveDB = sessionId => {
  const index = _.findIndex(dbLiveConn, ['sessionId', sessionId]);
  dbLiveConn[index] = new orientjs.ODatabase(Object.assign({ useToken: true }, config.database));
};

export default function(Config) {
  config = Config;
  if (Config.connections) {
    dbMax = Config.connections;
  }

  if (Config.liveConnections) {
    dbLiveMax = Config.liveConnections;
  }

  _.times(dbMax, () => {
    const db = new orientjs.ODatabase(Object.assign({ useToken: true }, Config.database));
    dbConn.push(db);
  });

  _.times(dbLiveMax, () => {
    const db = new orientjs.ODatabase(Object.assign({ useToken: true }, Config.database));
    dbLiveConn.push(db);
  });

  // Keeps connection open with OrientDB.
  setInterval(() => {
    global
      .nextDB()
      .query('SELECT _id FROM user LIMIT 1')
      .catch(() => {
        console.error("Couldn't keep database connection alive!");
      });
  }, 60 * 1000 / dbMax);

  setInterval(() => {
    global
      .nextLiveDB()
      .query('SELECT _id FROM user LIMIT 1')
      .catch(() => {
        console.error("Couldn't keep database connection alive!");
      });
  }, 60 * 1000 / dbLiveMax);
}
