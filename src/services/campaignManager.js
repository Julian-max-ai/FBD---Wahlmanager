const { EmbedBuilder } = require('discord.js');
const { getActiveEntry, getQueuedEntries, addEntry, updateEntry, deleteEntry, getEntry, incrementSubmission } = require('../database/entries');
const { getGuildSettings, setActiveEntry } = require('../database/settings');
const { listDistricts } = require('../database/districts');
const { renderPanel, renderCampaign } = require('./panelManager');

async function createEntry(client, guildId, payload) {
  const entry = addEntry({
    guildId,
    type: payload.type,
    title: payload.title,
    text: payload.text,
    imageUrl: payload.imageUrl || null,
    districtId: payload.districtId,
    createdBy: payload.createdBy,
    createdAt: Date.now(),
  });

  // Wenn noch kein aktiver Eintrag → diesen direkt aktivieren
  const active = getActiveEntry(guildId);
  if (!active) {
    updateEntry(entry.id, { status: 'active' });
    setActiveEntry(guildId, entry.id);
  }

  await renderPanel(client, guildId);
  await renderCampaign(client, guildId);
  return entry;
}

// +1 Einreichung auf aktivem Eintrag
// Gibt { done: bool, count, max } zurück
async function submitActiveEntry(client, guildId) {
  const active = getActiveEntry(guildId);
  if (!active) return null;

  const maxReached = incrementSubmission(active.id);

  if (maxReached) {
    await archiveAndAdvance(client, guildId, active);
  } else {
    await renderPanel(client, guildId);
    await renderCampaign(client, guildId);
  }

  const updated = require('../database/entries').getEntry(active.id);
  return { done: maxReached, count: updated.submissionCount, max: updated.maxSubmissions };
}

// Aktiven Eintrag manuell als fertig markieren (ohne vollen Zähler)
async function finishActiveEntry(client, guildId) {
  const active = getActiveEntry(guildId);
  if (!active) return null;
  await archiveAndAdvance(client, guildId, active);
  return active;
}

async function archiveAndAdvance(client, guildId, entry) {
  const finishedAt = Date.now();
  updateEntry(entry.id, { status: 'finished', finishedAt });
  await sendToArchive(client, guildId, { ...entry, finishedAt });
  await activateNextEntry(client, guildId);
}

async function sendToArchive(client, guildId, entry) {
  const settings = getGuildSettings(guildId);
  if (!settings?.archiveChannelId) return;
  const channel = await client.channels.fetch(settings.archiveChannelId).catch(() => null);
  if (!channel) return;

  const districts = listDistricts(guildId);
  const district = districts.find(d => d.id === entry.districtId)?.name || '—';
  const typeLabel = entry.type === 'poster' ? '🖼️ Wahlplakat' : '📝 Rede';

  const embed = new EmbedBuilder()
    .setTitle(`📁 ${typeLabel} — ${entry.title}`)
    .setColor(0x95a5a6)
    .addFields(
      { name: 'Wahlkreis', value: district, inline: true },
      { name: 'Eingereicht', value: `${entry.submissionCount}/${entry.maxSubmissions}`, inline: true },
      { name: 'Erstellt von', value: `<@${entry.createdBy}>`, inline: true },
      { name: 'Erledigt am', value: new Date(entry.finishedAt).toLocaleString('de-DE'), inline: true },
      { name: 'Text', value: entry.text || '—' },
    );

  if (entry.imageUrl) embed.setImage(entry.imageUrl);
  await channel.send({ embeds: [embed] });
}

async function activateNextEntry(client, guildId) {
  const queued = getQueuedEntries(guildId);
  const next = queued[0] || null;

  if (next) {
    updateEntry(next.id, { status: 'active' });
    setActiveEntry(guildId, next.id);
  } else {
    setActiveEntry(guildId, null);
  }

  await renderPanel(client, guildId);
  await renderCampaign(client, guildId);
}

async function deleteEntryById(client, guildId, entryId) {
  const entry = getEntry(entryId);
  if (!entry) return null;

  const wasActive = entry.status === 'active';
  deleteEntry(entryId);

  if (wasActive) {
    await activateNextEntry(client, guildId);
  } else {
    await renderPanel(client, guildId);
    await renderCampaign(client, guildId);
  }
  return entry;
}

module.exports = {
  createEntry,
  submitActiveEntry,
  finishActiveEntry,
  activateNextEntry,
  deleteEntryById,
};
