/**
 * @file help.js
 * @description Slash command that replies with the bot's text-command help information,
 * listing available commands and their usage.
 */

const { babaHelp } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('Shows text command help'),
	/**
	 * Replies immediately with the bot's text-command help message.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
		await interaction.reply(babaHelp());
	},
};