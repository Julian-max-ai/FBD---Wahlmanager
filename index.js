const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const { BOT_TOKEN } = require('./src/utils/config');

// HTTP-Server damit Render keinen Port-Fehler wirft
http.createServer((req, res) => res.end('Bot läuft.')).listen(process.env.PORT || 3000);

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'src', 'commands');
for (const file of fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
  const readyHandler = require('./src/events/ready');
  await readyHandler(client);
});

client.on('interactionCreate', async interaction => {
  const interactionHandler = require('./src/events/interactionCreate');
  await interactionHandler(client, interaction);
});

client.login(BOT_TOKEN);
