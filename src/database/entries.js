const { randomUUID } = require('crypto');
const { db } = require('./db');
const { setActiveEntry } = require('./settings');

function listEntries(guildId) {
  return db.prepare('SELECT * FROM entries WHERE guildId = ? ORDER BY createdAt').all(guildId);
}

function getEntry(entryId) {
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) || null;
}

function getActiveEntry(guildId) {
  return db.prepare('SELECT * FROM entries WHERE guildId = ? AND status = ? ORDER BY createdAt').get(guildId, 'active') || null;
}

function getQueuedEntries(guildId) {
  return db.prepare('SELECT * FROM entries WHERE guildId = ? AND status = ? ORDER BY queuePosition, createdAt').all(guildId, 'queue');
}

function addEntry(entry) {
  const record = {
    id: randomUUID(),
    guildId: entry.guildId,
    type: entry.type,
    title: entry.title,
    text: entry.text,
    districtId: entry.districtId || null,
    attachment: entry.attachment || null,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt || Date.now(),
    finishedAt: null,
    status: entry.status || 'queue',
    queuePosition: entry.queuePosition || 1,
  };
  db.prepare(`
    INSERT INTO entries (id, guildId, type, title, text, districtId, attachment, createdBy, createdAt, finishedAt, status, queuePosition)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.guildId,
    record.type,
    record.title,
    record.text,
    record.districtId,
    record.attachment,
    record.createdBy,
    record.createdAt,
    record.finishedAt,
    record.status,
    record.queuePosition,
  );
  return record;
}

function updateEntry(entryId, updates) {
  const current = getEntry(entryId);
  if (!current) return null;
  const next = { ...current, ...updates };
  db.prepare(`
    UPDATE entries SET
      type = ?,
      title = ?,
      text = ?,
      districtId = ?,
      attachment = ?,
      createdBy = ?,
      createdAt = ?,
      finishedAt = ?,
      status = ?,
      queuePosition = ?
    WHERE id = ?
  `).run(
    next.type,
    next.title,
    next.text,
    next.districtId,
    next.attachment,
    next.createdBy,
    next.createdAt,
    next.finishedAt,
    next.status,
    next.queuePosition,
    entryId,
  );
  return getEntry(entryId);
}

function deleteEntry(entryId) {
  db.prepare('DELETE FROM entries WHERE id = ?').run(entryId);
}

function getStats(guildId) {
  const open = db.prepare('SELECT COUNT(*) AS count FROM entries WHERE guildId = ? AND status != ?').get(guildId, 'finished').count;
  const finished = db.prepare('SELECT COUNT(*) AS count FROM entries WHERE guildId = ? AND status = ?').get(guildId, 'finished').count;
  return { open, finished };
}

module.exports = {
  listEntries,
  getEntry,
  getActiveEntry,
  getQueuedEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  getStats,
  setActiveEntry,
};
