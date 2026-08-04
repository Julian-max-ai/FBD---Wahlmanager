const { randomUUID } = require('crypto');
const { db } = require('./db');

async function addPoints(guildId, userId, points, reason) {
  await db.execute({
    sql: 'INSERT INTO activity_points (id, guildId, userId, points, reason, createdAt) VALUES (?,?,?,?,?,?)',
    args: [randomUUID(), guildId, userId, points, reason, Date.now()],
  });
}

async function getLeaderboard(guildId) {
  const res = await db.execute({
    sql: `SELECT userId, SUM(points) as total FROM activity_points WHERE guildId = ? GROUP BY userId ORDER BY total DESC`,
    args: [guildId],
  });
  return res.rows;
}

module.exports = { addPoints, getLeaderboard };
