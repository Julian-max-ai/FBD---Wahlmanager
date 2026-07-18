const { getActiveEntry, getQueuedEntries, addEntry, updateEntry, deleteEntry, getEntry, listEntries } = require('../database/entries');
const { getGuildSettings, setActiveEntry } = require('../database/settings');
const { renderPanel, renderCampaign } = require('./panelManager');

function normalizeEntryStatus(entry) {
  if (!entry) return null;
  return entry;
}

async function createEntry(client, guildId, payload) {
  const entry = addEntry({
    guildId,
    type: payload.type,
    title: payload.title,
    text: payload.text,
    districtId: payload.districtId,
    attachment: payload.attachment || null,
    createdBy: payload.createdBy,
    createdAt: Date.now(),
    status: 'queue',
    queuePosition: 1,
  });
  await renderPanel(client, guildId);
  await renderCampaign(client, guildId);
  return entry;
}

async function activateNextEntry(client, guildId) {
  const settings = getGuildSettings(guildId);
  const queued = getQueuedEntries(guildId);
  const active = getActiveEntry(guildId);
  if (active) {
    updateEntry(active.id, { status: 'finished', finishedAt: Date.now() });
  }
  const next = queued[0];
  if (next) {
    updateEntry(next.id, { status: 'active', finishedAt: null });
    setActiveEntry(guildId, next.id);
  } else {
    setActiveEntry(guildId, null);
  }
  await renderPanel(client, guildId);
  await renderCampaign(client, guildId);
}

async function finishEntry(client, guildId, entryId) {
  const entry = getEntry(entryId);
  if (!entry) return null;
  updateEntry(entryId, { status: 'finished', finishedAt: Date.now() });
  await renderPanel(client, guildId);
  await renderCampaign(client, guildId);
  return entry;
}

async function deleteEntryById(client, guildId, entryId) {
  const entry = getEntry(entryId);
  if (!entry) return null;
  deleteEntry(entryId);
  await renderPanel(client, guildId);
  await renderCampaign(client, guildId);
  return entry;
}

module.exports = {
  createEntry,
  activateNextEntry,
  finishEntry,
  deleteEntryById,
};
