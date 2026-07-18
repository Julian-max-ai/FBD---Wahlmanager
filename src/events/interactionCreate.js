const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js');
const { getGuildSettings, saveGuildSettings, updateGuildSettings } = require('../database/settings');
const { listDistricts, addDistrict, updateDistrict, deleteDistrict } = require('../database/districts');
const { getActiveEntry, getQueuedEntries } = require('../database/entries');
const { renderPanel, renderCampaign } = require('../services/panelManager');
const { createEntry, submitActiveEntry, finishActiveEntry, deleteEntryById, activateNextEntry } = require('../services/campaignManager');
const { moveEntryUp, moveEntryDown } = require('../services/queueManager');

// Temporärer Speicher für mehrstufige Flows
const pendingEntries = new Map();

function hasVorstandRole(interaction) {
  const settings = getGuildSettings(interaction.guildId);
  if (!settings?.vorstandRoleId) return false;
  return interaction.member.roles.cache.has(settings.vorstandRoleId);
}

// ─── SETUP FLOW ───────────────────────────────────────────────────────────────

async function handleSetupStart(interaction) {
  if (!interaction.memberPermissions?.has('Administrator')) {
    return interaction.reply({ content: 'Nur Administratoren dürfen das Setup ausführen.', ephemeral: true });
  }

  const roles = interaction.guild.roles.cache
    .filter(r => !r.managed && r.id !== interaction.guild.id)
    .map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id))
    .slice(0, 25);

  if (!roles.length) {
    return interaction.reply({ content: '❌ Keine Rollen gefunden. Erstelle zuerst eine Rolle (z.B. "Bundesvorstand").', ephemeral: true });
  }

  await interaction.reply({
    content: '**Setup (1/4):** Wähle die Vorstandsrolle.',
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('setup:role').setPlaceholder('Vorstandsrolle wählen').addOptions(roles)
    )],
    ephemeral: true,
  });
}

async function channelSelectStep(interaction, customId, prompt) {
  const channels = interaction.guild.channels.cache
    .filter(c => c.isTextBased())
    .map(c => new StringSelectMenuOptionBuilder().setLabel(`#${c.name}`).setValue(c.id))
    .slice(0, 25);

  await interaction.update({
    content: prompt,
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('Kanal wählen').addOptions(channels)
    )],
  });
}

// ─── ENTRY CREATE FLOW ────────────────────────────────────────────────────────

