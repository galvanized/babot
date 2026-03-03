/**
 * @file progress.js
 * @description Slash command that replies with a visual progress bar showing the
 * percentage of the current year that has elapsed. The optional `length` option controls
 * bar width (default 20, capped at 1900 to stay within Discord message limits).
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { babaProgress } = require('../Functions/commandFunctions.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('progress')
		.setDescription('Baba will give you the percentage of time it is throughout the year.')
		.addIntegerOption(option => option.setName('length').setDescription('How long the progress bar is.')), 
	/**
	 * Computes the percentage of the current year elapsed and replies with a visual
	 * progress bar of the specified length (default 20, max 1900).
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
		var length = interaction.options.getInteger('length');
		if (length == null) length = 20;
		if (length > 1900) length = 1900;
		await interaction.deferReply();
        await interaction.editReply(babaProgress(length));
	},
};