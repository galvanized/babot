/**
 * @file goodberrys.js
 * @description Slash command that retrieves upcoming Goodberry's D&D ice cream flavor
 * calendar events. Optionally filters by flavor name (string) or specific day of the
 * month (integer). Results are sorted chronologically and displayed as a list.
 */

const { babaGoodberrys } = require('../Functions/commandFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('goodberrys')
		.setDescription('Gets the Goodberrys flavor of the day!')
		.addStringOption(option => option.setName('flavor')
			.setDescription('Search for a flavor of the day in the next month-ish'))
		.addIntegerOption(option => option.setName('day')
			.setDescription('Search for a flavor of the day on a specific day in the next month-ish')),
	/**
	 * Fetches Goodberry's upcoming D&D ice cream flavor calendar events, optionally
	 * filtering by flavor name or day of the month, sorts them chronologically, and
	 * replies with a formatted list.
	 *
	 * @async
	 * @param {Discord.Interaction} interaction - The slash command interaction object.
	 * @param {Discord.Client} bot - The Discord client instance.
	 * @returns {Promise<void>}
	 */
	async execute(interaction, bot) {
		await interaction.deferReply();

		babaGoodberrys(function(val)
		{
			var flavor = interaction.options.getString('flavor');
			var day = interaction.options.getInteger('day');

			var evnts = val.events;
			
			if (flavor != null)
				evnts = evnts.filter(v => v.summary.toLowerCase().includes(flavor.toLowerCase()));
			if (day != null)
				evnts = evnts.filter(v => v.start.getDate() == day);
			
			// sort events by date
			evnts.sort(function(a, b)
			{
				return a.start - b.start;
			});

			var resp = '';
			for (var i = 0; i < evnts.length; i++)
			{
				var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
				
				resp += evnts[i].summary + ' on ' + evnts[i].start.toLocaleDateString('en-US', options) + '\n';
			}

			if (resp == '')
				resp = 'No events found';

			interaction.editReply(resp);
		});
	},
};