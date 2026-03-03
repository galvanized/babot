/**
 * @file deployCommands.js
 * @description
 * One-shot script to register all slash commands with a specific Discord guild
 * via the Discord REST API.
 *
 * Behavior:
 * - Reads `clientId`, `guildId`, and `token` from `babotdata.json`.
 * - Scans `./Commands/` for all `.js` files, `require`s each one, and collects
 *   the serialized `data.toJSON()` slash command definition.
 * - Sends a `PUT` request to `Routes.applicationGuildCommands(clientId, guildId)`
 *   which replaces ALL existing guild-scoped commands atomically.
 * - Logs success or prints the error on failure.
 *
 * Usage: `node deployCommands.js`
 * This should be run once after adding, renaming, or removing slash commands.
 * It is not executed automatically by `babot.js`.
 *
 * Note: Uses discord-api-types v9 `Routes`; ensure versions are compatible.
 */
const fs = require('fs');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { clientId, guildId, token } = require('./babotdata.json');

const commands = [];
const commandFiles = fs.readdirSync('./Commands').filter((file) => file.endsWith('.js')); //get all .js files in the commands folder

for (const file of commandFiles) {
  //adds all commands in the commands folder to the commands array
  const command = require(`./Commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '9' }).setToken(token);

rest
  .put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
  .then(() => console.log('Successfully registered application commands.'))
  .catch(console.error);
