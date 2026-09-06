const { ActivityType } = require('discord.js');
const { turso, initializeDatabase } = require('../database/db');
const { renderPanel, renderCampaign } = require('../services/panelManager');

module.exports = async function ready(client) {
  console.log(`✅ Eingeloggt als ${client.user.tag}`);
  client.user.setActivity('Wahlkampfverwaltung', { type: ActivityType.Watching });

  await initializeDatabase();
  console.log('✅ Datenbank initialisiert');

  const res = await turso.execute('SELECT guildId FROM guild_settings WHERE vorstandChannelId IS NOT NULL');
  const guilds = res.rows;
  for (const { guildId } of guilds) {
    await renderPanel(client, guildId).catch(err => console.error(`Panel fehler (${guildId}):`, err));
    await renderCampaign(client, guildId).catch(err => console.error(`Campaign fehler (${guildId}):`, err));
  }
  console.log(`🔄 ${guilds.length} Panel(s) aktualisiert.`);
};
