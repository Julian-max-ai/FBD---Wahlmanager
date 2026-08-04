const { randomUUID } = require('crypto');
const { db } = require('./db');
const { setActiveEntry } = require('./settings');

async function listEntries(guildId) {
  const res = await db.execute({ sql: 'SELECT * FROM entries WHERE guildId = ? ORDER BY queuePosition, createdAt', args: [guildId] });
  return res.rows;
}

async function getEntry(entryId) {
  const res = await db.execute({ sql: 'SELECT * FROM entries WHERE id = ?', args: [entryId] });
  return res.rows[0] || null;
}

async function getActiveEntry(guildId) {
  const res = await db.execute({ sql: "SELECT * FROM entries WHERE guildId = ? AND status = 'active' LIMIT 1", args: [guildId] });
  return res.rows[0] || null;
}

async function getQueuedEntries(guildId) {
  const res = await db.execute({ sql: "SELECT * FROM entries WHERE guildId = ? AND status = 'queue' ORDER BY queuePosition, createdAt", args: [guildId] });
  return res.rows;
}

async function addEntry(entry) {
  const queued = await getQueuedEntries(entry.guildId);
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
  await db.execute({
    sql: `INSERT INTO entries (id, guildId, type, title, text, imageUrl, targetArea, districtId, createdBy, createdAt, finishedAt, status, queuePosition, submissionCount, maxSubmissions)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      record.id, record.guildId, record.type, record.title, record.text,
      record.imageUrl, record.targetArea, record.districtId, record.createdBy, record.createdAt,
      record.finishedAt, record.status, record.queuePosition, record.submissionCount, record.maxSubmissions,
    ],
  });
  return record;
}

async function updateEntry(entryId, updates) {
  const current = await getEntry(entryId);
  if (!current) return null;
  const next = { ...current, ...updates };
  await db.execute({
    sql: `UPDATE entries SET type=?, title=?, text=?, imageUrl=?, targetArea=?, districtId=?,
          createdBy=?, createdAt=?, finishedAt=?, status=?, queuePosition=?, submissionCount=?, maxSubmissions=?
          WHERE id=?`,
    args: [
      next.type, next.title, next.text, next.imageUrl, next.targetArea, next.districtId,
      next.createdBy, next.createdAt, next.finishedAt, next.status,
      next.queuePosition, next.submissionCount, next.maxSubmissions, entryId,
    ],
  });
  return getEntry(entryId);
}

async function deleteEntry(entryId) {
  await db.execute({ sql: 'DELETE FROM entries WHERE id = ?', args: [entryId] });
}

async function incrementSubmission(entryId) {
  const entry = await getEntry(entryId);
  if (!entry) return false;
  const newCount = entry.submissionCount + 1;
  await updateEntry(entryId, { submissionCount: newCount });
  return newCount >= entry.maxSubmissions;
}

async function getStats(guildId) {
  const open = await db.execute({ sql: "SELECT COUNT(*) AS count FROM entries WHERE guildId = ? AND status != 'finished'", args: [guildId] });
  const finished = await db.execute({ sql: "SELECT COUNT(*) AS count FROM entries WHERE guildId = ? AND status = 'finished'", args: [guildId] });
  return { open: open.rows[0].count, finished: finished.rows[0].count };
}

module.exports = { listEntries, getEntry, getActiveEntry, getQueuedEntries, addEntry, updateEntry, deleteEntry, incrementSubmission, getStats, setActiveEntry };
