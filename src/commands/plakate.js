const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plakate')
    .setDescription('Angenommene Plakate verwalten')
    .addSubcommand(s => s.setName('liste').setDescription('Alle angenommenen Plakate anzeigen'))
    .addSubcommand(s =>
      s.setName('löschen').setDescription('Ein angenommenes Plakat löschen')
        .addStringOption(o => o.setName('id').setDescription('Plakat-ID (aus /plakate liste)').setRequired(true))
    ),
};
