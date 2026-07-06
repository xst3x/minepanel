const { db, dbAll, initDb } = require('../src/db/database');

initDb().then(async () => {
    const servers = await dbAll('SELECT * FROM servers');
    console.log('=== SERVERS IN DB ===');
    console.log(JSON.stringify(servers, null, 2));
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
