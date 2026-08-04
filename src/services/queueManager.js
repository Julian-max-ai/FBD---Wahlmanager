const { getQueuedEntries, updateEntry } = require('../database/entries');
const { renderPanel, renderCampaign } = require('./panelManager');

async function moveEntryUp(client, guildId, entryId) {
  const queue = getQueuedEntries(guildId);
  const idx = queue.findIndex(e => e.id === entryId);
  if (idx <= 0) return false;
  const above = queue[idx - 1];
  const current = queue[idx];
  updateEntry(above.id, { queuePosition: current.queuePosition });
  updateEntry(current.id, { queuePosition: above.queuePosition });
  await renderPanel(client, guildId);
  await renderCampaign(client, guildId);
  return true;
}

async function moveEntryDown(client, guildId, entryId) {
  const queue = getQueuedEntries(guildId);
  const idx = queue.findIndex(e => e.id === entryId);
  if (idx < 0 || idx >= queue.length - 1) return false;
  const below = queue[idx + 1];
  const current = queue[idx];
  updateEntry(below.id, { queuePosition: current.queuePosition });
  updateEntry(current.id, { queuePosition: below.queuePosition });
  await renderPanel(client, guildId);
  await renderCampaign(client, guildId);
  return true;
}

module.exports = { moveEntryUp, moveEntryDown };
