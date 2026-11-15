const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function initializeDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS power_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      description TEXT NOT NULL
    )
  `);

  database.close();
}

module.exports = { initializeDatabase };