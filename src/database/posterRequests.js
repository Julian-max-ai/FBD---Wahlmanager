const { randomUUID } = require('crypto');
const { db } = require('./db');

async function addPosterRequest(guildId, userId, imageUrl, bgSource, copyrightChecked) {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO poster_requests (id, guildId, userId, imageUrl, bgSource, copyrightChecked, status, createdAt) VALUES (?,?,?,?,?,?,'pending',?)`,
    args: [id, guildId, userId, imageUrl, bgSource || null, copyrightChecked ? 1 : 0, Date.now()],
  });
  return getPosterRequest(id);
}

async function getPosterRequest(id) {
  const res = await db.execute({ sql: 'SELECT * FROM poster_requests WHERE id = ?', args: [id] });
  return res.rows[0] || null;
}

async function updatePosterRequest(id, updates) {
  const current = await getPosterRequest(id);
  if (!current) return null;
  const next = { ...current, ...updates };
  await db.execute({
    sql: 'UPDATE poster_requests SET status = ?, reviewNote = ? WHERE id = ?',
    args: [next.status, next.reviewNote || null, id],
  });
  return getPosterRequest(id);
}

async function addApprovedPoster(guildId, imageUrl, submittedBy) {
  const id = randomUUID();
  await db.execute({
    sql: 'INSERT INTO approved_posters (id, guildId, imageUrl, submittedBy, createdAt) VALUES (?,?,?,?,?)',
    args: [id, guildId, imageUrl, submittedBy, Date.now()],
  });
  const res = await db.execute({ sql: 'SELECT * FROM approved_posters WHERE id = ?', args: [id] });
  return res.rows[0];
}

async function getApprovedPosters(guildId) {
  const res = await db.execute({ sql: 'SELECT * FROM approved_posters WHERE guildId = ? ORDER BY createdAt', args: [guildId] });
  return res.rows;
}

async function deleteApprovedPoster(id) {
  await db.execute({ sql: 'DELETE FROM approved_posters WHERE id = ?', args: [id] });
}

module.exports = { addPosterRequest, getPosterRequest, updatePosterRequest, addApprovedPoster, getApprovedPosters, deleteApprovedPoster };
