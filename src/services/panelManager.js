const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../database/settings');
const { listDistricts } = require('../database/districts');
const { getQueuedEntries, getActiveEntry, getStats } = require('../database/entries');
const ui = require('../utils/ui');

const AREA_LINKS = {
  bundestag: {
    hansebund: 'https://discordapp.com/channels/1429208511056969851/1475854549271969822',
    mittelmark: 'https://discordapp.com/channels/1429208511056969851/1475853973368995861',
  },
  landtag: {
    hansebund: 'https://discordapp.com/channels/1429208511056969851/1475893765507125330',
    mittelmark: 'https://discordapp.com/channels/1429208511056969851/1475893457233907853',
  },
};

const AREA_LABELS = { hansebund: '🏙️ Hansebund', mittelmark: '🌿 Mittelmark' };
const WAHLTYP_LABELS = { bundestag: '🏛️ Bundestagswahl', landtag: '🏠 Landtagswahl' };

function getAreaLink(settings, area) {
  return AREA_LINKS[settings?.wahlkampftyp || 'bundestag']?.[area] || null;
}

function progressBar(count, max) {
  const filled = Math.round((count / max) * 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}  \`${count}/${max}\``;
}

function districtName(districts, id) {
  return districts.find(d => d.id === id)?.name || '—';
}

function typeLabel(type) {
  return type === 'poster' ? '🖼️ Wahlplakat' : '📝 Rede';
}

function areaLabel(area) {
  return AREA_LABELS[area] || '—';
}

function wahltypLabel(settings) {
  return WAHLTYP_LABELS[settings?.wahlkampftyp] || '🗳️ Wahlkampf';
}

function campaignTitle(settings) {
  const typ = wahltypLabel(settings);
  const name = settings?.currentCampaignName;
  return name ? `${typ} — ${name}` : typ;
}

// ─── VORSTANDSPANEL ───────────────────────────────────────────────────────────

async function renderPanel(client, guildId) {
  const settings = await getGuildSettings(guildId);
  if (!settings?.vorstandChannelId) return;
  const channel = await client.channels.fetch(settings.vorstandChannelId).catch(() => null);
  if (!channel) return;
  const active = await getActiveEntry(guildId);
  const queue = await getQueuedEntries(guildId);
  const districts = await listDistricts(guildId, settings.wahlkampftyp);
  const stats = await getStats(guildId);

  const guild = channel.guild;
  const embed = new EmbedBuilder()
    .setColor(ui.C.panel)
    .setAuthor({ name: 'Vorstandspanel  ·  intern' })
    .setTitle(campaignTitle(settings))
    .setDescription(`Nur für Vorstandsmitglieder\n${ui.RULE}`);
  ui.applyThumb(embed, guild);

  embed.addFields(...ui.wideBar('vorstand', 'steuerung', 'live'));

  if (active) {
    const district = districtName(districts, active.districtId);
    const bar = progressBar(active.submissionCount, active.maxSubmissions);
    const area = active.targetArea ? areaLabel(active.targetArea) : '—';
    const link = active.targetArea ? getAreaLink(settings, active.targetArea) : null;

    embed.addFields(
      { name: 'Typ', value: typeLabel(active.type), inline: true },
      { name: 'Wahlkreis', value: district, inline: true },
      { name: 'Gebiet', value: area, inline: true },
      { name: 'Text', value: `\`\`\`\n${active.text.slice(0, 250)}${active.text.length > 250 ? '…' : ''}\n\`\`\`` },
      { name: 'Fortschritt', value: bar, inline: true },
      { name: 'Bild', value: active.imageUrl ? `[Vorschau öffnen](${active.imageUrl})` : '*kein Bild*', inline: true },
      { name: 'Kanal', value: link ? `[Zum Einreichungskanal](${link})` : '—', inline: true },
    );
    if (active.imageUrl?.startsWith('http')) embed.setImage(active.imageUrl);
  } else {
    embed.addFields({
      name: 'Aktive Aufgabe',
      value: '*Keine aktive Aufgabe.*\nNeuen Eintrag über den Button unten anlegen.',
    });
  }

  if (queue.length) {
    const lines = queue.slice(0, 8).map((e, i) => {
      const d = districtName(districts, e.districtId);
      const a = e.targetArea ? areaLabel(e.targetArea) : '—';
      const tag = i === 0 ? '**nächste**' : `\`${i + 1}\``;
      return `${tag}  ·  ${typeLabel(e.type)}  ·  ${d}  ·  ${a}`;
    });
    if (queue.length > 8) lines.push(`*… und ${queue.length - 8} weitere*`);
    embed.addFields({ name: `Warteschlange  ·  ${queue.length}`, value: lines.join('\n') });
  } else {
    embed.addFields({ name: 'Warteschlange', value: '*Leer*' });
  }

  embed.addFields(
    { name: 'Erledigt', value: `\`${stats.finished}\``, inline: true },
    { name: 'Offen', value: `\`${stats.open}\``, inline: true },
    { name: 'Gesamt', value: `\`${stats.finished + stats.open}\``, inline: true },
  );
  embed.setFooter(ui.FOOTER).setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entry:create').setLabel('➕ Neu erstellen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('entry:submit').setLabel('📤 +1 Eingereicht').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('entry:finish').setLabel('✅ Fertig markieren').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entry:delete').setLabel('🗑️ Löschen').setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entry:priorityUp').setLabel('⬆ Priorität hoch').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entry:priorityDown').setLabel('⬇ Priorität runter').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entry:showText').setLabel('📋 Text kopieren').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entry:refresh').setLabel('🔄 Aktualisieren').setStyle(ButtonStyle.Secondary),
  );

  const payload = { embeds: [embed], components: [row1, row2] };
  if (settings.panelMessageId) {
    const msg = await channel.messages.fetch(settings.panelMessageId).catch(() => null);
    if (msg) { await msg.edit(payload); return; }
  }
  const sent = await channel.send(payload);
  await updateGuildSettings(guildId, { panelMessageId: sent.id });
}

