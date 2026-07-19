const { randomUUID } = require('crypto');
const { db } = require('./db');

function listDistricts(guildId, wahlkampftyp) {
  if (wahlkampftyp) {
    return db.prepare('SELECT * FROM wahlkreise WHERE guildId = ? AND wahlkampftyp = ? ORDER BY position, name').all(guildId, wahlkampftyp);
  }
  return db.prepare('SELECT * FROM wahlkreise WHERE guildId = ? ORDER BY position, name').all(guildId);
}

function addDistrict(guildId, name, wahlkampftyp = 'bundestag') {
  const existing = listDistricts(guildId, wahlkampftyp);
  const district = {
    id: randomUUID(),
    guildId,
    wahlkampftyp,
    name,
    position: existing.length + 1,
  };
  db.prepare('INSERT INTO wahlkreise (id, guildId, wahlkampftyp, name, position) VALUES (?, ?, ?, ?, ?)').run(district.id, district.guildId, district.wahlkampftyp, district.name, district.position);
  return district;
}

function updateDistrict(id, name) {
  db.prepare('UPDATE wahlkreise SET name = ? WHERE id = ?').run(name, id);
  return db.prepare('SELECT * FROM wahlkreise WHERE id = ?').get(id);
}

function deleteDistrict(id) {
  db.prepare('DELETE FROM wahlkreise WHERE id = ?').run(id);
}

function getDistrict(id) {
  return db.prepare('SELECT * FROM wahlkreise WHERE id = ?').get(id) || null;
}

module.exports = { listDistricts, addDistrict, updateDistrict, deleteDistrict, getDistrict };
