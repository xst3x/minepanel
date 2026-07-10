const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const dbPath = path.join(__dirname, '../data/minepanel.db');
const db = new sqlite3.Database(dbPath);

async function main() {
    const hash = await bcrypt.hash('admin', 12);
    db.run("UPDATE users SET password = ? WHERE username = ?;", [hash, 'admin'], function(err) {
        if (err) {
            console.error("Error updating admin password:", err);
        } else {
            console.log("Admin password successfully set to: admin");
        }
        db.close();
    });
}

main().catch(console.error);
