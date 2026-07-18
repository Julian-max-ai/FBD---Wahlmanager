const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { getGuildSettings, saveGuildSettings } = require('../database/settings');
const { listDistricts, addDistrict, updateDistrict, deleteDistrict } = require('../database/districts');
const { getActiveEntry, getQueuedEntries } = require('../database/entries');
const { renderPanel, renderCampaign } = require('../services/panelManager');
const { createEntry, awaitAndAttachImage, submitActiveEntry, finishActiveEntry, deleteEntryById } = require('../services/campaignManager');
const { moveEntryUp, moveEntryDown } = require('../services/queueManager');

const pendingEntries = new Map();

function hasVorstandRole(interaction) {
  const settings = getGuildSettings(interaction.guildId);
  if (!settings?.vorstandRoleId) return false;
  return interaction.member.roles.cache.has(settings.vorstandRoleId);
}

// ─── SETUP ────────────────────────────────────────────────────────────────────

async function handleSetupStart(interaction) {
  if (!interaction.memberPermissions?.has('Administrator')) {
    return interaction.reply({ content: '❌ Nur Administratoren dürfen das Setup ausführen.', ephemeral: true });
  }
  const roles = interaction.guild.roles.cache
    .filter(r => !r.managed && r.id !== interaction.guild.id)
    .map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id))
    .slice(0, 25);

  if (!roles.length) {
    return interaction.reply({ content: '❌ Keine Rollen gefunden. Erstelle zuerst eine Rolle (z.B. "Bundesvorstand").', ephemeral: true });
  }
  await interaction.reply({
    content: '**Setup (1/5):** Wähle die Vorstandsrolle.',
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

// ─── ENTRY CREATE ─────────────────────────────────────────────────────────────

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
    if (interaction.commandName === 'setup') return handleSetupStart(interaction);

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
        updateDistrict(interaction.options.getString('id'), interaction.options.getString('name'));
        await renderPanel(client, guildId);
        return interaction.reply({ content: '✅ Wahlkreis aktualisiert.', ephemeral: true });
      }
      if (sub === 'löschen') {
        deleteDistrict(interaction.options.getString('id'));
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

    // Setup
    if (scope === 'setup') {
      if (action === 'role') {
        const settings = getGuildSettings(interaction.guildId) || { guildId: interaction.guildId };
        settings.vorstandRoleId = interaction.values[0];
        saveGuildSettings(settings);
        return channelSelectStep(interaction, 'setup:channel:vorstand', '**Setup (2/5):** Wähle den **Vorstandskanal** (nur für Vorstand sichtbar).');
      }
      if (action === 'channel') {
        const target = rest[0];
        const updated = getGuildSettings(interaction.guildId) || { guildId: interaction.guildId };
        if (target === 'vorstand') {
          updated.vorstandChannelId = interaction.values[0];
          saveGuildSettings(updated);
          return channelSelectStep(interaction, 'setup:channel:campaign', '**Setup (3/5):** Wähle den **Wahlkampfkanal** (für alle Mitglieder sichtbar).');
        }
        if (target === 'campaign') {
          updated.campaignChannelId = interaction.values[0];
          saveGuildSettings(updated);
          return channelSelectStep(interaction, 'setup:channel:archive', '**Setup (4/5):** Wähle den **Archivkanal**.');
        }
        if (target === 'archive') {
          updated.archiveChannelId = interaction.values[0];
          saveGuildSettings(updated);
          return channelSelectStep(interaction, 'setup:channel:imagestore', '**Setup (5/5):** Wähle den **Bildspeicher-Kanal** (unsichtbar für Mitglieder, speichert Plakat-Bilder dauerhaft).');
        }
        if (target === 'imagestore') {
          updated.imageStoreChannelId = interaction.values[0];
          saveGuildSettings(updated);
          await interaction.update({ content: '✅ Setup abgeschlossen! Panels werden erstellt...', components: [] });
          await renderPanel(client, interaction.guildId);
          await renderCampaign(client, interaction.guildId);
          return;
        }
      }
    }

    // Entry: Typ wählen → Modal
    if (scope === 'entry' && action === 'create' && rest[0] === 'type') {
      const entryType = interaction.values[0];
      const isPoster = entryType === 'poster';
      const modal = new ModalBuilder()
        .setCustomId(`entry:create:modal:${entryType}`)
        .setTitle(isPoster ? '🖼️ Neues Wahlplakat' : '📝 Neue Rede')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('text')
              .setLabel(isPoster ? 'Plakattext' : 'Redetext')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(1000)
              .setPlaceholder(isPoster ? 'Text der auf dem Plakat steht...' : 'Vollständiger Redetext...'),
          ),
        );
      return interaction.showModal(modal);
    }

    // Entry: Gebiet wählen → Wahlkreis wählen
    if (scope === 'entry' && action === 'create' && rest[0] === 'area') {
      const key = `${interaction.user.id}:${interaction.guildId}`;
      const pending = pendingEntries.get(key);
      if (!pending) return interaction.update({ content: '⏱️ Sitzung abgelaufen.', components: [] });

      pending.targetArea = interaction.values[0];

      const districts = listDistricts(interaction.guildId);
      if (!districts.length) {
        pendingEntries.delete(key);
        return interaction.update({ content: '❌ Lege zuerst Wahlkreise an: `/wahlkreis hinzufügen`', components: [] });
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`entry:create:district`)
        .setPlaceholder('Wahlkreis wählen')
        .addOptions(districts.map(d => new StringSelectMenuOptionBuilder().setLabel(d.name).setValue(d.id)));

      return interaction.update({
        content: 'Für welchen **Wahlkreis** ist dieser Eintrag?',
        components: [new ActionRowBuilder().addComponents(select)],
      });
    }

    // Entry: Wahlkreis wählen → Eintrag erstellen
    if (scope === 'entry' && action === 'create' && rest[0] === 'district') {
      const key = `${interaction.user.id}:${interaction.guildId}`;
      const pending = pendingEntries.get(key);
      if (!pending) return interaction.update({ content: '⏱️ Sitzung abgelaufen.', components: [] });

      pending.districtId = interaction.values[0];
      pendingEntries.delete(key);

      const isPoster = pending.type === 'poster';

      await interaction.update({ content: '⏳ Eintrag wird erstellt...', components: [] });
      const entry = await createEntry(client, interaction.guildId, { ...pending, createdBy: interaction.user.id });

      if (isPoster) {
        // Bild-Upload Flow: Bot wartet 2 Minuten auf ein Bild
        await interaction.editReply({
          content: `✅ Wahlplakat erstellt!\n\n📎 **Schicke jetzt das Plakat-Bild in diesen Kanal** (du hast 2 Minuten).\nErlaubte Formate: PNG, JPG, GIF, WEBP\n\n*Wenn du kein Bild schickst, wird der Eintrag ohne Bild gespeichert.*`,
        });

        const imageUrl = await awaitAndAttachImage(client, interaction.guildId, entry.id, interaction.user.id);
        if (imageUrl) {
          await interaction.editReply({ content: '✅ Bild erfolgreich gespeichert! Das Panel wurde aktualisiert.' });
        } else {
          await interaction.editReply({ content: '✅ Eintrag gespeichert (ohne Bild). Du kannst es später über einen neuen Eintrag hinzufügen.' });
        }
      } else {
        await interaction.editReply({ content: '✅ Rede erstellt und in die Queue eingereiht.' });
      }
    }
  }

  // ── Modals ──
  if (interaction.isModalSubmit()) {
    const [scope, action, ...rest] = interaction.customId.split(':');

    if (scope === 'entry' && action === 'create' && rest[0] === 'modal') {
      const entryType = rest[1];
      const text = interaction.fields.getTextInputValue('text');
      const key = `${interaction.user.id}:${interaction.guildId}`;

      pendingEntries.set(key, { type: entryType, title: '', text, imageUrl: null });

      // Gebiet wählen
      const areaSelect = new StringSelectMenuBuilder()
        .setCustomId('entry:create:area')
        .setPlaceholder('Gebiet wählen')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('🏙️ Hansebund').setDescription('Einreichen im Hansebund-Kanal').setValue('hansebund'),
          new StringSelectMenuOptionBuilder().setLabel('🌿 Mittelmark').setDescription('Einreichen im Mittelmark-Kanal').setValue('mittelmark'),
        );

      return interaction.reply({
        content: 'In welchem **Gebiet** soll eingereicht werden?',
        components: [new ActionRowBuilder().addComponents(areaSelect)],
        ephemeral: true,
      });
    }
  }

  // ── Buttons ──
  if (interaction.isButton()) {
    const guildId = interaction.guildId;

    if (interaction.customId === 'entry:create') return handleCreateEntry(interaction);

    if (interaction.customId === 'entry:refresh') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      await renderPanel(client, guildId);
      await renderCampaign(client, guildId);
      return interaction.reply({ content: '🔄 Panel aktualisiert.', ephemeral: true });
    }

    // +1 Eingereicht — für alle zugänglich
    if (interaction.customId === 'entry:submit') {
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      const result = await submitActiveEntry(client, guildId);
      if (result.done) {
        return interaction.reply({ content: `✅ Vollständig eingereicht! **(${result.max}/${result.max})** — Nächste Aufgabe wurde aktiviert.`, ephemeral: true });
      }
      return interaction.reply({ content: `📤 Einreichung gezählt! Fortschritt: **${result.count}/${result.max}**`, ephemeral: true });
    }

    // Text kopieren — für alle zugänglich
    if (interaction.customId === 'entry:showText') {
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      return interaction.reply({
        content: `📋 **Text zum Kopieren:**\n\`\`\`\n${active.text}\n\`\`\``,
        ephemeral: true,
      });
    }

    // Ab hier nur Vorstand
    if (interaction.customId === 'entry:finish') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      await finishActiveEntry(client, guildId);
      return interaction.reply({ content: `✅ Als erledigt markiert. Nächste Aufgabe aktiviert.`, ephemeral: true });
    }

    if (interaction.customId === 'entry:delete') {
      if (!hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const active = getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      await deleteEntryById(client, guildId, active.id);
      return interaction.reply({ content: `🗑️ Eintrag gelöscht.`, ephemeral: true });
    }

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
  }
};