// ─── MITGLIEDERPANEL ──────────────────────────────────────────────────────────

async function renderCampaign(client, guildId) {
  const settings = await getGuildSettings(guildId);
  if (!settings?.campaignChannelId) return;
  const channel = await client.channels.fetch(settings.campaignChannelId).catch(() => null);
  if (!channel) return;
  const active = await getActiveEntry(guildId);
  const queue = await getQueuedEntries(guildId);
  const districts = await listDistricts(guildId, settings.wahlkampftyp);

  let embed;
  if (active) {
    const district = districtName(districts, active.districtId);
    const bar = progressBar(active.submissionCount, active.maxSubmissions);
    const area = active.targetArea ? areaLabel(active.targetArea) : null;
    const areaLink = active.targetArea ? getAreaLink(settings, active.targetArea) : null;

    embed = new EmbedBuilder()
      .setColor(ui.C.campaign)
      .setAuthor({ name: campaignTitle(settings) })
      .setTitle('Aktuelle Aufgabe')
      .setDescription(`Bitte auf dem Bundestagsserver einreichen.\n${ui.RULE}`);
    ui.applyThumb(embed, channel.guild);
    embed.addFields(
      ...ui.wideBar('aufgabe', 'mitglieder', 'live'),
      { name: 'Material', value: typeLabel(active.type), inline: true },
      { name: 'Wahlkreis', value: district, inline: true },
      { name: 'Gebiet', value: area || '—', inline: true },
      { name: 'Text zum Einreichen', value: `\`\`\`\n${active.text.slice(0, 1000)}\n\`\`\`` },
      { name: 'Fortschritt', value: bar, inline: true },
      { name: 'Einreichen', value: areaLink ? `[Kanal öffnen](${areaLink})` : '—', inline: true },
      { name: 'Plakat', value: active.imageUrl ? `[Bild öffnen](${active.imageUrl})` : '*kein Bild*', inline: true },
    );
    if (active.imageUrl?.startsWith('http')) embed.setImage(active.imageUrl);
    if (queue.length > 0) {
      const next = queue[0];
      embed.addFields({
        name: 'Als nächstes',
        value: `${typeLabel(next.type)}  ·  ${districtName(districts, next.districtId)}  ·  ${next.targetArea ? areaLabel(next.targetArea) : '—'}`,
      });
    }
    embed.setFooter({ text: 'Nach dem Einreichen auf „+1 Eingereicht“ klicken' }).setTimestamp();
  } else {
    embed = new EmbedBuilder()
      .setColor(ui.C.mute)
      .setAuthor({ name: campaignTitle(settings) })
      .setTitle('Aktuelle Aufgabe')
      .setDescription(`*Aktuell keine aktive Aufgabe.*\nSchaut später nochmal vorbei.\n${ui.RULE}`)
      .addFields(...ui.wideBar('pause', 'mitglieder', 'FBD'))
      .setFooter(ui.FOOTER).setTimestamp();
    ui.applyThumb(embed, channel.guild);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entry:submit').setLabel('📤 +1 Eingereicht').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('entry:showText').setLabel('📋 Text kopieren').setStyle(ButtonStyle.Secondary),
  );

  const payload = { embeds: [embed], components: active ? [row] : [] };
  if (settings.campaignMessageId) {
    const msg = await channel.messages.fetch(settings.campaignMessageId).catch(() => null);
    if (msg) { await msg.edit(payload); return; }
  }
  const sent = await channel.send(payload);
  await updateGuildSettings(guildId, { campaignMessageId: sent.id });
}

