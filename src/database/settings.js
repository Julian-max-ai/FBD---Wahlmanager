const { db } = require('./db');

async function getGuildSettings(guildId) {
  const res = await db.execute({ sql: 'SELECT * FROM guild_settings WHERE guildId = ?', args: [guildId] });
  return res.rows[0] || null;
}

async function saveGuildSettings(settings) {
  const existing = await getGuildSettings(settings.guildId);
  const merged = existing
    ? { ...existing, ...Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined)) }
    : settings;

  if (existing) {
    await db.execute({
      sql: `UPDATE guild_settings SET
        wahlkampftyp=?, vorstandRoleId=?, vorstandChannelId=?, campaignChannelId=?,
        archiveChannelId=?, imageStoreChannelId=?, plakatRequestChannelId=?, plakatReviewChannelId=?,
        panelMessageId=?, campaignMessageId=?, plakatPanelMessageId=?, activeEntryId=?,
        pointsPoster=?, pointsSpeech=? WHERE guildId=?`,
      args: [
        merged.wahlkampftyp ?? null, merged.vorstandRoleId ?? null, merged.vorstandChannelId ?? null,
        merged.campaignChannelId ?? null, merged.archiveChannelId ?? null, merged.imageStoreChannelId ?? null,
        merged.plakatRequestChannelId ?? null, merged.plakatReviewChannelId ?? null,
        merged.panelMessageId ?? null, merged.campaignMessageId ?? null, merged.plakatPanelMessageId ?? null,
        merged.activeEntryId ?? null, merged.pointsPoster ?? 3, merged.pointsSpeech ?? 5, merged.guildId,
      ],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO guild_settings (
        guildId, wahlkampftyp, vorstandRoleId, vorstandChannelId, campaignChannelId,
        archiveChannelId, imageStoreChannelId, plakatRequestChannelId, plakatReviewChannelId,
        panelMessageId, campaignMessageId, plakatPanelMessageId, activeEntryId, pointsPoster, pointsSpeech
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        merged.guildId, merged.wahlkampftyp ?? null, merged.vorstandRoleId ?? null,
        merged.vorstandChannelId ?? null, merged.campaignChannelId ?? null, merged.archiveChannelId ?? null,
        merged.imageStoreChannelId ?? null, merged.plakatRequestChannelId ?? null, merged.plakatReviewChannelId ?? null,
        merged.panelMessageId ?? null, merged.campaignMessageId ?? null, merged.plakatPanelMessageId ?? null,
        merged.activeEntryId ?? null, merged.pointsPoster ?? 3, merged.pointsSpeech ?? 5,
      ],
    });
  }
  return getGuildSettings(merged.guildId);
}

async function updateGuildSettings(guildId, updates) {
  const current = await getGuildSettings(guildId);
  if (!current) return null;
  return saveGuildSettings({ ...current, ...updates, guildId });
}

async function ensureGuildSettings(guildId) {
  return (await getGuildSettings(guildId)) || saveGuildSettings({ guildId });
}

async function setActiveEntry(guildId, entryId) {
  return updateGuildSettings(guildId, { activeEntryId: entryId });
}

module.exports = { getGuildSettings, saveGuildSettings, updateGuildSettings, ensureGuildSettings, setActiveEntry };
