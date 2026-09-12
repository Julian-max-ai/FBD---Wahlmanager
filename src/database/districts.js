const { randomUUID } = require('crypto');
const { query, run } = require('./db');

async function listDistricts(guildId, wahlkampftyp, area) {
  if (wahlkampftyp && area) return query('SELECT * FROM wahlkreise WHERE guildId=? AND wahlkampftyp=? AND area=? ORDER BY position,name', [guildId, wahlkampftyp, area]);
  if (wahlkampftyp) return query('SELECT * FROM wahlkreise WHERE guildId=? AND wahlkampftyp=? ORDER BY position,name', [guildId, wahlkampftyp]);
  return query('SELECT * FROM wahlkreise WHERE guildId=? ORDER BY position,name', [guildId]);
}

async function addDistrict(guildId, name, wahlkampftyp = 'bundestag', area = 'hansebund') {
  const existing = await listDistricts(guildId, wahlkampftyp);
  const district = { id: randomUUID(), guildId, wahlkampftyp, name, position: existing.length + 1, status: 'green', area };
  await run('INSERT INTO wahlkreise (id,guildId,wahlkampftyp,name,position,status,area) VALUES (?,?,?,?,?,?,?)', [district.id, district.guildId, district.wahlkampftyp, district.name, district.position, district.status, district.area]);
  return district;
}

async function updateDistrict(id, name) {
  await run('UPDATE wahlkreise SET name=? WHERE id=?', [name, id]);
  return getDistrict(id);
}

async function updateDistrictStatus(id, status) {
  await run('UPDATE wahlkreise SET status=? WHERE id=?', [status, id]);
  return getDistrict(id);
}

async function deleteDistrict(id) {
  await run('DELETE FROM wahlkreise WHERE id=?', [id]);
}

async function getDistrict(id) {
  const rows = await query('SELECT * FROM wahlkreise WHERE id=?', [id]);
  return rows[0] || null;
}

module.exports = { listDistricts, addDistrict, updateDistrict, updateDistrictStatus, deleteDistrict, getDistrict };
