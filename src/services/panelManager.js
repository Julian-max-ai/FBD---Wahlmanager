const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { getGuildSettings, setActiveEntry } = require('../database/settings');
const { listDistricts } = require('../database/districts');
const { getQueuedEntries, getActiveEntry, getStats } = require('../database/entries');

function getEntryLabel(entry) {
  const icon = entry.type === 'poster' ? '🖼️' : '📝';
  return `${icon} ${entry.title}`;
}

function getStatusText(status) {
  switch (status) {
    case 'active': return 'Aktiv';
    case 'queue': return 'Warteschlange';
    case 'finished': return 'Erledigt';
    default: return status;
  }
}

async function renderPanel(client, guildId) {
  const settings = getGuildSettings(guildId);
  if (!settings?.vorstandChannelId) return;

  const channel = await client.channels.fetch(settings.vorstandChannelId).catch(() => null);
  if (!channel) return;

  const activeEntry = getActiveEntry(guildId);
  const queuedEntries = getQueuedEntries(guildId);
  const districts = listDistricts(guildId);
  const stats = getStats(guildId);

  const embed = new EmbedBuilder()
    .setTitle('🗳️ Wahlkampfverwaltung')
    .setColor(0x2f80ed)
    .setDescription('Verwaltung von Wahlplakaten und Reden für den Bundesvorstand.')
    .addFields(
      { name: '📢 AKTUELL', value: activeEntry ? `Typ: ${activeEntry.type === 'poster' ? '🖼️ Wahlplakat' : '📝 Rede'}\nTitel: ${activeEntry.title}\nWahlkreis: ${districts.find(d => d.id === activeEntry.districtId)?.name || '—'}\nStatus: ${getStatusText(activeEntry.status)}` : 'Keine aktive Aktion vorhanden.' },
      { name: '📦 WARTESCHLANGE', value: queuedEntries.length ? queuedEntries.map((entry, index) => `${index + 1}. ${entry.type === 'poster' ? '🖼️' : '📝'} ${entry.title} • ${districts.find(d => d.id === entry.districtId)?.name || '—'}`).join('\n') : 'Keine Einträge in der Warteschlange.' },
      { name: '📊 STATISTIK', value: `Offen: ${stats.open}\nErledigt: ${stats.finished}` },
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entry:create').setLabel('➕ Neuer Eintrag').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('entry:edit').setLabel('✏️ Bearbeiten').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entry:showText').setLabel('📄 Text anzeigen').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entry:showAttachment').setLabel('📎 Datei anzeigen').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entry:priorityUp').setLabel('⬆ Priorität erhöhen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('entry:priorityDown').setLabel('⬇ Priorität senken').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('entry:finish').setLabel('✅ Als erledigt markieren').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('entry:delete').setLabel('🗑️ Löschen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('entry:refresh').setLabel('🔄 Aktualisieren').setStyle(ButtonStyle.Secondary),
  );

  const components = [row1, row2];

  if (settings.panelMessageId) {
    const message = await channel.messages.fetch(settings.panelMessageId).catch(() => null);
    if (message) {
      await message.edit({ embeds: [embed], components });
      return;
    }
  }

  const sent = await channel.send({ embeds: [embed], components });
  setActiveEntry(guildId, activeEntry?.id || null);
  await require('../database/settings').updateGuildSettings(guildId, { panelMessageId: sent.id });
}

async function renderCampaign(client, guildId) {
  const settings = getGuildSettings(guildId);
  if (!settings?.campaignChannelId) return;

  const channel = await client.channels.fetch(settings.campaignChannelId).catch(() => null);
  if (!channel) return;

  const activeEntry = getActiveEntry(guildId);
  const districts = listDistricts(guildId);

  const embed = new EmbedBuilder()
    .setTitle('📢 Aktuelle Wahlkampfaktion')
    .setColor(0x27ae60)
    .addFields(
      { name: 'Typ', value: activeEntry ? (activeEntry.type === 'poster' ? '🖼️ Wahlplakat' : '📝 Rede') : 'Keine aktive Aktion' },
      { name: 'Titel', value: activeEntry?.title || '—' },
      { name: 'Wahlkreis', value: activeEntry ? (districts.find(d => d.id === activeEntry.districtId)?.name || '—') : '—' },
      { name: 'Text', value: activeEntry?.text ? activeEntry.text : '—' },
    );

  if (settings.campaignMessageId) {
    const message = await channel.messages.fetch(settings.campaignMessageId).catch(() => null);
    if (message) {
      const payload = { embeds: [embed] };
      if (activeEntry?.attachment) {
        payload.files = [{ attachment: activeEntry.attachment }];
      }
      await message.edit(payload);
      return;
    }
  }

  const payload = { embeds: [embed] };
  if (activeEntry?.attachment) {
    payload.files = [{ attachment: activeEntry.attachment }];
  }
  const sent = await channel.send(payload);
  await require('../database/settings').updateGuildSettings(guildId, { campaignMessageId: sent.id });
}

module.exports = {
  renderPanel,
  renderCampaign,
};
