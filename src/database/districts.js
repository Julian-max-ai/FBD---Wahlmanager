const { randomUUID } = require('crypto');
const { db } = require('./db');

function listDistricts(guildId) {
  return db.prepare('SELECT * FROM wahlkreise WHERE guildId = ? ORDER BY position, name').all(guildId);
}

function addDistrict(guildId, name) {
  const nextPosition = listDistricts(guildId).length + 1;
  const district = {
    id: randomUUID(),
    guildId,
    name,
    position: nextPosition,
  };
  db.prepare('INSERT INTO wahlkreise (id, guildId, name, position) VALUES (?, ?, ?, ?)').run(district.id, district.guildId, district.name, district.position);
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

module.exports = {
  listDistricts,
  addDistrict,
  updateDistrict,
  deleteDistrict,
  getDistrict,
};
