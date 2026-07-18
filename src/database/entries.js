const { randomUUID } = require('crypto');
const { db } = require('./db');
const { setActiveEntry } = require('./settings');

function listEntries(guildId) {
  return db.prepare('SELECT * FROM entries WHERE guildId = ? ORDER BY queuePosition, createdAt').all(guildId);
}

function getEntry(entryId) {
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) || null;
}

function getActiveEntry(guildId) {
  return db.prepare('SELECT * FROM entries WHERE guildId = ? AND status = ? LIMIT 1').get(guildId, 'active') || null;
}

function getQueuedEntries(guildId) {
  return db.prepare('SELECT * FROM entries WHERE guildId = ? AND status = ? ORDER BY queuePosition, createdAt').all(guildId, 'queue');
}

function addEntry(entry) {
  const queued = getQueuedEntries(entry.guildId);
  const maxPos = queued.length ? Math.max(...queued.map(e => e.queuePosition)) : 0;
  const record = {
    id: randomUUID(),
    guildId: entry.guildId,
    type: entry.type,
    title: entry.title,
    text: entry.text,
    imageUrl: entry.imageUrl || null,
    targetArea: entry.targetArea || null,
    districtId: entry.districtId || null,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt || Date.now(),
    finishedAt: null,
    status: 'queue',
    queuePosition: maxPos + 1,
    submissionCount: 0,
    maxSubmissions: entry.type === 'poster' ? 10 : 1,
  };
  db.prepare(`
    INSERT INTO entries (id, guildId, type, title, text, imageUrl, targetArea, districtId, createdBy, createdAt, finishedAt, status, queuePosition, submissionCount, maxSubmissions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id, record.guildId, record.type, record.title, record.text,
    record.imageUrl, record.targetArea, record.districtId, record.createdBy, record.createdAt,
    record.finishedAt, record.status, record.queuePosition,
    record.submissionCount, record.maxSubmissions,
  );
  return record;
}

function updateEntry(entryId, updates) {
  const current = getEntry(entryId);
  if (!current) return null;
  const next = { ...current, ...updates };
  db.prepare(`
    UPDATE entries SET
      type = ?, title = ?, text = ?, imageUrl = ?, targetArea = ?, districtId = ?,
      createdBy = ?, createdAt = ?, finishedAt = ?, status = ?,
      queuePosition = ?, submissionCount = ?, maxSubmissions = ?
    WHERE id = ?
  `).run(
    next.type, next.title, next.text, next.imageUrl, next.targetArea, next.districtId,
    next.createdBy, next.createdAt, next.finishedAt, next.status,
    next.queuePosition, next.submissionCount, next.maxSubmissions,
    entryId,
  );
  return getEntry(entryId);
}

function deleteEntry(entryId) {
  db.prepare('DELETE FROM entries WHERE id = ?').run(entryId);
}

// Zähler +1, gibt true zurück wenn dadurch maxSubmissions erreicht wurde
function incrementSubmission(entryId) {
  const entry = getEntry(entryId);
  if (!entry) return false;
  const newCount = entry.submissionCount + 1;
  updateEntry(entryId, { submissionCount: newCount });
  return newCount >= entry.maxSubmissions;
}

function getStats(guildId) {
  const open = db.prepare("SELECT COUNT(*) AS count FROM entries WHERE guildId = ? AND status != 'finished'").get(guildId).count;
  const finished = db.prepare("SELECT COUNT(*) AS count FROM entries WHERE guildId = ? AND status = 'finished'").get(guildId).count;
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
  incrementSubmission,
  getStats,
  setActiveEntry,
};