// ─── WAHLKAMPF BEENDET ────────────────────────────────────────────────────────

async function renderEnded(client, guildId) {
  const settings = await getGuildSettings(guildId);
  const stats = await getStats(guildId);
  const title = campaignTitle(settings);

  if (settings?.vorstandChannelId && settings?.panelMessageId) {
    const vc = await client.channels.fetch(settings.vorstandChannelId).catch(() => null);
    if (vc) {
      const pm = await vc.messages.fetch(settings.panelMessageId).catch(() => null);
      if (pm) {
        const panelEmbed = new EmbedBuilder()
          .setColor(ui.C.mute)
          .setAuthor({ name: 'Vorstandspanel  ·  intern' })
          .setTitle('Kein aktiver Wahlkampf')
          .setDescription(`Neuen Wahlkampf starten mit \`/wahlkampf erstellen\`.\n${ui.RULE}`)
          .addFields(
            ...ui.wideBar('pause', 'vorstand', 'FBD'),
            { name: 'Aktive Aufgabe', value: '*Kein aktiver Wahlkampf.*' },
            { name: 'Warteschlange', value: '*Leer*' },
            { name: 'Erledigt', value: `\`${stats.finished}\``, inline: true },
            { name: 'Offen', value: '`0`', inline: true },
            { name: 'Gesamt', value: `\`${stats.finished}\``, inline: true },
          )
          .setFooter(ui.FOOTER).setTimestamp();
        ui.applyThumb(panelEmbed, vc.guild);

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('entry:create').setLabel('➕ Neu erstellen').setStyle(ButtonStyle.Primary).setDisabled(true),
          new ButtonBuilder().setCustomId('entry:submit').setLabel('📤 +1 Eingereicht').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId('entry:finish').setLabel('✅ Fertig markieren').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('entry:delete').setLabel('🗑️ Löschen').setStyle(ButtonStyle.Danger).setDisabled(true),
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('entry:priorityUp').setLabel('⬆ Priorität hoch').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('entry:priorityDown').setLabel('⬇ Priorität runter').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('entry:showText').setLabel('📋 Text kopieren').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('entry:refresh').setLabel('🔄 Aktualisieren').setStyle(ButtonStyle.Secondary),
        );
        await pm.edit({ embeds: [panelEmbed], components: [row1, row2] }).catch(() => {});
      }
    }
  }

  if (settings?.campaignChannelId) {
    const cc = await client.channels.fetch(settings.campaignChannelId).catch(() => null);
    if (cc) {
      const endEmbed = new EmbedBuilder()
        .setColor(ui.C.gold)
        .setAuthor({ name: 'Wahlkampf beendet' })
        .setTitle(title)
        .setDescription(`Danke für euren Einsatz.\nViel Erfolg bei der Wahl.\n${ui.RULE}`)
        .addFields(
          ...ui.wideBar('abschluss', 'danke', 'FBD'),
          { name: 'Erledigte Aufgaben', value: `\`${stats.finished}\``, inline: true },
          { name: 'Status', value: '`beendet`', inline: true },
          { name: 'Nächster Schritt', value: '`/wahlkampf erstellen`', inline: true },
        )
        .setFooter(ui.FOOTER).setTimestamp();
      ui.applyThumb(endEmbed, cc.guild);

      if (settings.campaignMessageId) {
        const cm = await cc.messages.fetch(settings.campaignMessageId).catch(() => null);
        if (cm) { await cm.edit({ embeds: [endEmbed], components: [] }); }
        else { await cc.send({ embeds: [endEmbed], components: [] }); }
      } else {
        await cc.send({ embeds: [endEmbed], components: [] });
      }
    }
  }

  await renderPlakatPanel(client, guildId).catch(() => {});
}

// ─── PLAKATANFRAGEN PANEL ─────────────────────────────────────────────────────

