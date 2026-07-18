const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DATABASE_PATH } = require('../utils/config');

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const db = new Database(DATABASE_PATH);
db.pragma('journal_mode = WAL');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guildId TEXT PRIMARY KEY,
      vorstandRoleId TEXT,
      vorstandChannelId TEXT,
      campaignChannelId TEXT,
      archiveChannelId TEXT,
      panelMessageId TEXT,
      campaignMessageId TEXT,
      activeEntryId TEXT
    );

    CREATE TABLE IF NOT EXISTS wahlkreise (
      id TEXT PRIMARY KEY,
      guildId TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      guildId TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      imageUrl TEXT,
      districtId TEXT,
      createdBy TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      finishedAt INTEGER,
      status TEXT NOT NULL,
      queuePosition INTEGER NOT NULL,
      submissionCount INTEGER NOT NULL DEFAULT 0,
      maxSubmissions INTEGER NOT NULL DEFAULT 1
    );
  `);
}

initializeDatabase();

module.exports = {
  db,
  initializeDatabase,
};
