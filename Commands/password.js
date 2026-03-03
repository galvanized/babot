/**
 * @file password.js
 * @description Slash command that replies with the GTL server game password stored in
 * the bot configuration file (babotdata.json). The password is sent as a public reply.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const babadata = require('../babotdata.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('password')
		.setDescription('Gives you the GTL Server Password'),
	/**
	 * Replies immediately with the GTL server game password read from babotdata.json.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
		await interaction.reply(`${babadata.pass}`);
	},
};