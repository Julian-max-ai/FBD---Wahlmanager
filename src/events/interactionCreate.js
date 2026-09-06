const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js');
const { getGuildSettings, saveGuildSettings, updateGuildSettings } = require('../database/settings');
const { listDistricts, addDistrict, updateDistrict, deleteDistrict, updateDistrictStatus, getDistrict } = require('../database/districts');
const { getActiveEntry, getQueuedEntries } = require('../database/entries');
const { renderPanel, renderCampaign, renderEnded, renderPlakatPanel } = require('../services/panelManager');
const { createEntry, awaitAndAttachImage, submitActiveEntry, finishActiveEntry, deleteEntryById } = require('../services/campaignManager');
const { run } = require('../database/db');
const { moveEntryUp, moveEntryDown } = require('../services/queueManager');
const { addPosterRequest, getPosterRequest, updatePosterRequest, addApprovedPoster, getApprovedPosters, deleteApprovedPoster } = require('../database/posterRequests');
const { addPoints, getLeaderboard } = require('../database/activity');

const pendingEntries = new Map();

async function hasVorstandRole(interaction) {
  const settings = await getGuildSettings(interaction.guildId);
  if (!settings?.vorstandRoleId) return false;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return member?.roles.cache.has(settings.vorstandRoleId) ?? false;
}


function channelOptions(interaction) {
  return interaction.guild.channels.cache
    .filter(c => c.isTextBased())
    .map(c => new StringSelectMenuOptionBuilder().setLabel(`#${c.name}`).setValue(c.id))
    .slice(0, 25);
}

function roleOptions(interaction) {
  return interaction.guild.roles.cache
    .filter(r => !r.managed && r.id !== interaction.guild.id)
    .map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id))
    .slice(0, 25);
}

async function channelSelectStep(interaction, customId, prompt) {
  await interaction.update({
    content: prompt,
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('Kanal wählen').addOptions(channelOptions(interaction))
    )],
  });
}

// ─── HAUPT-SETUP ──────────────────────────────────────────────────────────────

async function handleMainSetupStart(interaction) {
  if (!interaction.memberPermissions?.has('Administrator')) {
    return interaction.reply({ content: '❌ Nur Administratoren dürfen das Setup ausführen.', ephemeral: true });
  }
  const roles = roleOptions(interaction);
  if (!roles.length) {
    return interaction.reply({ content: '❌ Keine Rollen gefunden.', ephemeral: true });
  }
  await interaction.reply({
    content: '**Haupt-Setup (1/7):** Wähle die **Vorstandsrolle**.',
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('mainsetup:role').setPlaceholder('Vorstandsrolle wählen').addOptions(roles)
    )],
    ephemeral: true,
  });
}

// ─── WAHLKAMPF ERSTELLEN ──────────────────────────────────────────────────────

async function handleWahlkampfErstellen(interaction) {
  if (!interaction.memberPermissions?.has('Administrator')) {
    return interaction.reply({ content: '❌ Nur Administratoren können einen Wahlkampf starten.', ephemeral: true });
  }
  const settings = await getGuildSettings(interaction.guildId);
  await interaction.reply({
    content: '**Wahlkampf erstellen (1/1):** Welche Wahl wird vorbereitet?',
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('wahlkampf:wahltyp').setPlaceholder('Wahlkampftyp wählen').addOptions(
        new StringSelectMenuOptionBuilder().setLabel('🏛️ Bundestagswahl').setValue('bundestag'),
        new StringSelectMenuOptionBuilder().setLabel('🏠 Landtagswahl').setValue('landtag'),
      )
    )],
    ephemeral: true,
  });
}

// ─── ENTRY CREATE ─────────────────────────────────────────────────────────────

