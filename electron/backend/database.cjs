const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let database;

function initializeDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  database = new Database(databasePath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS power_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      description TEXT NOT NULL
    )
  `);
}

function addPowerEvent(type, description) {
  const timestamp = new Date().toISOString();
  const result = database
    .prepare(
      'INSERT INTO power_events (type, timestamp, description) VALUES (?, ?, ?)'
    )
    .run(type, timestamp, description);

  return {
    id: Number(result.lastInsertRowid),
    eventType: type,
    timestamp,
  };
}

function getPowerEvents() {
  return database
    .prepare(
      'SELECT id, type AS eventType, timestamp FROM power_events ORDER BY id DESC LIMIT 5'
    )
    .all();
}

function closeDatabase() {
  if (database?.open) database.close();
}

module.exports = {
  initializeDatabase,
  addPowerEvent,
  getPowerEvents,
  closeDatabase,
};
