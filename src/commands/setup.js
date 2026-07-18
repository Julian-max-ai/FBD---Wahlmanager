const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Richtet die Wahlkampfverwaltung für diesen Server ein.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
};
