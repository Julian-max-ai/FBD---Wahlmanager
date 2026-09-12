const { randomUUID } = require('crypto');
const { query, run } = require('./db');

async function addPoints(guildId, userId, points, reason, campaignName = null) {
  await run('INSERT INTO activity_points (id,guildId,userId,points,reason,createdAt,campaignName) VALUES (?,?,?,?,?,?,?)',
    [randomUUID(), guildId, userId, points, reason, Date.now(), campaignName]);
}

async function getLeaderboard(guildId, campaignName = null) {
  if (campaignName) {
    return query('SELECT userId, SUM(points) as total FROM activity_points WHERE guildId=? AND campaignName=? GROUP BY userId ORDER BY total DESC', [guildId, campaignName]);
  }
  return query('SELECT userId, SUM(points) as total FROM activity_points WHERE guildId=? GROUP BY userId ORDER BY total DESC', [guildId]);
}

async function getCampaignNames(guildId) {
  return query('SELECT DISTINCT campaignName FROM activity_points WHERE guildId=? AND campaignName IS NOT NULL ORDER BY campaignName', [guildId]);
}

module.exports = { addPoints, getLeaderboard, getCampaignNames };