async function renderPlakatPanel(client, guildId) {
  const settings = await getGuildSettings(guildId);
  if (!settings?.plakatRequestChannelId) return;
  const channel = await client.channels.fetch(settings.plakatRequestChannelId).catch(() => null);
  if (!channel) return;

  const isActive = !!settings.wahlkampftyp;
  const districts = isActive ? await listDistricts(guildId, settings.wahlkampftyp) : [];
  const statusEmoji = { green: '🟢', yellow: '🟡', red: '🔴' };
  const statusText = { green: 'Gesucht', yellow: 'Wenige gebraucht', red: 'Gesperrt' };
  const AREAS = ['hansebund', 'mittelmark'];
  const AREA_LABELS_LOCAL = { hansebund: '🏙️ Hansebund', mittelmark: '🌿 Mittelmark' };

  let districtField = '';
  if (!isActive) {
    districtField = '*Kein aktiver Wahlkampf.*';
  } else if (!districts.length) {
    districtField = '*Noch keine Wahlkreise erstellt.*';
  } else {
    districtField = AREAS.map(area => {
      const areaDistricts = districts.filter(d => d.area === area);
      if (!areaDistricts.length) return null;
      const lines = areaDistricts.map(d => `${statusEmoji[d.status] || '⚪'} **${d.name}** — ${statusText[d.status] || ''}`);
      return `**${AREA_LABELS_LOCAL[area]}**\n${lines.join('\n')}`;
    }).filter(Boolean).join('\n\n');
  }

  const embed = new EmbedBuilder()
    .setColor(isActive ? ui.C.poster : ui.C.mute)
    .setAuthor({ name: 'Wahlplakat einreichen' })
    .setTitle(isActive ? campaignTitle(settings) : 'Kein aktiver Wahlkampf')
    .setDescription(
      isActive
        ? `Reiche ein Plakat beim Vorstand ein. Nach der Prüfung wird es angenommen oder abgelehnt.\n${ui.RULE}\n**Voraussetzungen**\n• nicht urheberrechtlich geschützt\n• Quelle des Hintergrunds angeben, falls vorhanden\n• direkte Bild-URL (\`.png\` \`.jpg\` \`.gif\` \`.webp\`)`
        : `*Sobald ein neuer Wahlkampf startet, kannst du hier Plakate einreichen.*\n${ui.RULE}`
    )
    .addFields(
      ...ui.wideBar(isActive ? 'einreichen' : 'pause', 'plakat', 'FBD'),
      { name: 'Wahlkreis-Status', value: districtField || '—' },
    )
    .setFooter(ui.FOOTER).setTimestamp();
  ui.applyThumb(embed, channel.guild);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('plakat:request').setLabel('🖼️ Wahlplakat einreichen').setStyle(ButtonStyle.Primary).setDisabled(!isActive),
  );

  const payload = { embeds: [embed], components: [row] };
  if (settings.plakatPanelMessageId) {
    const msg = await channel.messages.fetch(settings.plakatPanelMessageId).catch(() => null);
    if (msg) { await msg.edit(payload); return; }
  }
  const sent = await channel.send(payload);
  await updateGuildSettings(guildId, { plakatPanelMessageId: sent.id });
}

// ─── ARCHIV EMBED ─────────────────────────────────────────────────────────────

function buildArchiveEmbed(entry, districtNameStr, settings) {
  const typeStr = entry.type === 'poster' ? '🖼️ Wahlplakat' : '📝 Rede';
  const area = entry.targetArea ? areaLabel(entry.targetArea) : '—';
  const areaLink = entry.targetArea ? getAreaLink(settings, entry.targetArea) : null;

  const embed = new EmbedBuilder()
    .setColor(ui.C.archive)
    .setAuthor({ name: `Archiv  ·  ${typeStr}` })
    .setTitle(`${districtNameStr}  ·  ${area}`)
    .setDescription(`Eingereicht von <@${entry.createdBy}>\n${ui.RULE}`)
    .addFields(
      ...ui.wideBar('archiv', 'erledigt', 'FBD'),
      { name: 'Text', value: `\`\`\`\n${entry.text.slice(0, 1000)}\n\`\`\`` },
      { name: 'Eingereicht', value: `\`${entry.submissionCount} / ${entry.maxSubmissions}\``, inline: true },
      { name: 'Erledigt am', value: new Date(entry.finishedAt).toLocaleString('de-DE'), inline: true },
    );

  if (areaLink) embed.addFields({ name: 'Kanal', value: `[${area}](${areaLink})`, inline: true });
  if (entry.imageUrl) {
    embed.addFields({ name: 'Bild', value: `[Ansehen](${entry.imageUrl})` });
    if (entry.imageUrl.startsWith('http')) embed.setImage(entry.imageUrl);
  }

  embed.setFooter({ text: 'FBD  ·  Wahlkampfarchiv' }).setTimestamp(entry.finishedAt);
  return embed;
}

module.exports = { renderPanel, renderCampaign, renderEnded, buildArchiveEmbed, getAreaLink, AREA_LABELS, WAHLTYP_LABELS, renderPlakatPanel };