async function handleCreateEntry(interaction) {
  if (!hasVorstandRole(interaction)) {
    return interaction.reply({ content: '❌ Nur Vorstandsmitglieder können Einträge erstellen.', ephemeral: true });
  }

  await interaction.reply({
    content: 'Was möchtest du erstellen?',
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('entry:create:type')
        .setPlaceholder('Typ wählen')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('🖼️ Wahlplakat (max. 10x einreichbar)').setValue('poster'),
          new StringSelectMenuOptionBuilder().setLabel('📝 Rede (1x einreichbar)').setValue('speech'),
        )
    )],
    ephemeral: true,
  });
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
        return interaction.reply({ content: '❌ Nur Vorstandsmitglieder dürfen Wahlkreise verwalten.', ephemeral: true });
      }
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      if (sub === 'hinzufügen') {
        const name = interaction.options.getString('name');
        addDistrict(guildId, name);
        await renderPanel(client, guildId);
        return interaction.reply({ content: `✅ Wahlkreis **${name}** hinzugefügt.`, ephemeral: true });
      }
      if (sub === 'bearbeiten') {
        const id = interaction.options.getString('id');
        const name = interaction.options.getString('name');
        updateDistrict(id, name);
        await renderPanel(client, guildId);
        return interaction.reply({ content: `✅ Wahlkreis aktualisiert.`, ephemeral: true });
      }
      if (sub === 'löschen') {
        const id = interaction.options.getString('id');
        deleteDistrict(id);
        await renderPanel(client, guildId);
        return interaction.reply({ content: '✅ Wahlkreis gelöscht.', ephemeral: true });
      }
      if (sub === 'liste') {
        const districts = listDistricts(guildId);
        if (!districts.length) return interaction.reply({ content: 'Keine Wahlkreise vorhanden.', ephemeral: true });
        const list = districts.map(d => `• **${d.name}** — ID: \`${d.id}\``).join('\n');
        return interaction.reply({ content: `**Wahlkreise:**\n${list}`, ephemeral: true });
      }
    }
  }

  // ── Select Menus ──
  if (interaction.isStringSelectMenu()) {
    const [scope, action, ...rest] = interaction.customId.split(':');

    // Setup Flow
    if (scope === 'setup') {
      if (action === 'role') {
        const settings = getGuildSettings(interaction.guildId) || { guildId: interaction.guildId };
        settings.vorstandRoleId = interaction.values[0];
        saveGuildSettings(settings);
        return channelSelectStep(interaction, 'setup:channel:vorstand', '**Setup (2/4):** Wähle den **Vorstandskanal** (nur für Vorstand sichtbar, hier ist das Verwaltungspanel).');
      }
      if (action === 'channel') {
        const target = rest[0];
        const updated = getGuildSettings(interaction.guildId) || { guildId: interaction.guildId };
        if (target === 'vorstand') {
          updated.vorstandChannelId = interaction.values[0];
          saveGuildSettings(updated);
          return channelSelectStep(interaction, 'setup:channel:campaign', '**Setup (3/4):** Wähle den **Wahlkampfkanal** (für alle Mitglieder sichtbar, zeigt die aktuelle Aufgabe).');
        }
        if (target === 'campaign') {
          updated.campaignChannelId = interaction.values[0];
          saveGuildSettings(updated);
          return channelSelectStep(interaction, 'setup:channel:archive', '**Setup (4/4):** Wähle den **Archivkanal** (erledigte Aufgaben werden hier gespeichert).');
        }
        if (target === 'archive') {
          updated.archiveChannelId = interaction.values[0];
          saveGuildSettings(updated);
          await interaction.update({ content: '✅ Setup abgeschlossen! Panels werden erstellt...', components: [] });
          await renderPanel(client, interaction.guildId);
          await renderCampaign(client, interaction.guildId);
          return;
        }
      }
    }

    // Entry Create: Typ wählen → Modal
    if (scope === 'entry' && action === 'create' && rest[0] === 'type') {
      const entryType = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`entry:create:modal:${entryType}`)
        .setTitle(entryType === 'poster' ? '🖼️ Neues Wahlplakat' : '📝 Neue Rede')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('title').setLabel('Titel').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('text').setLabel('Text / Inhalt').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('imageUrl').setLabel('Bild-URL (optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('https://...'),
          ),
        );
      return interaction.showModal(modal);
    }

    // Entry Create: Wahlkreis wählen → Eintrag speichern
    if (scope === 'entry' && action === 'create' && rest[0] === 'district') {
      const districtId = interaction.values[0];
      const key = `${interaction.user.id}:${interaction.guildId}`;
      const pending = pendingEntries.get(key);
      if (!pending) return interaction.update({ content: '⏱️ Sitzung abgelaufen. Bitte neu starten.', components: [] });

      pending.districtId = districtId;
      pendingEntries.delete(key);

      await interaction.update({ content: '⏳ Eintrag wird erstellt...', components: [] });
      await createEntry(client, interaction.guildId, { ...pending, createdBy: interaction.user.id });
      await interaction.editReply({ content: '✅ Eintrag erstellt und in die Queue eingereiht.' });
    }
  }

  // ── Modals ──
  if (interaction.isModalSubmit()) {
    const [scope, action, ...rest] = interaction.customId.split(':');

    if (scope === 'entry' && action === 'create' && rest[0] === 'modal') {
      const entryType = rest[1];
      const title = interaction.fields.getTextInputValue('title');
      const text = interaction.fields.getTextInputValue('text');
      const imageUrl = interaction.fields.getTextInputValue('imageUrl').trim() || null;

      const key = `${interaction.user.id}:${interaction.guildId}`;
      pendingEntries.set(key, { type: entryType, title, text, imageUrl });

      const districts = listDistricts(interaction.guildId);
      if (!districts.length) {
        pendingEntries.delete(key);
        return interaction.reply({ content: '❌ Lege zuerst mindestens einen Wahlkreis an: `/wahlkreis hinzufügen`', ephemeral: true });
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`entry:create:district:${entryType}`)
        .setPlaceholder('Wahlkreis wählen')
        .addOptions(districts.map(d => new StringSelectMenuOptionBuilder().setLabel(d.name).setValue(d.id)));

      return interaction.reply({
        content: 'Für welchen Wahlkreis ist dieser Eintrag?',
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

    // +1 Eingereicht
    if (interaction.customId === 'entry:submit') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });

      const result = await submitActiveEntry(client, guildId);
      if (result.done) {
        return interaction.reply({ content: `✅ **${active.title}** ist vollständig eingereicht (${result.max}/${result.max})! Nächste Aufgabe wurde aktiviert.`, ephemeral: true });
      }
      return interaction.reply({ content: `📤 Einreichung gezählt: **${result.count}/${result.max}** für "${active.title}".`, ephemeral: true });
    }

    // Manuell als fertig markieren
    if (interaction.customId === 'entry:finish') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      await finishActiveEntry(client, guildId);
      return interaction.reply({ content: `✅ **${active.title}** als erledigt markiert. Nächste Aufgabe aktiviert.`, ephemeral: true });
    }

    // Löschen
    if (interaction.customId === 'entry:delete') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      await deleteEntryById(client, guildId, active.id);
      return interaction.reply({ content: `🗑️ **${active.title}** gelöscht.`, ephemeral: true });
    }

    // Priorität hoch (ersten Queue-Eintrag nach oben – wählt zweiten und tauscht mit erstem)
    if (interaction.customId === 'entry:priorityUp') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const queue = getQueuedEntries(guildId);
      if (queue.length < 2) return interaction.reply({ content: 'Nicht genug Einträge zum Verschieben.', ephemeral: true });
      await moveEntryUp(client, guildId, queue[1].id);
      return interaction.reply({ content: '⬆ Zweiter Eintrag nach oben verschoben.', ephemeral: true });
    }

    if (interaction.customId === 'entry:priorityDown') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const queue = getQueuedEntries(guildId);
      if (queue.length < 2) return interaction.reply({ content: 'Nicht genug Einträge zum Verschieben.', ephemeral: true });
      await moveEntryDown(client, guildId, queue[0].id);
      return interaction.reply({ content: '⬇ Erster Eintrag nach unten verschoben.', ephemeral: true });
    }

    // Text des aktiven Eintrags anzeigen
    if (interaction.customId === 'entry:showText') {
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      return interaction.reply({
        content: `**${active.title}**\n\`\`\`\n${active.text}\n\`\`\`${active.imageUrl ? `\n🔗 ${active.imageUrl}` : ''}`,
        ephemeral: true,
      });
    }
  }
};