async function handleCreateEntry(interaction, client) {
  if (!await hasVorstandRole(interaction)) {
    return interaction.reply({ content: '❌ Nur Vorstandsmitglieder können Einträge erstellen.', ephemeral: true });
  }

  const approved = await getApprovedPosters(interaction.guildId);

  if (approved.length > 0) {
    const options = [
      new StringSelectMenuOptionBuilder().setLabel('🆕 Neues Plakat / Rede erstellen').setValue('new'),
      ...approved.slice(0, 24).map((p, i) => {
        const user = client.users.cache.get(p.submittedBy);
        const username = user ? user.username : p.submittedBy;
        const date = new Date(p.createdAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return new StringSelectMenuOptionBuilder()
          .setLabel(`🖼️ Angenommenes Plakat ${i + 1}`)
          .setDescription(`Von ${username} · ${date}`)
          .setValue(`approved:${p.id}`);
      }),
    ];
    return interaction.reply({
      content: `📋 Es gibt **${approved.length}** angenommene${approved.length === 1 ? 's' : ''} Plakat${approved.length === 1 ? '' : 'e'} das noch nicht verwendet wurde. Was möchtest du tun?`,
      components: [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('entry:create:source').setPlaceholder('Auswahl treffen').addOptions(options)
      )],
      ephemeral: true,
    });
  }

  return interaction.reply({
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

    if (interaction.commandName === 'setup') return handleMainSetupStart(interaction);

    if (interaction.commandName === 'aktivitat') {
      if (!await hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Nur Vorstandsmitglieder.', ephemeral: true });
      const board = await getLeaderboard(interaction.guildId);
      if (!board.length) return interaction.reply({ content: '📊 Noch keine Aktivitätspunkte vorhanden.', ephemeral: true });
      const lines = board.slice(0, 20).map((e, i) => `**${i + 1}.** <@${e.userId}> — **${e.total}** Punkte`);
      return interaction.reply({ content: `📊 **Aktivitäts-Leaderboard**\n\n${lines.join('\n')}`, ephemeral: true });
    }

    if (interaction.commandName === 'wahlkampf') {
      if (!interaction.memberPermissions?.has('Administrator')) {
        return interaction.reply({ content: '❌ Nur Administratoren.', ephemeral: true });
      }
      const sub = interaction.options.getSubcommand();

      if (sub === 'erstellen') return handleWahlkampfErstellen(interaction);

      if (sub === 'beenden') {
        const typ = interaction.options.getString('typ');
        const settings = await getGuildSettings(interaction.guildId);
        if (!settings || settings.wahlkampftyp !== typ) {
          const typName = typ === 'bundestag' ? 'Bundestagswahlkampf' : 'Landtagswahlkampf';
          return interaction.reply({ content: `❌ Kein aktiver **${typName}** gefunden.`, ephemeral: true });
        }
        await run("UPDATE entries SET status='finished',finishedAt=? WHERE guildId=? AND status!='finished'", [Date.now(), interaction.guildId]);
        await renderEnded(client, interaction.guildId);
        await updateGuildSettings(interaction.guildId, { activeEntryId: null, wahlkampftyp: null });
        const typName = typ === 'bundestag' ? 'Bundestagswahlkampf' : 'Landtagswahlkampf';
        return interaction.reply({ content: `✅ **${typName}** beendet.`, ephemeral: true });
      }
    }

    if (interaction.commandName === 'wahlkreis') {
      if (!await hasVorstandRole(interaction)) {
        return interaction.reply({ content: '❌ Nur Vorstandsmitglieder dürfen Wahlkreise verwalten.', ephemeral: true });
      }
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      if (sub === 'hinzufügen') {
        const name = interaction.options.getString('name');
        // Wahltyp abfragen damit Wahlkreise unabhängig vom aktiven Wahlkampf erstellt werden können
        return interaction.reply({
          content: `Für welche Wahl soll der Wahlkreis **${name}** erstellt werden?`,
          components: [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(`wahlkreis:add:${encodeURIComponent(name)}`).setPlaceholder('Wahltyp wählen').addOptions(
              new StringSelectMenuOptionBuilder().setLabel('🏛️ Bundestagswahl').setValue('bundestag'),
              new StringSelectMenuOptionBuilder().setLabel('🏠 Landtagswahl').setValue('landtag'),
            )
          )],
          ephemeral: true,
        });
      }
      if (sub === 'bearbeiten') {
        await updateDistrict(interaction.options.getString('id'), interaction.options.getString('name'));
        await renderPanel(client, guildId);
        await renderPlakatPanel(client, guildId);
        return interaction.reply({ content: '✅ Wahlkreis aktualisiert.', ephemeral: true });
      }
      if (sub === 'löschen') {
        await deleteDistrict(interaction.options.getString('id'));
        await renderPanel(client, guildId);
        await renderPlakatPanel(client, guildId);
        return interaction.reply({ content: '✅ Wahlkreis gelöscht.', ephemeral: true });
      }
      if (sub === 'liste') {
        const settings = await getGuildSettings(guildId);
        const districts = await listDistricts(guildId, settings?.wahlkampftyp);
        if (!districts.length) return interaction.reply({ content: 'Keine Wahlkreise vorhanden.', ephemeral: true });
        const statusEmoji = { green: '🟢', yellow: '🟡', red: '🔴' };
        const list = districts.map(d => `${statusEmoji[d.status] || '⚪'} **${d.name}** — ID: \`${d.id}\``).join('\n');
        return interaction.reply({ content: `**Wahlkreise:**\n${list}`, ephemeral: true });
      }
      if (sub === 'status') {
        const settings = await getGuildSettings(guildId);
        const districts = await listDistricts(guildId, settings?.wahlkampftyp);
        if (!districts.length) return interaction.reply({ content: '❌ Keine Wahlkreise vorhanden.', ephemeral: true });
        const statusEmoji = { green: '🟢', yellow: '🟡', red: '🔴' };
        const options = districts.map(d =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${statusEmoji[d.status] || '⚪'} ${d.name}`)
            .setValue(d.id)
        );
        return interaction.reply({
          content: 'Welchen Wahlkreis möchtest du bearbeiten?',
          components: [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('district:status:select').setPlaceholder('Wahlkreis wählen').addOptions(options)
          )],
          ephemeral: true,
        });
      }
    }
  }

  // ── Select Menus ──
  if (interaction.isStringSelectMenu()) {
    const [scope, action, ...rest] = interaction.customId.split(':');

    // ── Haupt-Setup ──
    if (scope === 'mainsetup') {
      const existing = await getGuildSettings(interaction.guildId) || { guildId: interaction.guildId };
      const settings = { ...existing };
      if (action === 'role') {
        settings.vorstandRoleId = interaction.values[0];
        await saveGuildSettings(settings);
        return channelSelectStep(interaction, 'mainsetup:channel:vorstand', '**Haupt-Setup (2/9):** Wähle den **Vorstandskanal**.');
      }
      if (action === 'channel') {
        const target = rest[0];
        const updated = await getGuildSettings(interaction.guildId) || { guildId: interaction.guildId };
        if (target === 'vorstand') {
          updated.vorstandChannelId = interaction.values[0];
          await saveGuildSettings(updated);
          return channelSelectStep(interaction, 'mainsetup:channel:campaign', '**Haupt-Setup (3/9):** Wähle den **Wahlkampfkanal**.');
        }
        if (target === 'campaign') {
          updated.campaignChannelId = interaction.values[0];
          await saveGuildSettings(updated);
          return channelSelectStep(interaction, 'mainsetup:channel:archive', '**Haupt-Setup (4/9):** Wähle den **Archivkanal**.');
        }
        if (target === 'archive') {
          updated.archiveChannelId = interaction.values[0];
          await saveGuildSettings(updated);
          return channelSelectStep(interaction, 'mainsetup:channel:imagestore', '**Haupt-Setup (5/9):** Wähle den **Bildspeicher-Kanal**.');
        }
        if (target === 'imagestore') {
          updated.imageStoreChannelId = interaction.values[0];
          await saveGuildSettings(updated);
          return channelSelectStep(interaction, 'mainsetup:channel:plakatrequest', '**Haupt-Setup (6/9):** Wähle den **Plakatanfragen-Kanal**.');
        }
        if (target === 'plakatrequest') {
          updated.plakatRequestChannelId = interaction.values[0];
          await saveGuildSettings(updated);
          return channelSelectStep(interaction, 'mainsetup:channel:plakatreview', '**Haupt-Setup (7/9):** Wähle den **Plakatprüfungs-Kanal**.');
        }
        if (target === 'plakatreview') {
          updated.plakatReviewChannelId = interaction.values[0];
          await saveGuildSettings(updated);
          return interaction.update({
            content: '**Haupt-Setup — Punkte (8/9):** Wie viele Punkte für ein angenommenes **Wahlplakat**?',
            components: [new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder().setCustomId('mainsetup:points:poster').setPlaceholder('Punkte wählen').addOptions(
                [1,2,3,4,5,6,7,8,9,10].map(n => new StringSelectMenuOptionBuilder().setLabel(`${n} Punkt${n>1?'e':''}`).setValue(String(n)))
              )
            )],
          });
        }
      }
      if (action === 'points') {
        const updated2 = await getGuildSettings(interaction.guildId) || { guildId: interaction.guildId };
        if (rest[0] === 'poster') {
          updated2.pointsPoster = parseInt(interaction.values[0]);
          await saveGuildSettings(updated2);
          return interaction.update({
            content: '**Haupt-Setup — Punkte (9/9):** Wie viele Punkte für eine angenommene **Rede**?',
            components: [new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder().setCustomId('mainsetup:points:speech').setPlaceholder('Punkte wählen').addOptions(
                [1,2,3,4,5,6,7,8,9,10].map(n => new StringSelectMenuOptionBuilder().setLabel(`${n} Punkt${n>1?'e':''}`).setValue(String(n)))
              )
            )],
          });
        }
        if (rest[0] === 'speech') {
          updated2.pointsSpeech = parseInt(interaction.values[0]);
          await saveGuildSettings(updated2);
          await interaction.update({ content: '✅ Haupt-Setup abgeschlossen! Plakatanfragen-Panel wird erstellt...', components: [] });
          await renderPlakatPanel(client, interaction.guildId);
          return;
        }
      }
    }

    // ── Wahlkreis hinzufügen: Typ wählen ──
    if (scope === 'wahlkreis' && action === 'add') {
      const name = decodeURIComponent(rest[0]);
      const typ = interaction.values[0];
      await addDistrict(interaction.guildId, name, typ);
      await renderPanel(client, interaction.guildId);
      await renderPlakatPanel(client, interaction.guildId);
      const typName = typ === 'bundestag' ? 'Bundestagswahl' : 'Landtagswahl';
      return interaction.update({ content: `✅ Wahlkreis **${name}** für **${typName}** hinzugefügt.`, components: [] });
    }

    // ── Wahlkampf Typ wählen ──
    if (scope === 'wahlkampf' && action === 'wahltyp') {
      const typ = interaction.values[0];
      await updateGuildSettings(interaction.guildId, { wahlkampftyp: typ });
      await interaction.update({ content: '⏳ Wahlkampf wird gestartet...', components: [] });
      await renderPanel(client, interaction.guildId);
      await renderCampaign(client, interaction.guildId);
      const typName = typ === 'bundestag' ? 'Bundestagswahlkampf' : 'Landtagswahlkampf';
      await interaction.editReply({ content: `✅ **${typName}** gestartet! Panels wurden aktualisiert.`, components: [] });
      return;
    }

    // ── Plakatanfrage: Wahlkreis wählen ──
    if (scope === 'plakat' && action === 'district' && rest[0] === 'select') {
      const pendingKey = `plakat:${interaction.user.id}:${interaction.guildId}`;
      const pending = pendingEntries.get(pendingKey);
      if (!pending) return interaction.update({ content: '⏱️ Sitzung abgelaufen.', components: [] });
      pendingEntries.delete(pendingKey);

      const districtId = interaction.values[0];
      const district = await getDistrict(districtId);
      if (district?.status === 'red') return interaction.update({ content: '❌ Dieser Wahlkreis ist gesperrt 🔴.', components: [] });

      const settings = await getGuildSettings(interaction.guildId);
      const request = await addPosterRequest(interaction.guildId, interaction.user.id, pending.imageUrl, pending.bgSource, true);
      const reviewChannel = await client.channels.fetch(settings.plakatReviewChannelId).catch(() => null);
      if (!reviewChannel) return interaction.update({ content: '❌ Prüfungskanal nicht gefunden.', components: [] });

      const embed = new EmbedBuilder()
        .setColor(0xEB459E)
        .setTitle('🖼️ Neue Plakatanfrage')
        .setDescription(`Von **${interaction.user.username}**`)
        .addFields(
          { name: '🔗 Bild-URL', value: pending.imageUrl },
          { name: '📍 Wahlkreis', value: district?.name || '—' },
          { name: '🎨 Hintergrundbild-Quelle', value: pending.bgSource || '*Keine Angabe*' },
          { name: '✅ Urheberrecht geprüft', value: 'Ja' },
        )
        .setImage(pending.imageUrl.startsWith('http') ? pending.imageUrl : null)
        .setFooter({ text: `Anfrage-ID: ${request.id}` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`plakat:approve:${request.id}`).setLabel('✅ Annehmen').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`plakat:approvereason:${request.id}`).setLabel('✅ Mit Grund').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`plakat:reject:${request.id}`).setLabel('❌ Ablehnen').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`plakat:rejectreason:${request.id}`).setLabel('❌ Mit Grund').setStyle(ButtonStyle.Danger),
      );

      await reviewChannel.send({ embeds: [embed], components: [row] });
      return interaction.update({ content: `✅ Deine Plakatanfrage wurde eingereicht! Bei Annahme erhältst du **${(await getGuildSettings(interaction.guildId))?.pointsPoster ?? 3} Punkte**.`, components: [] });
    }

    // ── Wahlkreis Status ──
    if (scope === 'district' && action === 'status') {
      if (rest[0] === 'select') {
        const districtId = interaction.values[0];
        const district = await getDistrict(districtId);
        if (!district) return interaction.update({ content: '❌ Wahlkreis nicht gefunden.', components: [] });
        return interaction.update({
          content: `**${district.name}** — Neuen Status wählen:`,
          components: [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(`district:status:set:${districtId}`).setPlaceholder('Status wählen').addOptions(
              new StringSelectMenuOptionBuilder().setLabel('🟢 Grün — Viele Plakate gebraucht').setValue('green'),
              new StringSelectMenuOptionBuilder().setLabel('🟡 Gelb — Wenige Plakate gebraucht').setValue('yellow'),
              new StringSelectMenuOptionBuilder().setLabel('🔴 Rot — Gesperrt, keine Einreichungen mehr').setValue('red'),
            )
          )],
        });
      }
      if (rest[0] === 'set') {
        const districtId = rest[1];
        const newStatus = interaction.values[0];
        await updateDistrictStatus(districtId, newStatus);
        const district = await getDistrict(districtId);
        await renderPlakatPanel(client, interaction.guildId);
        const statusLabel = { green: '🟢 Grün', yellow: '🟡 Gelb', red: '🔴 Rot' }[newStatus];
        return interaction.update({ content: `✅ Status von **${district?.name}** auf **${statusLabel}** gesetzt.`, components: [] });
      }
    }

    // ── Entry: Quelle wählen (neu oder angenommenes Plakat) ──
    if (scope === 'entry' && action === 'create' && rest[0] === 'source') {
      const value = interaction.values[0];
      if (value === 'new') {
        return interaction.update({
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
        });
      }
      // Angenommenes Plakat verwenden
      const posterId = value.replace('approved:', '');
      const poster = (await getApprovedPosters(interaction.guildId)).find(p => p.id === posterId);
      if (!poster) return interaction.update({ content: '❌ Plakat nicht mehr vorhanden.', components: [] });

      const key = `${interaction.user.id}:${interaction.guildId}`;
      pendingEntries.set(key, { type: 'poster', title: '', text: null, imageUrl: poster.imageUrl, approvedPosterId: posterId });

      const modal = new ModalBuilder()
        .setCustomId('entry:create:modal:poster:approved')
        .setTitle('🖼️ Wahlplakat — Text eingeben')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('text')
              .setLabel('Plakattext')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(1000)
              .setPlaceholder('Text der zum Plakat eingereicht wird...')
          )
        );
      return interaction.showModal(modal);
    }

    // ── Entry: Typ wählen → Modal ──
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
              .setPlaceholder(isPoster ? 'Text der zum Plakat eingereicht wird...' : 'Vollständiger Redetext...'),
          ),
        );
      return interaction.showModal(modal);
    }

    // ── Entry: Gebiet wählen ──
    if (scope === 'entry' && action === 'create' && rest[0] === 'area') {
      const key = `${interaction.user.id}:${interaction.guildId}`;
      const pending = pendingEntries.get(key);
      if (!pending) return interaction.update({ content: '⏱️ Sitzung abgelaufen.', components: [] });
      pending.targetArea = interaction.values[0];

      const settings = await getGuildSettings(interaction.guildId);
      const districts = await listDistricts(interaction.guildId, settings?.wahlkampftyp);
      if (!districts.length) {
        pendingEntries.delete(key);
        return interaction.update({ content: '❌ Lege zuerst Wahlkreise an: `/wahlkreis hinzufügen`', components: [] });
      }

      const statusEmoji = { green: '🟢', yellow: '🟡', red: '🔴' };
      const select = new StringSelectMenuBuilder()
        .setCustomId('entry:create:district')
        .setPlaceholder('Wahlkreis wählen')
        .addOptions(districts.map(d =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${statusEmoji[d.status] || '⚪'} ${d.name}`)
            .setValue(d.id)
        ));

      return interaction.update({
        content: 'Für welchen **Wahlkreis** ist dieser Eintrag?',
        components: [new ActionRowBuilder().addComponents(select)],
      });
    }

    // ── Entry: Wahlkreis wählen → Eintrag erstellen ──
    if (scope === 'entry' && action === 'create' && rest[0] === 'district') {
      const key = `${interaction.user.id}:${interaction.guildId}`;
      const pending = pendingEntries.get(key);
      if (!pending) return interaction.update({ content: '⏱️ Sitzung abgelaufen.', components: [] });
      pending.districtId = interaction.values[0];
      pendingEntries.delete(key);

      const isPoster = pending.type === 'poster';
      await interaction.update({ content: '⏳ Eintrag wird erstellt...', components: [] });
      const entry = await createEntry(client, interaction.guildId, { ...pending, createdBy: interaction.user.id });

      if (pending.approvedPosterId) {
        await deleteApprovedPoster(pending.approvedPosterId);
      }

      if (isPoster && !pending.imageUrl) {
        await interaction.editReply({
          content: `✅ Wahlplakat erstellt!\n\n📎 **Schicke jetzt das Plakat-Bild in diesen Kanal** (du hast 2 Minuten).\nErlaubte Formate: PNG, JPG, GIF, WEBP\n\n*Wenn du kein Bild schickst, wird der Eintrag ohne Bild gespeichert.*`,
        });
        const imageUrl = await awaitAndAttachImage(client, interaction.guildId, entry.id, interaction.user.id);
        if (imageUrl) {
          await interaction.editReply({ content: '✅ Bild erfolgreich gespeichert! Das Panel wurde aktualisiert.' });
        } else {
          await interaction.editReply({ content: '✅ Eintrag gespeichert (ohne Bild).' });
        }
      } else {
        await interaction.editReply({ content: '✅ Eintrag erstellt und in die Queue eingereiht.' });
      }
    }
  }

  // ── Modals ──
  if (interaction.isModalSubmit()) {
    const [scope, action, ...rest] = interaction.customId.split(':');

    // Entry Modal (normal + approved)
    if (scope === 'entry' && action === 'create' && rest[0] === 'modal') {
      const entryType = rest[1];
      const isApproved = rest[2] === 'approved';
      const text = interaction.fields.getTextInputValue('text');
      const key = `${interaction.user.id}:${interaction.guildId}`;

      if (isApproved) {
        const pending = pendingEntries.get(key);
        if (!pending) return interaction.reply({ content: '⏱️ Sitzung abgelaufen.', ephemeral: true });
        pending.text = text;
        // Direkt zu Gebiet wählen
        const areaSelect = new StringSelectMenuBuilder()
          .setCustomId('entry:create:area')
          .setPlaceholder('Gebiet wählen')
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('🏙️ Hansebund').setValue('hansebund'),
            new StringSelectMenuOptionBuilder().setLabel('🌿 Mittelmark').setValue('mittelmark'),
          );
        return interaction.reply({
          content: 'In welchem **Gebiet** soll eingereicht werden?',
          components: [new ActionRowBuilder().addComponents(areaSelect)],
          ephemeral: true,
        });
      }

      pendingEntries.set(key, { type: entryType, title: '', text, imageUrl: null });
      const areaSelect = new StringSelectMenuBuilder()
        .setCustomId('entry:create:area')
        .setPlaceholder('Gebiet wählen')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('🏙️ Hansebund').setValue('hansebund'),
          new StringSelectMenuOptionBuilder().setLabel('🌿 Mittelmark').setValue('mittelmark'),
        );
      return interaction.reply({
        content: 'In welchem **Gebiet** soll eingereicht werden?',
        components: [new ActionRowBuilder().addComponents(areaSelect)],
        ephemeral: true,
      });
    }

    // Plakatanfrage Modal
    if (scope === 'plakat' && action === 'request' && rest[0] === 'modal') {
      const imageUrl = interaction.fields.getTextInputValue('imageUrl');
      const bgSource = interaction.fields.getTextInputValue('bgSource');
      const copyrightRaw = interaction.fields.getTextInputValue('copyright').toLowerCase().trim();
      const copyrightChecked = copyrightRaw === 'ja' || copyrightRaw === 'yes';

      if (!copyrightChecked) {
        return interaction.reply({
          content: '❌ Du musst bestätigen dass das Bild **nicht** urheberrechtlich geschützt ist (Feld mit "ja" ausfüllen).',
          ephemeral: true,
        });
      }

      const settings = await getGuildSettings(interaction.guildId);
      if (!settings?.plakatReviewChannelId) {
        return interaction.reply({ content: '❌ Kein Prüfungskanal konfiguriert.', ephemeral: true });
      }
      const districts = await listDistricts(interaction.guildId, settings?.wahlkampftyp);
      const available = districts.filter(d => d.status !== 'red');
      if (districts.length > 0 && available.length === 0) {
        return interaction.reply({ content: '❌ Aktuell sind alle Wahlkreise gesperrt 🔴. Es werden keine Plakate mehr benötigt.', ephemeral: true });
      }

      if (available.length > 0) {
        const pendingKey = `plakat:${interaction.user.id}:${interaction.guildId}`;
        pendingEntries.set(pendingKey, { imageUrl, bgSource });
        const statusEmoji = { green: '🟢', yellow: '🟡' };
        return interaction.reply({
          content: 'Für welchen **Wahlkreis** ist dieses Plakat?',
          components: [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('plakat:district:select').setPlaceholder('Wahlkreis wählen').addOptions(
              available.map(d => new StringSelectMenuOptionBuilder().setLabel(`${statusEmoji[d.status] || '⚪'} ${d.name}`).setValue(d.id))
            )
          )],
          ephemeral: true,
        });
      }

      const request = await addPosterRequest(interaction.guildId, interaction.user.id, imageUrl, bgSource, true);
      const reviewChannel = await client.channels.fetch(settings.plakatReviewChannelId).catch(() => null);
      if (!reviewChannel) return interaction.reply({ content: '❌ Prüfungskanal nicht gefunden.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(0xEB459E)
        .setTitle('🖼️ Neue Plakatanfrage')
        .setDescription(`Von **${interaction.user.username}**`)
        .addFields(
          { name: '🔗 Bild-URL', value: imageUrl },
          { name: '🎨 Hintergrundbild-Quelle', value: bgSource || '*Keine Angabe*' },
          { name: '✅ Urheberrecht geprüft', value: 'Ja' },
        )
        .setImage(imageUrl.startsWith('http') ? imageUrl : null)
        .setFooter({ text: `Anfrage-ID: ${request.id}` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`plakat:approve:${request.id}`).setLabel('✅ Annehmen').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`plakat:approvereason:${request.id}`).setLabel('✅ Mit Grund').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`plakat:reject:${request.id}`).setLabel('❌ Ablehnen').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`plakat:rejectreason:${request.id}`).setLabel('❌ Mit Grund').setStyle(ButtonStyle.Danger),
      );

      await reviewChannel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: `✅ Deine Plakatanfrage wurde eingereicht! Bei Annahme erhältst du **${(await getGuildSettings(interaction.guildId))?.pointsPoster ?? 3} Punkte**.`, ephemeral: true });
    }

    // Annehmen/Ablehnen mit Grund Modal
    if (scope === 'plakat' && (action === 'approvereason' || action === 'rejectreason') && rest[0] === 'modal') {
      const requestId = rest[1];
      const reason = interaction.fields.getTextInputValue('reason');
      const isApprove = action === 'approvereason';
      const request = await getPosterRequest(requestId);
      if (!request) return interaction.reply({ content: '❌ Anfrage nicht gefunden.', ephemeral: true });

      await updatePosterRequest(requestId, { status: isApprove ? 'approved' : 'rejected', reviewNote: reason });

      if (isApprove) {
        const settings = await getGuildSettings(interaction.guildId);
        if (settings?.imageStoreChannelId) {
          const storeChannel = await client.channels.fetch(settings.imageStoreChannelId).catch(() => null);
          if (storeChannel) await storeChannel.send({ content: `🖼️ Angenommenes Plakat von <@${request.userId}>\n${request.imageUrl}` }).catch(() => {});
        }
        await addApprovedPoster(interaction.guildId, request.imageUrl, request.userId);
        const pts2 = settings?.pointsPoster ?? 3;
        await addPoints(interaction.guildId, request.userId, pts2, 'Wahlplakat angenommen');
      }

      // Anfrage-Nachricht aktualisieren
      const statusText = isApprove ? '✅ Angenommen' : '❌ Abgelehnt';
      const color = isApprove ? 0x57F287 : 0xED4245;
      await interaction.message.edit({
        embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(color).setFooter({ text: `${statusText} von ${interaction.user.tag} · Grund: ${reason}` })],
        components: [],
      }).catch(() => {});

      return interaction.reply({ content: `${statusText} mit Grund: **${reason}**`, ephemeral: true });
    }
  }

  // ── Buttons ──
  if (interaction.isButton()) {
    const guildId = interaction.guildId;

    // Plakatanfrage Button → Modal öffnen
    if (interaction.customId === 'plakat:request') {
      const modal = new ModalBuilder()
        .setCustomId('plakat:request:modal')
        .setTitle('🖼️ Wahlplakat einreichen')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('imageUrl')
              .setLabel('Bild-URL (endet auf .png, .jpg, .gif, .webp)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder('https://...')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('bgSource')
              .setLabel('Woher stammt das Hintergrundbild?')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder('Leer lassen wenn kein Hintergrundbild')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('copyright')
              .setLabel('Urheberrecht geprüft? (ja/nein)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder('ja')
          ),
        );
      return interaction.showModal(modal);
    }

    // Plakat annehmen (ohne Grund)
    if (interaction.customId.startsWith('plakat:approve:')) {
      if (!await hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const requestId = interaction.customId.replace('plakat:approve:', '');
      const request = await getPosterRequest(requestId);
      if (!request) return interaction.reply({ content: '❌ Anfrage nicht gefunden.', ephemeral: true });

      await updatePosterRequest(requestId, { status: 'approved' });

      const settings = await getGuildSettings(guildId);
      if (settings?.imageStoreChannelId) {
        const storeChannel = await client.channels.fetch(settings.imageStoreChannelId).catch(() => null);
        if (storeChannel) await storeChannel.send({ content: `🖼️ Angenommenes Plakat von <@${request.userId}>\n${request.imageUrl}` }).catch(() => {});
      }
      await addApprovedPoster(guildId, request.imageUrl, request.userId);
      const pts = (await getGuildSettings(guildId))?.pointsPoster ?? 3;
      await addPoints(guildId, request.userId, pts, 'Wahlplakat angenommen');

      await interaction.message.edit({
        embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).setFooter({ text: `✅ Angenommen von ${interaction.user.tag}` })],
        components: [],
      }).catch(() => {});

      return interaction.reply({ content: '✅ Plakat angenommen und gespeichert.', ephemeral: true });
    }

    // Plakat ablehnen (ohne Grund)
    if (interaction.customId.startsWith('plakat:reject:')) {
      if (!await hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const requestId = interaction.customId.replace('plakat:reject:', '');
      const request = await getPosterRequest(requestId);
      if (!request) return interaction.reply({ content: '❌ Anfrage nicht gefunden.', ephemeral: true });

      await updatePosterRequest(requestId, { status: 'rejected' });

      await interaction.message.edit({
        embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).setFooter({ text: `❌ Abgelehnt von ${interaction.user.tag}` })],
        components: [],
      }).catch(() => {});

      return interaction.reply({ content: '❌ Plakat abgelehnt.', ephemeral: true });
    }

    // Plakat annehmen mit Grund → Modal
    if (interaction.customId.startsWith('plakat:approvereason:')) {
      if (!await hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const requestId = interaction.customId.replace('plakat:approvereason:', '');
      const modal = new ModalBuilder()
        .setCustomId(`plakat:approvereason:modal:${requestId}`)
        .setTitle('✅ Annehmen mit Grund')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reason').setLabel('Grund').setStyle(TextInputStyle.Paragraph).setRequired(true)
        ));
      return interaction.showModal(modal);
    }

    // Plakat ablehnen mit Grund → Modal
    if (interaction.customId.startsWith('plakat:rejectreason:')) {
      if (!await hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const requestId = interaction.customId.replace('plakat:rejectreason:', '');
      const modal = new ModalBuilder()
        .setCustomId(`plakat:rejectreason:modal:${requestId}`)
        .setTitle('❌ Ablehnen mit Grund')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reason').setLabel('Grund').setStyle(TextInputStyle.Paragraph).setRequired(true)
        ));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'entry:create') return handleCreateEntry(interaction, client);

    if (interaction.customId === 'entry:refresh') {
      if (!await hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      await renderPanel(client, guildId);
      await renderCampaign(client, guildId);
      return interaction.reply({ content: '🔄 Panel aktualisiert.', ephemeral: true });
    }

    if (interaction.customId === 'entry:submit') {
      const active = await getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      const result = await submitActiveEntry(client, guildId);
      if (result.done) {
        return interaction.reply({ content: `✅ Vollständig eingereicht! **(${result.max}/${result.max})** — Nächste Aufgabe aktiviert.`, ephemeral: true });
      }
      return interaction.reply({ content: `📤 Einreichung gezählt! Fortschritt: **${result.count}/${result.max}**`, ephemeral: true });
    }

    if (interaction.customId === 'entry:showText') {
      const active = await getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      return interaction.reply({
        content: `📋 **Text zum Kopieren:**\n\`\`\`\n${active.text}\n\`\`\``,
        ephemeral: true,
      });
    }

    if (interaction.customId === 'entry:finish') {
      if (!await hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const active = await getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      await finishActiveEntry(client, guildId);
      return interaction.reply({ content: '✅ Als erledigt markiert.', ephemeral: true });
    }

    if (interaction.customId === 'entry:delete') {
      if (!await hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const active = await getActiveEntry(guildId);
      if (!active) return interaction.reply({ content: '❌ Keine aktive Aufgabe vorhanden.', ephemeral: true });
      await deleteEntryById(client, guildId, active.id);
      return interaction.reply({ content: '🗑️ Eintrag gelöscht.', ephemeral: true });
    }

    if (interaction.customId === 'entry:priorityUp') {
      if (!await hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const queue = await getQueuedEntries(guildId);
      if (queue.length < 2) return interaction.reply({ content: 'Nicht genug Einträge.', ephemeral: true });
      await moveEntryUp(client, guildId, queue[1].id);
      return interaction.reply({ content: '⬆ Verschoben.', ephemeral: true });
    }

    if (interaction.customId === 'entry:priorityDown') {
      if (!await hasVorstandRole(interaction)) return interaction.reply({ content: '❌ Keine Berechtigung.', ephemeral: true });
      const queue = await getQueuedEntries(guildId);
      if (queue.length < 2) return interaction.reply({ content: 'Nicht genug Einträge.', ephemeral: true });
      await moveEntryDown(client, guildId, queue[0].id);
      return interaction.reply({ content: '⬇ Verschoben.', ephemeral: true });
    }
  }
};
