const { randomUUID } = require('crypto');
const { db } = require('./db');

async function listDistricts(guildId, wahlkampftyp) {
  const res = wahlkampftyp
    ? await db.execute({ sql: 'SELECT * FROM wahlkreise WHERE guildId = ? AND wahlkampftyp = ? ORDER BY position, name', args: [guildId, wahlkampftyp] })
    : await db.execute({ sql: 'SELECT * FROM wahlkreise WHERE guildId = ? ORDER BY position, name', args: [guildId] });
  return res.rows;
}

async function addDistrict(guildId, name, wahlkampftyp = 'bundestag') {
  const existing = await listDistricts(guildId, wahlkampftyp);
  const district = { id: randomUUID(), guildId, wahlkampftyp, name, position: existing.length + 1, status: 'green' };
  await db.execute({
    sql: 'INSERT INTO wahlkreise (id, guildId, wahlkampftyp, name, position, status) VALUES (?,?,?,?,?,?)',
    args: [district.id, district.guildId, district.wahlkampftyp, district.name, district.position, district.status],
  });
  return district;
}

async function updateDistrict(id, name) {
  await db.execute({ sql: 'UPDATE wahlkreise SET name = ? WHERE id = ?', args: [name, id] });
  return getDistrict(id);
}

async function updateDistrictStatus(id, status) {
  await db.execute({ sql: 'UPDATE wahlkreise SET status = ? WHERE id = ?', args: [status, id] });
  return getDistrict(id);
}

async function deleteDistrict(id) {
  await db.execute({ sql: 'DELETE FROM wahlkreise WHERE id = ?', args: [id] });
}

async function getDistrict(id) {
  const res = await db.execute({ sql: 'SELECT * FROM wahlkreise WHERE id = ?', args: [id] });
  return res.rows[0] || null;
}

module.exports = { listDistricts, addDistrict, updateDistrict, updateDistrictStatus, deleteDistrict, getDistrict };
