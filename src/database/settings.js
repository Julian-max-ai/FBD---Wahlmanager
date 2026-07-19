const { randomUUID } = require('crypto');
const { db } = require('./db');

function getGuildSettings(guildId) {
  return db.prepare('SELECT * FROM guild_settings WHERE guildId = ?').get(guildId) || null;
}

function saveGuildSettings(settings) {
  const existing = getGuildSettings(settings.guildId);
  if (existing) {
    db.prepare(`
      UPDATE guild_settings SET
        wahlkampftyp = ?,
        vorstandRoleId = ?,
        vorstandChannelId = ?,
        campaignChannelId = ?,
        archiveChannelId = ?,
        imageStoreChannelId = ?,
        panelMessageId = ?,
        campaignMessageId = ?,
        activeEntryId = ?
      WHERE guildId = ?
    `).run(
      settings.wahlkampftyp || null,
      settings.vorstandRoleId || null,
      settings.vorstandChannelId || null,
      settings.campaignChannelId || null,
      settings.archiveChannelId || null,
      settings.imageStoreChannelId || null,
      settings.panelMessageId || null,
      settings.campaignMessageId || null,
      settings.activeEntryId || null,
      settings.guildId,
    );
    return getGuildSettings(settings.guildId);
  }

  db.prepare(`
    INSERT INTO guild_settings (
      guildId, wahlkampftyp, vorstandRoleId, vorstandChannelId, campaignChannelId,
      archiveChannelId, imageStoreChannelId, panelMessageId, campaignMessageId, activeEntryId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    settings.guildId,
    settings.wahlkampftyp || null,
    settings.vorstandRoleId || null,
    settings.vorstandChannelId || null,
    settings.campaignChannelId || null,
    settings.archiveChannelId || null,
    settings.imageStoreChannelId || null,
    settings.panelMessageId || null,
    settings.campaignMessageId || null,
    settings.activeEntryId || null,
  );
  return getGuildSettings(settings.guildId);
}

function updateGuildSettings(guildId, updates) {
  const current = getGuildSettings(guildId);
  if (!current) return null;
  const next = { ...current, ...updates, guildId };
  return saveGuildSettings(next);
}

function ensureGuildSettings(guildId) {
  return getGuildSettings(guildId) || saveGuildSettings({ guildId });
}

function setActiveEntry(guildId, entryId) {
  return updateGuildSettings(guildId, { activeEntryId: entryId });
}

module.exports = {
  getGuildSettings,
  saveGuildSettings,
  updateGuildSettings,
  ensureGuildSettings,
  setActiveEntry,
};
