const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js');
const { getGuildSettings, saveGuildSettings, updateGuildSettings } = require('../database/settings');
const { listDistricts, addDistrict, updateDistrict, deleteDistrict } = require('../database/districts');
const { addEntry, getEntry, updateEntry, deleteEntry, getQueuedEntries, getActiveEntry } = require('../database/entries');
const { renderPanel, renderCampaign } = require('../services/panelManager');
const { createEntry, finishEntry, deleteEntryById, activateNextEntry } = require('../services/campaignManager');
const { moveEntryUp, moveEntryDown } = require('../services/queueManager');
const { isAllowed, downloadFile } = require('../services/attachmentManager');

// Temporärer Speicher für mehrstufige Flows (in-memory, reicht für single-process)
const pendingEntries = new Map();

function hasVorstandRole(interaction) {
  const settings = getGuildSettings(interaction.guildId);
  if (!settings?.vorstandRoleId) return false;
  return interaction.member.roles.cache.has(settings.vorstandRoleId);
}

// ─── SETUP FLOW ───────────────────────────────────────────────────────────────

async function handleSetupStart(interaction) {
  if (!interaction.member?.permissions?.has(8n)) {
    return interaction.reply({ content: 'Nur Administratoren dürfen das Setup ausführen.', ephemeral: true });
  }
  const roles = interaction.guild.roles.cache
    .filter(r => !r.managed && r.id !== interaction.guild.id)
    .map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id))
    .slice(0, 25);

  const select = new StringSelectMenuBuilder()
    .setCustomId('setup:role')
    .setPlaceholder('Vorstandsrolle wählen')
    .addOptions(roles);

  await interaction.reply({
    content: '**Setup (1/4):** Wähle die Vorstandsrolle.',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}

async function handleSetupChannel(interaction, target, nextContent, nextCustomId) {
  const channels = interaction.guild.channels.cache
    .filter(c => c.isTextBased())
    .map(c => new StringSelectMenuOptionBuilder().setLabel(c.name).setValue(c.id))
    .slice(0, 25);

  const select = new StringSelectMenuBuilder()
    .setCustomId(nextCustomId)
    .setPlaceholder('Kanal wählen')
    .addOptions(channels);

  await interaction.update({
    content: nextContent,
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

// ─── ENTRY CREATE FLOW ────────────────────────────────────────────────────────

async function handleCreateEntry(interaction) {
  if (!hasVorstandRole(interaction)) {
    return interaction.reply({ content: 'Nur Vorstandsmitglieder können Einträge verwalten.', ephemeral: true });
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId('entry:create:type')
    .setPlaceholder('Typ wählen')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('🖼️ Wahlplakat').setValue('poster'),
      new StringSelectMenuOptionBuilder().setLabel('📝 Rede').setValue('speech'),
    );
  await interaction.reply({
    content: 'Welchen Typ möchtest du erstellen?',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
}

// ─── ARCHIV ───────────────────────────────────────────────────────────────────

async function archiveEntry(client, guildId, entry) {
  const settings = getGuildSettings(guildId);
  if (!settings?.archiveChannelId) return;
  const channel = await client.channels.fetch(settings.archiveChannelId).catch(() => null);
  if (!channel) return;

  const districts = listDistricts(guildId);
  const districtName = districts.find(d => d.id === entry.districtId)?.name || '—';

  const embed = new EmbedBuilder()
    .setTitle(`📁 Archiv: ${entry.type === 'poster' ? '🖼️ Wahlplakat' : '📝 Rede'}`)
    .setColor(0x95a5a6)
    .addFields(
      { name: 'Titel', value: entry.title, inline: true },
      { name: 'Wahlkreis', value: districtName, inline: true },
      { name: 'Ersteller', value: `<@${entry.createdBy}>`, inline: true },
      { name: 'Erstellt am', value: new Date(entry.createdAt).toLocaleString('de-DE'), inline: true },
      { name: 'Erledigt am', value: entry.finishedAt ? new Date(entry.finishedAt).toLocaleString('de-DE') : '—', inline: true },
      { name: 'Text', value: entry.text || '—' },
    );

  const payload = { embeds: [embed] };
  if (entry.attachment) payload.files = [{ attachment: entry.attachment }];
  await channel.send(payload);
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

module.exports = async function interactionCreate(client, interaction) {

  // ── Slash Commands ──
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup') {
      return handleSetupStart(interaction);
    }
    if (interaction.commandName === 'wahlkreis') {
      if (!hasVorstandRole(interaction)) {
        return interaction.reply({ content: 'Nur Vorstandsmitglieder dürfen Wahlkreise verwalten.', ephemeral: true });
      }
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;
      if (sub === 'hinzufügen') {
        const name = interaction.options.getString('name');
        addDistrict(guildId, name);
        return interaction.reply({ content: `✅ Wahlkreis **${name}** hinzugefügt.`, ephemeral: true });
      }
      if (sub === 'bearbeiten') {
        const id = interaction.options.getString('id');
        const name = interaction.options.getString('name');
        updateDistrict(id, name);
        return interaction.reply({ content: `✅ Wahlkreis aktualisiert.`, ephemeral: true });
      }
      if (sub === 'löschen') {
        const id = interaction.options.getString('id');
        deleteDistrict(id);
        return interaction.reply({ content: '✅ Wahlkreis gelöscht.', ephemeral: true });
      }
    }
  }

  // ── Select Menus ──
  if (interaction.isStringSelectMenu()) {
    const [scope, action, ...rest] = interaction.customId.split(':');

    // Setup Flow
    if (scope === 'setup') {
      const settings = getGuildSettings(interaction.guildId) || { guildId: interaction.guildId };
      if (action === 'role') {
        settings.vorstandRoleId = interaction.values[0];
        saveGuildSettings(settings);
        return handleSetupChannel(interaction, 'vorstand', '**Setup (2/4):** Wähle den Vorstandskanal.', 'setup:channel:vorstand');
      }
      if (action === 'channel') {
        const target = rest[0];
        const updated = getGuildSettings(interaction.guildId) || { guildId: interaction.guildId };
        if (target === 'vorstand') {
          updated.vorstandChannelId = interaction.values[0];
          saveGuildSettings(updated);
          return handleSetupChannel(interaction, 'campaign', '**Setup (3/4):** Wähle den Wahlkampfkanal.', 'setup:channel:campaign');
        }
        if (target === 'campaign') {
          updated.campaignChannelId = interaction.values[0];
          saveGuildSettings(updated);
          return handleSetupChannel(interaction, 'archive', '**Setup (4/4):** Wähle den Archivkanal.', 'setup:channel:archive');
        }
        if (target === 'archive') {
          updated.archiveChannelId = interaction.values[0];
          saveGuildSettings(updated);
          await interaction.update({ content: '✅ Setup abgeschlossen! Das Panel wird erstellt...', components: [] });
          await renderPanel(client, interaction.guildId);
          await renderCampaign(client, interaction.guildId);
          return;
        }
      }
    }

    // Entry Create: Typ wählen → Modal öffnen
    if (scope === 'entry' && action === 'create' && rest[0] === 'type') {
      const entryType = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`entry:create:modal:${entryType}`)
        .setTitle(entryType === 'poster' ? '🖼️ Neues Wahlplakat' : '📝 Neue Rede')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('title').setLabel('Titel').setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('text').setLabel('Text').setStyle(TextInputStyle.Paragraph).setRequired(true),
          ),
        );
      return interaction.showModal(modal);
    }

    // Entry Create: Wahlkreis wählen → Datei-Prompt
    if (scope === 'entry' && action === 'create' && rest[0] === 'district') {
      const entryType = rest[1];
      const districtId = interaction.values[0];
      const pending = pendingEntries.get(`${interaction.user.id}:${interaction.guildId}`);
      if (!pending) return interaction.update({ content: 'Sitzung abgelaufen. Bitte neu starten.', components: [] });

      pending.districtId = districtId;

      await interaction.update({
        content: 'Möchtest du eine Datei anhängen?',
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`entry:create:attach:yes`).setLabel('✅ Ja').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`entry:create:attach:no`).setLabel('❌ Nein').setStyle(ButtonStyle.Secondary),
        )],
      });
    }
  }

  // ── Modals ──
  if (interaction.isModalSubmit()) {
    const [scope, action, ...rest] = interaction.customId.split(':');
    if (scope === 'entry' && action === 'create' && rest[0] === 'modal') {
      const entryType = rest[1];
      const title = interaction.fields.getTextInputValue('title');
      const text = interaction.fields.getTextInputValue('text');

      pendingEntries.set(`${interaction.user.id}:${interaction.guildId}`, { entryType, title, text });

      const districts = listDistricts(interaction.guildId);
      if (!districts.length) {
        return interaction.reply({ content: 'Lege zuerst mindestens einen Wahlkreis an (/wahlkreis hinzufügen).', ephemeral: true });
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`entry:create:district:${entryType}`)
        .setPlaceholder('Wahlkreis wählen')
        .addOptions(districts.map(d => new StringSelectMenuOptionBuilder().setLabel(d.name).setValue(d.id)));

      return interaction.reply({
        content: 'Bitte wähle den Wahlkreis.',
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }
  }

  // ── Buttons ──
  if (interaction.isButton()) {
    const guildId = interaction.guildId;

    if (interaction.customId === 'entry:create') {
      return handleCreateEntry(interaction);
    }

    if (interaction.customId === 'entry:refresh') {
      await renderPanel(client, guildId);
      await renderCampaign(client, guildId);
      return interaction.reply({ content: '🔄 Panel aktualisiert.', ephemeral: true });
    }

    if (interaction.customId === 'entry:finish') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: 'Keine Berechtigung.', ephemeral: true });
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: 'Keine aktive Aktion vorhanden.', ephemeral: true });
      updateEntry(active.id, { status: 'finished', finishedAt: Date.now() });
      await archiveEntry(client, guildId, { ...active, finishedAt: Date.now() });
      await activateNextEntry(client, guildId);
      return interaction.reply({ content: '✅ Eintrag als erledigt markiert und archiviert.', ephemeral: true });
    }

    if (interaction.customId === 'entry:delete') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: 'Keine Berechtigung.', ephemeral: true });
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: 'Keine aktive Aktion vorhanden.', ephemeral: true });
      await deleteEntryById(client, guildId, active.id);
      return interaction.reply({ content: '🗑️ Eintrag gelöscht.', ephemeral: true });
    }

    if (interaction.customId === 'entry:priorityUp') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: 'Keine Berechtigung.', ephemeral: true });
      const queue = getQueuedEntries(guildId);
      if (!queue.length) return interaction.reply({ content: 'Warteschlange ist leer.', ephemeral: true });
      await moveEntryUp(client, guildId, queue[0].id);
      return interaction.reply({ content: '⬆ Priorität erhöht.', ephemeral: true });
    }

    if (interaction.customId === 'entry:priorityDown') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: 'Keine Berechtigung.', ephemeral: true });
      const queue = getQueuedEntries(guildId);
      if (!queue.length) return interaction.reply({ content: 'Warteschlange ist leer.', ephemeral: true });
      await moveEntryDown(client, guildId, queue[0].id);
      return interaction.reply({ content: '⬇ Priorität gesenkt.', ephemeral: true });
    }

    if (interaction.customId === 'entry:showText') {
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: 'Keine aktive Aktion vorhanden.', ephemeral: true });
      return interaction.reply({ content: `\`\`\`\n${active.text}\n\`\`\``, ephemeral: true });
    }

    if (interaction.customId === 'entry:showAttachment') {
      const active = getActiveEntry(guildId);
      if (!active?.attachment) return interaction.reply({ content: 'Kein Dateianhang vorhanden.', ephemeral: true });
      return interaction.reply({ files: [{ attachment: active.attachment }], ephemeral: true });
    }

    // Datei anhängen: Ja
    if (interaction.customId === 'entry:create:attach:yes') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: 'Keine Berechtigung.', ephemeral: true });
      await interaction.update({ content: '📎 Bitte sende die Datei jetzt als Nachricht in diesen Kanal (du hast 60 Sekunden).', components: [] });

      const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
      const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null);

      const pending = pendingEntries.get(`${interaction.user.id}:${guildId}`);
      if (!pending) return;

      let attachmentPath = null;
      if (collected?.size) {
        const att = collected.first().attachments.first();
        if (isAllowed(att.name)) {
          const filename = `${Date.now()}_${att.name}`;
          attachmentPath = await downloadFile(att.url, filename).catch(() => null);
          await collected.first().delete().catch(() => {});
        }
      }

      await createEntry(client, guildId, { ...pending, attachment: attachmentPath, createdBy: interaction.user.id });
      pendingEntries.delete(`${interaction.user.id}:${guildId}`);
      await interaction.followUp({ content: '✅ Eintrag mit Datei erstellt und in die Warteschlange eingefügt.', ephemeral: true });
    }

    // Datei anhängen: Nein
    if (interaction.customId === 'entry:create:attach:no') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: 'Keine Berechtigung.', ephemeral: true });
      const pending = pendingEntries.get(`${interaction.user.id}:${guildId}`);
      if (!pending) return interaction.update({ content: 'Sitzung abgelaufen.', components: [] });

      await createEntry(client, guildId, { ...pending, attachment: null, createdBy: interaction.user.id });
      pendingEntries.delete(`${interaction.user.id}:${guildId}`);
      await interaction.update({ content: '✅ Eintrag erstellt und in die Warteschlange eingefügt.', components: [] });
    }
  }
};
