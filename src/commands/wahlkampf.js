const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wahlkampf')
    .setDescription('Wahlkampf verwalten')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s =>
      s.setName('beenden').setDescription('Aktuellen Wahlkampf beenden und System zurücksetzen')
        .addStringOption(o =>
          o.setName('typ').setDescription('Welchen Wahlkampf beenden?').setRequired(true)
            .addChoices(
              { name: '🏛️ Bundestagswahl', value: 'bundestag' },
              { name: '🏠 Landtagswahl', value: 'landtag' },
            )
        )
    ),
};
