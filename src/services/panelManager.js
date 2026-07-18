const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../database/settings');
const { listDistricts } = require('../database/districts');
const { getQueuedEntries, getActiveEntry, getStats } = require('../database/entries');

function progressBar(count, max) {
  const filled = Math.round((count / max) * 8);
  return '█'.repeat(filled) + '░'.repeat(8 - filled) + ` ${count}/${max}`;
}

function districtName(districts, id) {
  return districts.find(d => d.id === id)?.name || '—';
}

function entryTypeLabel(type) {
  return type === 'poster' ? '🖼️ Wahlplakat' : '📝 Rede';
}

async function renderPanel(client, guildId) {
  const settings = getGuildSettings(guildId);
  if (!settings?.vorstandChannelId) return;

  const channel = await client.channels.fetch(settings.vorstandChannelId).catch(() => null);
  if (!channel) return;

  const active = getActiveEntry(guildId);
  const queue = getQueuedEntries(guildId);
  const districts = listDistricts(guildId);
  const stats = getStats(guildId);

  // Aktiver Eintrag Block
  let activeValue;
  if (active) {
    const bar = progressBar(active.submissionCount, active.maxSubmissions);
    const district = districtName(districts, active.districtId);
    activeValue = [
      `**${entryTypeLabel(active.type)}** • ${district}`,
      `📌 ${active.title}`,
      active.text ? `> ${active.text.slice(0, 200)}${active.text.length > 200 ? '…' : ''}` : '',
      active.imageUrl ? `🔗 [Bild](${active.imageUrl})` : '',
      `📤 Eingereicht: ${bar}`,
    ].filter(Boolean).join('\n');
  } else {
    activeValue = '*Keine aktive Aufgabe. Nächsten Eintrag aus der Queue aktivieren oder neu erstellen.*';
  }

  // Queue Block
  let queueValue;
  if (queue.length) {
    queueValue = queue.slice(0, 10).map((e, i) => {
      const d = districtName(districts, e.districtId);
      return `**${i + 1}.** ${entryTypeLabel(e.type)} • ${d} — ${e.title}`;
    }).join('\n');
    if (queue.length > 10) queueValue += `\n*… und ${queue.length - 10} weitere*`;
  } else {
    queueValue = '*Queue ist leer.*';
  }

  const embed = new EmbedBuilder()
    .setTitle('🗳️ Wahlkampfverwaltung — Vorstandspanel')
    .setColor(0x2f80ed)
    .addFields(
      { name: '▶️ AKTUELLE AUFGABE', value: activeValue },
      { name: `📦 WARTESCHLANGE (${queue.length})`, value: queueValue },
      { name: '📊 STATISTIK', value: `Offen: **${stats.open}** • Erledigt: **${stats.finished}**`, inline: true },
    )
    .setFooter({ text: 'Nur für Vorstandsmitglieder' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entry:create').setLabel('➕ Neu').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('entry:submit').setLabel('📤 +1 Eingereicht').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('entry:finish').setLabel('✅ Fertig').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entry:delete').setLabel('🗑️ Löschen').setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entry:priorityUp').setLabel('⬆ Priorität').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entry:priorityDown').setLabel('⬇ Priorität').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entry:showText').setLabel('📄 Text').setStyle(ButtonStyle.Secondary),
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

async function renderCampaign(client, guildId) {
  const settings = getGuildSettings(guildId);
  if (!settings?.campaignChannelId) return;

  const channel = await client.channels.fetch(settings.campaignChannelId).catch(() => null);
  if (!channel) return;

  const active = getActiveEntry(guildId);
  const districts = listDistricts(guildId);

  let embed;
  if (active) {
    const district = districtName(districts, active.districtId);
    const bar = progressBar(active.submissionCount, active.maxSubmissions);
    embed = new EmbedBuilder()
      .setTitle('📢 Aktuelle Wahlkampfaufgabe')
      .setColor(0x27ae60)
      .setDescription(`Bitte reicht folgendes auf dem Bundestagsserver ein:`)
      .addFields(
        { name: 'Typ', value: entryTypeLabel(active.type), inline: true },
        { name: 'Wahlkreis', value: district, inline: true },
        { name: 'Titel', value: active.title },
        { name: 'Text', value: active.text || '—' },
        { name: 'Fortschritt', value: bar },
      );
    if (active.imageUrl) embed.setImage(active.imageUrl);
  } else {
    embed = new EmbedBuilder()
      .setTitle('📢 Aktuelle Wahlkampfaufgabe')
      .setColor(0x95a5a6)
      .setDescription('Aktuell keine aktive Aufgabe. Schaut später nochmal rein!');
  }

  const payload = { embeds: [embed] };

  if (settings.campaignMessageId) {
    const msg = await channel.messages.fetch(settings.campaignMessageId).catch(() => null);
    if (msg) { await msg.edit(payload); return; }
  }

  const sent = await channel.send(payload);
  await updateGuildSettings(guildId, { campaignMessageId: sent.id });
}

module.exports = { renderPanel, renderCampaign };
