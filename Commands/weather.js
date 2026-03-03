/**
 * @file weather.js
 * @description Slash command that returns weather information for a specified city
 * (defaults to Apex, NC). The required `mode` option selects between a three-day
 * forecast view or a temperature graph. An optional `city` option allows custom locations.
 */

const { SlashCommandBuilder } = require('@discordjs/builders');
const { babaWeather } = require('../Functions/commandFunctions.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('weather')
		.setDescription('Gives weather for the selected location, defaults to Apex, NC!')
		.addStringOption(option =>
			option.setName('mode')
				.setDescription('The mode of the weather data!')
				.setRequired(true)
				.addChoices(
					{ name: "Three Day Forcast", value: "four" },
					{ name: "Temperature Graph", value: "deets" }            
				))
        .addStringOption(option => option.setName('city').setDescription('The city to get the weather for!')),
	/**
	 * Fetches weather information for the specified city (defaults to Apex, NC) using
	 * the chosen mode (three-day forecast or temperature graph) and replies with the
	 * result.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
		await interaction.deferReply();
        var city = interaction.options.getString('city');
		var mode = interaction.options.getString('mode');
        if (city == null)
            city = "Apex";
            
		babaWeather(mode, city, function(val)
		{
			interaction.editReply(val);
		});
	},
};