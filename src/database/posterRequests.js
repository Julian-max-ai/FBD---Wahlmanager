const { randomUUID } = require('crypto');
const { query, run } = require('./db');

async function addPosterRequest(guildId, userId, imageUrl, bgSource, copyrightChecked) {
  const id = randomUUID();
  await run(`INSERT INTO poster_requests (id,guildId,userId,imageUrl,bgSource,copyrightChecked,status,createdAt) VALUES (?,?,?,?,?,?,'pending',?)`,
    [id, guildId, userId, imageUrl, bgSource||null, copyrightChecked?1:0, Date.now()]);
  return getPosterRequest(id);
}

async function getPosterRequest(id) {
  const rows = await query('SELECT * FROM poster_requests WHERE id=?', [id]);
  return rows[0] || null;
}

async function updatePosterRequest(id, updates) {
  const current = await getPosterRequest(id);
  if (!current) return null;
  const next = { ...current, ...updates };
  await run('UPDATE poster_requests SET status=?,reviewNote=? WHERE id=?', [next.status, next.reviewNote||null, id]);
  return getPosterRequest(id);
}

async function addApprovedPoster(guildId, imageUrl, submittedBy) {
  const id = randomUUID();
  await run('INSERT INTO approved_posters (id,guildId,imageUrl,submittedBy,createdAt) VALUES (?,?,?,?,?)', [id, guildId, imageUrl, submittedBy, Date.now()]);
  const rows = await query('SELECT * FROM approved_posters WHERE id=?', [id]);
  return rows[0];
}

async function getApprovedPosters(guildId) {
  return query('SELECT * FROM approved_posters WHERE guildId=? ORDER BY createdAt', [guildId]);
}

async function deleteApprovedPoster(id) {
  await run('DELETE FROM approved_posters WHERE id=?', [id]);
}

module.exports = { addPosterRequest, getPosterRequest, updatePosterRequest, addApprovedPoster, getApprovedPosters, deleteApprovedPoster };
