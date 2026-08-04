const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aktivitat')
    .setDescription('Aktivitäts-Leaderboard anzeigen')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
};
