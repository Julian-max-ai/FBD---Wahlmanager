const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../database/settings');
const { listDistricts } = require('../database/districts');
const { getQueuedEntries, getActiveEntry, getStats } = require('../database/entries');

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

const AREA_LABELS = {
  hansebund: '🏙️ Hansebund',
  mittelmark: '🌿 Mittelmark',
};

const WAHLTYP_LABELS = {
  bundestag: '🏛️ Bundestagswahl',
  landtag: '🏠 Landtagswahl',
};

function getAreaLink(settings, area) {
  const typ = settings?.wahlkampftyp || 'bundestag';
  return AREA_LINKS[typ]?.[area] || null;
}

function progressBar(count, max) {
  const total = 10;
  const filled = Math.round((count / max) * total);
  return '▰'.repeat(filled) + '▱'.repeat(total - filled) + `  **${count} / ${max}**`;
}

function districtName(districts, id) {
  return districts.find(d => d.id === id)?.name || '—';
}

function typeLabel(type) {
  return type === 'poster' ? '🖼️  Wahlplakat' : '📝  Rede';
}

function areaLabel(area) {
  return AREA_LABELS[area] || '—';
}

function wahltypLabel(settings) {
  return WAHLTYP_LABELS[settings?.wahlkampftyp] || '🗳️ Wahlkampf';
}

// ─── VORSTANDSPANEL ───────────────────────────────────────────────────────────

