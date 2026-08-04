const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const token = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('BOT_TOKEN und CLIENT_ID müssen als Umgebungsvariablen gesetzt sein.');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Registriere ${commands.length} Slash-Commands...`);
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Slash-Commands erfolgreich registriert.');
  } catch (error) {
    console.error(error);
  }
})();
