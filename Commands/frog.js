/**
 * @file frog.js
 * @description Slash command that returns a randomly generated funny frog text string
 * for the invoking user, using their Discord user ID as a seed.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { funnyFrogText } = require("../Functions/HelperFunctions/slashFridayHelpers.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('frog')
		.setDescription('FROG!'),
	/**
	 * Generates a random funny frog text string seeded on the invoking user's ID and
	 * replies with it.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
		await interaction.deferReply();
        var text = funnyFrogText(interaction.user.id);
		await interaction.editReply(text);
	},
};