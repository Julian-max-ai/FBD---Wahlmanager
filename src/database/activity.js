const { randomUUID } = require('crypto');
const { query, run } = require('./db');

async function addPoints(guildId, userId, points, reason) {
  await run('INSERT INTO activity_points (id,guildId,userId,points,reason,createdAt) VALUES (?,?,?,?,?,?)',
    [randomUUID(), guildId, userId, points, reason, Date.now()]);
}

async function getLeaderboard(guildId) {
  return query('SELECT userId, SUM(points) as total FROM activity_points WHERE guildId=? GROUP BY userId ORDER BY total DESC', [guildId]);
}

module.exports = { addPoints, getLeaderboard };
