/**
 * @file aurora.js
 * @description Slash command that displays the latest aurora forecast from the National
 * Oceanic and Atmospheric Administration (NOAA). The user must choose between tonight's
 * forecast or tomorrow night's forecast via the required `time` option.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { babaAurora } = require('../Functions/commandFunctions.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('aurora')
		.setDescription('Displays the latest aurora info from the National Oceanic and Atmospheric Administration')
        .addStringOption(option => option.setName('time')
			.setRequired(true)
			.setDescription('Choose the time of the aurora forecast')
			.addChoices(
                {name: 'Today', value: 'tonights'},
				{name: 'Tomorrow', value: 'tomorrow_nights'})),
	/**
	 * Fetches the aurora forecast for the selected time period from NOAA and replies
	 * with the result.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
		await interaction.deferReply();
		var time = interaction.options.getString('time');
		babaAurora(time, function(val)
		{
			interaction.editReply(val);
		});
	},
};