const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const { BOT_TOKEN } = require('./src/utils/config');

http.createServer((req, res) => res.end('Bot läuft.')).listen(process.env.PORT || 3000);
console.log('HTTP Server gestartet');

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required.');
console.log('BOT_TOKEN vorhanden:', !!BOT_TOKEN);
console.log('BOT_TOKEN Länge:', BOT_TOKEN.length);
console.log('TURSO_URL vorhanden:', !!process.env.TURSO_DATABASE_URL);
console.log('TURSO_TOKEN vorhanden:', !!process.env.TURSO_AUTH_TOKEN);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'src', 'commands');
console.log('Lade Commands...');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
  console.log('Command geladen:', command.data.name);
}
console.log('Commands geladen, starte Login...');

client.once('ready', async () => {
  const readyHandler = require('./src/events/ready');
  await readyHandler(client);
});

client.on('interactionCreate', async interaction => {
  const interactionHandler = require('./src/events/interactionCreate');
  await interactionHandler(client, interaction);
});

console.log('Versuche Login...');
const loginTimeout = setTimeout(() => {
  console.error('Login Timeout nach 15s — Token ungültig oder Discord nicht erreichbar');
  process.exit(1);
}, 15000);

client.login(BOT_TOKEN)
  .then(() => { clearTimeout(loginTimeout); console.log('Login erfolgreich'); })
  .catch(err => { clearTimeout(loginTimeout); console.error('Login Fehler:', err.message); process.exit(1); });
