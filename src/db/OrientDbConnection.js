import orientjs from 'orientjs';
import _ from 'lodash';

let dbConn = [];
let dbNext = 0;
let dbMax = 25;
global.counter = 0;

global.nextDB = () => {
  if (++dbNext >= dbMax) {
    dbNext -= dbMax - 1;
  }
  global.counter++;
  return dbConn[dbNext];
};

export default function(Config) {
  if (Config.connections) {
    dbMax = Config.connections;
  }
  _.times(dbMax, () => {
    const db = new orientjs.ODatabase(Object.assign({ useToken: true }, Config.database));
    dbConn.push(db);
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
}
