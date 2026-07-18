const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wahlkreis')
    .setDescription('Verwaltet Wahlkreise für die Kampagnenorganisation')
    .addSubcommand(subcommand =>
      subcommand.setName('hinzufügen').setDescription('Einen neuen Wahlkreis hinzufügen').addStringOption(option => option.setName('name').setDescription('Name des Wahlkreises').setRequired(true)),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('bearbeiten').setDescription('Einen Wahlkreis bearbeiten').addStringOption(option => option.setName('id').setDescription('Wahlkreis-ID').setRequired(true)).addStringOption(option => option.setName('name').setDescription('Neuer Name').setRequired(true)),
    )
    .addSubcommand(subcommand =>
      subcommand.setName('löschen').setDescription('Einen Wahlkreis löschen').addStringOption(option => option.setName('id').setDescription('Wahlkreis-ID').setRequired(true)),
    ),
};
