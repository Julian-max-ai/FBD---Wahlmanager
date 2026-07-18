const { getActiveEntry, getQueuedEntries, addEntry, updateEntry, deleteEntry, getEntry, incrementSubmission } = require('../database/entries');
const { getGuildSettings, setActiveEntry } = require('../database/settings');
const { listDistricts } = require('../database/districts');
const { renderPanel, renderCampaign, buildArchiveEmbed } = require('./panelManager');

async function createEntry(client, guildId, payload) {
  const entry = addEntry({
    guildId,
    type: payload.type,
    title: payload.title || '',
    text: payload.text,
    imageUrl: payload.imageUrl || null,
    targetArea: payload.targetArea || null,
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

// Wartet bis zu 2 Minuten auf ein Bild im Vorstandskanal und speichert die Discord CDN URL
async function awaitAndAttachImage(client, guildId, entryId, userId) {
  const settings = getGuildSettings(guildId);
  if (!settings?.vorstandChannelId) return null;
  const channel = await client.channels.fetch(settings.vorstandChannelId).catch(() => null);
  if (!channel) return null;

  const filter = m =>
    m.author.id === userId &&
    m.attachments.size > 0 &&
    /\.(png|jpg|jpeg|gif|webp)$/i.test(m.attachments.first().name);

  const collected = await channel.awaitMessages({ filter, max: 1, time: 120000 }).catch(() => null);
  if (!collected?.size) return null;

  const msg = collected.first();
  const attachment = msg.attachments.first();

  // Bild in Bildspeicher-Kanal reposten damit URL permanent bleibt
  let url = attachment.url;
  if (settings?.imageStoreChannelId) {
    const storeChannel = await client.channels.fetch(settings.imageStoreChannelId).catch(() => null);
    if (storeChannel) {
      const stored = await storeChannel.send({
        files: [{ attachment: attachment.url, name: attachment.name }],
      }).catch(() => null);
      if (stored) url = stored.attachments.first()?.url || url;
    }
  }

  // Original im Vorstandskanal löschen
  await msg.delete().catch(() => {});

  updateEntry(entryId, { imageUrl: url });
  await renderPanel(client, guildId);
  await renderCampaign(client, guildId);
  return url;
}

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

  const updated = getEntry(active.id);
  return { done: maxReached, count: updated?.submissionCount ?? active.submissionCount + 1, max: active.maxSubmissions };
}

async function finishActiveEntry(client, guildId) {
  const active = getActiveEntry(guildId);
  if (!active) return null;
  await archiveAndAdvance(client, guildId, active);
  return active;
}

async function archiveAndAdvance(client, guildId, entry) {
  const finishedAt = Date.now();
  updateEntry(entry.id, { status: 'finished', finishedAt });
  const freshEntry = getEntry(entry.id);
  await sendToArchive(client, guildId, { ...freshEntry, finishedAt });
  await activateNextEntry(client, guildId);
}

async function sendToArchive(client, guildId, entry) {
  const settings = getGuildSettings(guildId);
  if (!settings?.archiveChannelId) return;
  const channel = await client.channels.fetch(settings.archiveChannelId).catch(() => null);
  if (!channel) return;

  const districts = listDistricts(guildId);
  const districtStr = districts.find(d => d.id === entry.districtId)?.name || '—';
  const embed = buildArchiveEmbed(entry, districtStr);
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
  awaitAndAttachImage,
  submitActiveEntry,
  finishActiveEntry,
  activateNextEntry,
  deleteEntryById,
};
