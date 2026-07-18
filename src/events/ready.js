const { ActivityType } = require('discord.js');

module.exports = async function ready(client) {
  console.log(`✅ Eingeloggt als ${client.user.tag}`);
  client.user.setActivity('Wahlkampfverwaltung', { type: ActivityType.Watching });
};
