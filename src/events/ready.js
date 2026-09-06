const { ActivityType } = require('discord.js');
const { db, initializeDatabase } = require('../database/db');
const { renderPanel, renderCampaign } = require('../services/panelManager');

module.exports = async function ready(client) {
  console.log(`✅ Eingeloggt als ${client.user.tag}`);
  client.user.setActivity('Wahlkampfverwaltung', { type: ActivityType.Watching });

  await initializeDatabase();

  const res = await db.execute('SELECT guildId FROM guild_settings WHERE vorstandChannelId IS NOT NULL');
  const guilds = res.rows;
  for (const { guildId } of guilds) {
    await renderPanel(client, guildId).catch(err => console.error(`Panel render fehler (${guildId}):`, err));
    await renderCampaign(client, guildId).catch(err => console.error(`Campaign render fehler (${guildId}):`, err));
  }

  console.log(`🔄 ${guilds.length} Panel(s) beim Start aktualisiert.`);
};
