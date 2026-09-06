const { getQueuedEntries, updateEntry } = require('../database/entries');
const { renderPanel, renderCampaign } = require('./panelManager');

async function moveEntryUp(client, guildId, entryId) {
  const queue = await getQueuedEntries(guildId);
  const idx = queue.findIndex(e => e.id === entryId);
  if (idx <= 0) return false;
  await updateEntry(queue[idx-1].id, { queuePosition: queue[idx].queuePosition });
  await updateEntry(queue[idx].id, { queuePosition: queue[idx-1].queuePosition });
  await renderPanel(client, guildId); await renderCampaign(client, guildId);
  return true;
}

async function moveEntryDown(client, guildId, entryId) {
  const queue = await getQueuedEntries(guildId);
  const idx = queue.findIndex(e => e.id === entryId);
  if (idx < 0 || idx >= queue.length-1) return false;
  await updateEntry(queue[idx+1].id, { queuePosition: queue[idx].queuePosition });
  await updateEntry(queue[idx].id, { queuePosition: queue[idx+1].queuePosition });
  await renderPanel(client, guildId); await renderCampaign(client, guildId);
  return true;
}

module.exports = { moveEntryUp, moveEntryDown };
