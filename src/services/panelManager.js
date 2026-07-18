const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../database/settings');
const { listDistricts } = require('../database/districts');
const { getQueuedEntries, getActiveEntry, getStats } = require('../database/entries');

const AREA_LINKS = {
  hansebund: 'https://discordapp.com/channels/1429208511056969851/1475854549271969822',
  mittelmark: 'https://discordapp.com/channels/1429208511056969851/1475853973368995861',
};

const AREA_LABELS = {
  hansebund: '🏙️ Hansebund',
  mittelmark: '🌿 Mittelmark',
};

function progressBar(count, max) {
  const total = 10;
  const filled = Math.round((count / max) * total);
  const bar = '▰'.repeat(filled) + '▱'.repeat(total - filled);
  return `${bar}  **${count} / ${max}**`;
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

// ─── VORSTANDSPANEL ───────────────────────────────────────────────────────────

async function renderPanel(client, guildId) {
  const settings = getGuildSettings(guildId);
  if (!settings?.vorstandChannelId) return;
  const channel = await client.channels.fetch(settings.vorstandChannelId).catch(() => null);
  if (!channel) return;

  const active = getActiveEntry(guildId);
  const queue = getQueuedEntries(guildId);
  const districts = listDistricts(guildId);
  const stats = getStats(guildId);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: 'FBD Wahlkampfverwaltung', iconURL: 'https://cdn.discordapp.com/emojis/1234567890.png' })
    .setTitle('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🗳️  Vorstandspanel\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Aktive Aufgabe
  if (active) {
    const district = districtName(districts, active.districtId);
    const bar = progressBar(active.submissionCount, active.maxSubmissions);
    const area = active.targetArea ? areaLabel(active.targetArea) : '—';
    const areaLink = active.targetArea ? `[→ Zum Kanal](${AREA_LINKS[active.targetArea]})` : '';

    embed.addFields(
      {
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
      },
    );
  } else {
    embed.addFields({
      name: '▶️  AKTIVE AUFGABE',
      value: '> *Keine aktive Aufgabe vorhanden.*\n> Erstelle einen neuen Eintrag oder aktiviere einen aus der Queue.',
    });
  }

  embed.addFields({ name: '\u200b', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' });

  // Queue
  if (queue.length) {
    const queueLines = queue.slice(0, 8).map((e, i) => {
      const d = districtName(districts, e.districtId);
      const a = e.targetArea ? areaLabel(e.targetArea) : '—';
      const prefix = i === 0 ? '**`NÄCHSTE`**' : `\`${i + 1}.\``;
      return `${prefix}  ${typeLabel(e.type)}  ·  ${d}  ·  ${a}`;
    });
    if (queue.length > 8) queueLines.push(`*… und ${queue.length - 8} weitere*`);
    embed.addFields({ name: `📦  WARTESCHLANGE  ·  ${queue.length} Einträge`, value: queueLines.join('\n') });
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
  const districts = listDistricts(guildId);

  let embed;

  if (active) {
    const district = districtName(districts, active.districtId);
    const bar = progressBar(active.submissionCount, active.maxSubmissions);
    const area = active.targetArea ? areaLabel(active.targetArea) : null;
    const areaLink = active.targetArea ? AREA_LINKS[active.targetArea] : null;

    embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📢  Aktuelle Wahlkampfaufgabe\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      .setDescription(
        `> **Bitte reicht folgendes auf dem Bundestagsserver ein!**\n> ${typeLabel(active.type)}  ·  Wahlkreis: **${district}**${area ? `  ·  Gebiet: **${area}**` : ''}`
      )
      .addFields(
        {
          name: '📋  Text zum Einreichen',
          value: `\`\`\`\n${active.text.slice(0, 1000)}\n\`\`\``,
        },
      );

    if (active.imageUrl) {
      embed.addFields({
        name: '🖼️  Wahlplakat',
        value: `[📥  Bild herunterladen / ansehen](${active.imageUrl})`,
      });
      embed.setImage(active.imageUrl);
    }

    if (areaLink) {
      embed.addFields({
        name: '📍  Wo einreichen?',
        value: `**${area}** → [Zum Einreichungskanal klicken](${areaLink})`,
      });
    }

    embed.addFields(
      { name: '\u200b', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
      { name: '📤  Einreichungsfortschritt', value: bar },
    );

    // Nächste Aufgabe als Vorschau
    if (queue.length > 0) {
      const next = queue[0];
      const nextDistrict = districtName(districts, next.districtId);
      const nextArea = next.targetArea ? areaLabel(next.targetArea) : '—';
      embed.addFields({
        name: '⏭️  Als nächstes',
        value: `${typeLabel(next.type)}  ·  ${nextDistrict}  ·  ${nextArea}`,
      });
    }

    embed.setFooter({ text: `Klickt auf "📤 +1 Eingereicht" nachdem ihr es eingereicht habt!` }).setTimestamp();
  } else {
    embed = new EmbedBuilder()
      .setColor(0x99AAB5)
      .setTitle('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📢  Aktuelle Wahlkampfaufgabe\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      .setDescription('> *Aktuell keine aktive Aufgabe.*\n> Schaut später nochmal rein!')
      .setFooter({ text: 'FBD Wahlkampfverwaltung' }).setTimestamp();
  }

  // Submit Button auch im Mitgliederpanel
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

// ─── ARCHIV EMBED ─────────────────────────────────────────────────────────────

function buildArchiveEmbed(entry, districtNameStr) {
  const typeStr = entry.type === 'poster' ? '🖼️  Wahlplakat' : '📝  Rede';
  const area = entry.targetArea ? areaLabel(entry.targetArea) : '—';
  const areaLink = entry.targetArea ? AREA_LINKS[entry.targetArea] : null;

  const embed = new EmbedBuilder()
    .setColor(0x2C2F33)
    .setTitle(`📁  Archiviert — ${typeStr}`)
    .setDescription(
      `> Wahlkreis: **${districtNameStr}**  ·  Gebiet: **${area}**\n> Eingereicht von <@${entry.createdBy}>`
    )
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

module.exports = { renderPanel, renderCampaign, buildArchiveEmbed, AREA_LINKS, AREA_LABELS };
