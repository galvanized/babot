/**
 * @file jeremy.js
 * @description Slash command that generates and returns a random "Jeremy-style" username
 * composed of an adjective and an animal name.
 */

const { babaJeremy } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('jeremy')
		.setDescription('Creates a username in the Jeremy way!'),
	/**
	 * Generates a random Jeremy-style adjective+animal username and replies with it
	 * immediately.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
		await interaction.reply(babaJeremy());
	},
};