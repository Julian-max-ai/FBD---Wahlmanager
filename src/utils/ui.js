const { EmbedBuilder } = require('discord.js');

/** Nur Optik. Keine Logik. */
const C = {
  brand: 0x1B2435,
  gold: 0xE8C36A,
  mint: 0x5EEAD4,
  ok: 0x34D399,
  warn: 0xFBBF24,
  err: 0xFB7185,
  mute: 0x64748B,
  panel: 0x243044,
  campaign: 0x2DD4BF,
  poster: 0xF472B6,
  archive: 0x475569,
};

const FOOTER = { text: 'FBD  ·  Wahlkampfverwaltung' };
const RULE = '─'.repeat(28);

function wideBar(left = 'FBD', mid = 'Wahlmanager', right = 'live') {
  return [
    { name: '\u200b', value: `\`${pad(left, 14)}\``, inline: true },
    { name: '\u200b', value: `\`${pad(mid, 16)}\``, inline: true },
    { name: '\u200b', value: `\`${pad(right, 12)}\``, inline: true },
  ];
}

function pad(text, n) {
  const s = String(text).slice(0, n);
  const space = Math.max(0, n - s.length);
  const l = Math.floor(space / 2);
  return ' '.repeat(l) + s + ' '.repeat(space - l);
}

function applyThumb(embed, guild) {
  const url = guild?.iconURL?.({ size: 256 });
  if (url) embed.setThumbnail(url);
  return embed;
}

function base({ color, author, title, description, fields, image, footer, timestamp, guild } = {}) {
  const e = new EmbedBuilder().setColor(color ?? C.brand);
  if (author) e.setAuthor({ name: author });
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (fields?.length) e.addFields(fields);
  if (image) e.setImage(image);
  e.setFooter(footer || FOOTER);
  if (timestamp !== false) e.setTimestamp(timestamp instanceof Date ? timestamp : new Date());
  return applyThumb(e, guild);
}

function prompt(title, description, extraFields = []) {
  return base({
    color: C.gold,
    author: '✦  Auswahl',
    title,
    description: `${description}\n${RULE}`,
    fields: [...wideBar('wählen', 'nächster Schritt', 'FBD'), ...extraFields],
  });
}

function notice(kind, title, description, extraFields = []) {
  const map = { ok: C.ok, err: C.err, warn: C.warn, info: C.brand, wait: C.mute };
  const authors = {
    ok: '✓  Erledigt',
    err: '✕  Nicht möglich',
    warn: '⚠  Achtung',
    info: '✦  Hinweis',
    wait: '…  Einen Moment',
  };
  return base({
    color: map[kind] || C.brand,
    author: authors[kind] || '✦  FBD',
    title,
    description,
    fields: extraFields.length ? extraFields : wideBar(),
  });
}

function listEmbed(title, description, fieldName, fieldValue) {
  return base({
    color: C.brand,
    author: '✦  Übersicht',
    title,
    description: description ? `${description}\n${RULE}` : RULE,
    fields: [
      ...wideBar('liste', 'aktuell', 'FBD'),
      { name: fieldName, value: fieldValue || '*Keine Einträge.*' },
    ],
  });
}

function leaderboardEmbed(title, rows) {
  const medals = ['🥇', '🥈', '🥉'];
  const value = rows.length
    ? rows.map((line, i) => (i < 3 ? `${medals[i]}  ${line}` : `\` ${String(i + 1).padStart(2, ' ')} \`  ${line}`)).join('\n')
    : '*Noch keine Punkte.*';
  return base({
    color: C.gold,
    author: '✦  Aktivität',
    title,
    description: `Rangliste der Mitglieder\n${RULE}`,
    fields: [...wideBar('punkte', 'wahlkampf', 'live'), { name: 'Rangliste', value }],
  });
}

function reviewEmbed({ username, imageUrl, districtLine, bgSource, requestId, guild }) {
  const fields = [
    ...wideBar('prüfung', 'vorstand', 'neu'),
    { name: 'Absender', value: `**${username}**`, inline: true },
    { name: 'Wahlkreis', value: districtLine || '—', inline: true },
    { name: 'Urheberrecht', value: 'Bestätigt', inline: true },
    { name: 'Hintergrund', value: bgSource || '*Keine Angabe*' },
    { name: 'Bild', value: imageUrl },
  ];
  return base({
    color: C.poster,
    author: '✦  Neue Plakatanfrage',
    title: 'Zur Prüfung eingegangen',
    fields,
    image: imageUrl?.startsWith('http') ? imageUrl : undefined,
    footer: { text: `Anfrage  ·  ${requestId}` },
    guild,
  });
}

module.exports = {
  C, FOOTER, RULE, wideBar, base, prompt, notice, listEmbed, leaderboardEmbed, reviewEmbed, applyThumb,
};
