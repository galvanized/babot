/**
 * @file rng.js
 * @description Slash command that generates a random number between `min` (default 0)
 * and `max` (default min + 100). Optionally wraps the result in a spoiler tag when the
 * `spoiler` option is true.
 */

const { babaRNG } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('rng')
		.setDescription('Generates a random number!')
        .addNumberOption(option => option.setName('min').setDescription('the minimum number - Default: 0'))
        .addNumberOption(option => option.setName('max').setDescription('the minimum number - Default: 100 greater than min'))
        .addBooleanOption(option => option.setName('spoiler').setDescription('if true, the number message be hidden - Default: false')),
	/**
	 * Generates a random number between `min` (default 0) and `max` (default min + 100),
	 * optionally formatting it as a spoiler, and replies immediately.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
        var min = interaction.options.getNumber('min');
        var max = interaction.options.getNumber('max');
        var spoiler = interaction.options.getBoolean('spoiler');

        if (min == null) min = 0;
        if (max == null) max = min + 100;
        if (spoiler == null) spoiler = false;

		await interaction.reply(babaRNG(min, max, spoiler));
	},
};