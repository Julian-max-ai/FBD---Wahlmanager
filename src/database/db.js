const { createClient } = require('@libsql/client');

let turso;
function getClient() {
  if (!turso) {
    turso = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return turso;
}

// Sync-kompatibler Wrapper: führt SQL sofort aus und gibt Promise zurück
// Alle DB-Dateien nutzen db.prepare().get/run/all — wir ersetzen das durch async Funktionen
// die wir in den DB-Dateien direkt aufrufen

async function initializeDatabase() {
  const turso = getClient();
  // Migrationen
  await turso.execute("ALTER TABLE wahlkreise ADD COLUMN area TEXT NOT NULL DEFAULT 'hansebund'").catch(() => {});
  await turso.execute("ALTER TABLE poster_requests ADD COLUMN districtId TEXT").catch(() => {});
  await turso.execute("ALTER TABLE activity_points ADD COLUMN campaignName TEXT").catch(() => {});
  await turso.execute("ALTER TABLE guild_settings ADD COLUMN currentCampaignName TEXT").catch(() => {});
  await turso.executeMultiple(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guildId TEXT PRIMARY KEY,
      wahlkampftyp TEXT,
      vorstandRoleId TEXT,
      vorstandChannelId TEXT,
      campaignChannelId TEXT,
      archiveChannelId TEXT,
      imageStoreChannelId TEXT,
      plakatRequestChannelId TEXT,
      plakatReviewChannelId TEXT,
      panelMessageId TEXT,
      campaignMessageId TEXT,
      plakatPanelMessageId TEXT,
      activeEntryId TEXT,
      pointsPoster INTEGER NOT NULL DEFAULT 3,
      pointsSpeech INTEGER NOT NULL DEFAULT 5
    );
    CREATE TABLE IF NOT EXISTS activity_points (
      id TEXT PRIMARY KEY,
      guildId TEXT NOT NULL,
      userId TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wahlkreise (
      id TEXT PRIMARY KEY,
      guildId TEXT NOT NULL,
      wahlkampftyp TEXT NOT NULL DEFAULT 'bundestag',
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'green',
      area TEXT NOT NULL DEFAULT 'hansebund'
    );
    CREATE TABLE IF NOT EXISTS poster_requests (
      id TEXT PRIMARY KEY,
      guildId TEXT NOT NULL,
      userId TEXT NOT NULL,
      imageUrl TEXT NOT NULL,
      bgSource TEXT,
      copyrightChecked INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewNote TEXT,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS approved_posters (
      id TEXT PRIMARY KEY,
      guildId TEXT NOT NULL,
      imageUrl TEXT NOT NULL,
      submittedBy TEXT NOT NULL,
      createdAt INTEGER NOT NULL
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
      maxSubmissions INTEGER NOT NULL DEFAULT 1,
      targetArea TEXT
    );
  `);
}

async function query(sql, args = []) {
  const res = await getClient().execute({ sql, args });
  return res.rows;
}

async function run(sql, args = []) {
  await getClient().execute({ sql, args });
}

module.exports = { get turso() { return getClient(); }, initializeDatabase, query, run };
