const { dbAll, dbGet } = require('../src/db/database');
(async () => {
  try {
    const ranks = await dbAll('SELECT id,name,global_permissions FROM ranks');
    console.log('RANKS:', JSON.stringify(ranks, null, 2));

    const users = await dbAll('SELECT id, username, role, rank_id FROM users');
    console.log('USERS:', JSON.stringify(users, null, 2));

    const usp = await dbAll('SELECT * FROM user_server_permissions');
    console.log('USER_SERVER_PERMISSIONS:', JSON.stringify(usp, null, 2));

    const usr = await dbAll('SELECT * FROM user_server_ranks');
    console.log('USER_SERVER_RANKS:', JSON.stringify(usr, null, 2));
  } catch (e) {
    console.error('ERR', e);
  }
  process.exit(0);
})();