async function renderPanel(client, guildId) {
  const settings = getGuildSettings(guildId);
  if (!settings?.vorstandChannelId) return;
  const channel = await client.channels.fetch(settings.vorstandChannelId).catch(() => null);
  if (!channel) return;

  const active = getActiveEntry(guildId);
  const queue = getQueuedEntries(guildId);
  const districts = listDistricts(guildId, settings.wahlkampftyp);
  const stats = getStats(guildId);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🗳️  Vorstandspanel  ·  ${wahltypLabel(settings)}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (active) {
    const district = districtName(districts, active.districtId);
    const bar = progressBar(active.submissionCount, active.maxSubmissions);
    const area = active.targetArea ? areaLabel(active.targetArea) : '—';
    const link = active.targetArea ? getAreaLink(settings, active.targetArea) : null;
    const areaLink = link ? `[→ Zum Kanal](${link})` : '';

    embed.addFields({
      name: '▶️  AKTIVE AUFGABE',
      value: [
        `> ${typeLabel(active.type)}  ·  ${district}  ·  ${area}`,
        `> `,
        `> 📋  **Text:**`,
        `> ${active.text.slice(0, 300)}${active.text.length > 300 ? '…' : ''}`,
        active.imageUrl ? `> ` : '',
        active.imageUrl ? `> 🖼️  **Bild:** [Vorschau / Download](${active.imageUrl})` : '',
        `> `,
        `> 📤  **Einreichungsfortschritt:**`,
        `> ${bar}`,
        areaLink ? `> 🔗  ${areaLink}` : '',
      ].filter(Boolean).join('\n'),
    });
  } else {
    embed.addFields({
      name: '▶️  AKTIVE AUFGABE',
      value: '> *Keine aktive Aufgabe vorhanden.*\n> Erstelle einen neuen Eintrag oder aktiviere einen aus der Queue.',
    });
  }

  embed.addFields({ name: '\u200b', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' });

  if (queue.length) {
    const lines = queue.slice(0, 8).map((e, i) => {
      const d = districtName(districts, e.districtId);
      const a = e.targetArea ? areaLabel(e.targetArea) : '—';
      const prefix = i === 0 ? '**`NÄCHSTE`**' : `\`${i + 1}.\``;
      return `${prefix}  ${typeLabel(e.type)}  ·  ${d}  ·  ${a}`;
    });
    if (queue.length > 8) lines.push(`*… und ${queue.length - 8} weitere*`);
    embed.addFields({ name: `📦  WARTESCHLANGE  ·  ${queue.length} Einträge`, value: lines.join('\n') });
  } else {
    embed.addFields({ name: '📦  WARTESCHLANGE', value: '*Leer — keine weiteren Aufgaben geplant.*' });
  }

  embed.addFields({ name: '\u200b', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' });
  embed.addFields(
    { name: '✅  Erledigt', value: `**${stats.finished}**`, inline: true },
    { name: '🕐  Offen', value: `**${stats.open}**`, inline: true },
    { name: '📊  Gesamt', value: `**${stats.finished + stats.open}**`, inline: true },
  );
  embed.setFooter({ text: '🔒 Nur für Vorstandsmitglieder  ·  Letzte Aktualisierung' }).setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entry:create').setLabel('➕ Neu erstellen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('entry:submit').setLabel('📤 +1 Eingereicht').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('entry:finish').setLabel('✅ Als fertig markieren').setStyle(ButtonStyle.Secondary),
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
  const settings = getGuildSettings(guildId);
  if (!settings?.campaignChannelId) return;
  const channel = await client.channels.fetch(settings.campaignChannelId).catch(() => null);
  if (!channel) return;

  const active = getActiveEntry(guildId);
  const queue = getQueuedEntries(guildId);
  const districts = listDistricts(guildId, settings.wahlkampftyp);

  let embed;
  if (active) {
    const district = districtName(districts, active.districtId);
    const bar = progressBar(active.submissionCount, active.maxSubmissions);
    const area = active.targetArea ? areaLabel(active.targetArea) : null;
    const areaLink = active.targetArea ? getAreaLink(settings, active.targetArea) : null;

    embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📢  ${wahltypLabel(settings)} — Aktuelle Aufgabe\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      .setDescription(`> **Bitte reicht folgendes auf dem Bundestagsserver ein!**\n> ${typeLabel(active.type)}  ·  Wahlkreis: **${district}**${area ? `  ·  Gebiet: **${area}**` : ''}`)
      .addFields({ name: '📋  Text zum Einreichen', value: `\`\`\`\n${active.text.slice(0, 1000)}\n\`\`\`` });

    if (active.imageUrl) {
      embed.addFields({ name: '🖼️  Wahlplakat', value: `[📥  Bild herunterladen / ansehen](${active.imageUrl})` });
      embed.setImage(active.imageUrl);
    }

    if (areaLink) {
      embed.addFields({ name: '📍  Wo einreichen?', value: `**${area}** → [Zum Einreichungskanal klicken](${areaLink})` });
    }

    embed.addFields(
      { name: '\u200b', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
      { name: '📤  Einreichungsfortschritt', value: bar },
    );

    if (queue.length > 0) {
      const next = queue[0];
      embed.addFields({
        name: '⏭️  Als nächstes',
        value: `${typeLabel(next.type)}  ·  ${districtName(districts, next.districtId)}  ·  ${next.targetArea ? areaLabel(next.targetArea) : '—'}`,
      });
    }

    embed.setFooter({ text: 'Klickt auf "📤 +1 Eingereicht" nachdem ihr es eingereicht habt!' }).setTimestamp();
  } else {
    embed = new EmbedBuilder()
      .setColor(0x99AAB5)
      .setTitle(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📢  ${wahltypLabel(settings)} — Aktuelle Aufgabe\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      .setDescription('> *Aktuell keine aktive Aufgabe.*\n> Schaut später nochmal rein!')
      .setFooter({ text: 'FBD Wahlkampfverwaltung' }).setTimestamp();
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
  const settings = getGuildSettings(guildId);
  const stats = getStats(guildId);
  const typ = wahltypLabel(settings);

  const endEmbed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🏁  ${typ} — Wahlkampf beendet!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    .setDescription('> Vielen Dank für euren Einsatz im Wahlkampf!\n> Wir hoffen auf starke Ergebnisse und freuen uns auf den nächsten Wahlkampf.\n> \n> 🗳️  **Viel Erfolg bei der Wahl!**')
    .addFields({ name: '📊  Erledigte Aufgaben', value: `**${stats.finished}**`, inline: true })
    .setFooter({ text: 'FBD Wahlkampfverwaltung' }).setTimestamp();

  // Vorstandspanel leeren
  if (settings?.vorstandChannelId && settings?.panelMessageId) {
    const vc = await client.channels.fetch(settings.vorstandChannelId).catch(() => null);
    if (vc) {
      const pm = await vc.messages.fetch(settings.panelMessageId).catch(() => null);
      if (pm) await pm.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
    }
  }

  // Mitgliederpanel
  if (settings?.campaignChannelId) {
    const cc = await client.channels.fetch(settings.campaignChannelId).catch(() => null);
    if (cc) {
      if (settings.campaignMessageId) {
        const cm = await cc.messages.fetch(settings.campaignMessageId).catch(() => null);
        if (cm) { await cm.edit({ embeds: [endEmbed], components: [] }); return; }
      }
      await cc.send({ embeds: [endEmbed], components: [] });
    }
  }
}

// ─── ARCHIV EMBED ─────────────────────────────────────────────────────────────

function buildArchiveEmbed(entry, districtNameStr, settings) {
  const typeStr = entry.type === 'poster' ? '🖼️  Wahlplakat' : '📝  Rede';
  const area = entry.targetArea ? areaLabel(entry.targetArea) : '—';
  const areaLink = entry.targetArea ? getAreaLink(settings, entry.targetArea) : null;

  const embed = new EmbedBuilder()
    .setColor(0x2C2F33)
    .setTitle(`📁  Archiviert — ${typeStr}`)
    .setDescription(`> Wahlkreis: **${districtNameStr}**  ·  Gebiet: **${area}**\n> Eingereicht von <@${entry.createdBy}>`)
    .addFields(
      { name: '📋  Text', value: `\`\`\`\n${entry.text.slice(0, 1000)}\n\`\`\`` },
      { name: '📤  Eingereicht', value: `**${entry.submissionCount} / ${entry.maxSubmissions}**`, inline: true },
      { name: '📅  Erledigt am', value: new Date(entry.finishedAt).toLocaleString('de-DE'), inline: true },
    );

  if (areaLink) embed.addFields({ name: '📍  Kanal', value: `[${area}](${areaLink})`, inline: true });
  if (entry.imageUrl) {
    embed.addFields({ name: '🖼️  Bild', value: `[Download / Ansehen](${entry.imageUrl})` });
    embed.setImage(entry.imageUrl);
  }

  embed.setFooter({ text: 'FBD Wahlkampfarchiv' }).setTimestamp(entry.finishedAt);
  return embed;
}

module.exports = { renderPanel, renderCampaign, renderEnded, buildArchiveEmbed, getAreaLink, AREA_LABELS, WAHLTYP_LABELS };
