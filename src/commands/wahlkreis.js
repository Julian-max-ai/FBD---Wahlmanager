const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wahlkreis')
    .setDescription('Verwaltet Wahlkreise für die Kampagnenorganisation')
    .addSubcommand(s =>
      s.setName('hinzufügen').setDescription('Einen neuen Wahlkreis hinzufügen')
        .addStringOption(o => o.setName('name').setDescription('Name des Wahlkreises').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('bearbeiten').setDescription('Einen Wahlkreis umbenennen')
        .addStringOption(o => o.setName('id').setDescription('Wahlkreis-ID (aus /wahlkreis liste)').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Neuer Name').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('löschen').setDescription('Einen Wahlkreis löschen')
        .addStringOption(o => o.setName('id').setDescription('Wahlkreis-ID (aus /wahlkreis liste)').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('liste').setDescription('Alle Wahlkreise mit IDs anzeigen')
    ),
};
