const { ActivityType } = require('discord.js');
const { db } = require('../database/db');
const { renderPanel, renderCampaign } = require('../services/panelManager');

module.exports = async function ready(client) {
  console.log(`✅ Eingeloggt als ${client.user.tag}`);
  client.user.setActivity('Wahlkampfverwaltung', { type: ActivityType.Watching });

  // Alle konfigurierten Guilds beim Start neu rendern
  // panelMessageId/campaignMessageId sind in der DB gespeichert → Bot bearbeitet dieselbe Nachricht
  const guilds = db.prepare('SELECT guildId FROM guild_settings WHERE vorstandChannelId IS NOT NULL').all();
  for (const { guildId } of guilds) {
    await renderPanel(client, guildId).catch(err => console.error(`Panel render fehler (${guildId}):`, err));
    await renderCampaign(client, guildId).catch(err => console.error(`Campaign render fehler (${guildId}):`, err));
  }

  console.log(`🔄 ${guilds.length} Panel(s) beim Start aktualisiert.`);
};
